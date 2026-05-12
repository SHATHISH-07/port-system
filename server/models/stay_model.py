import logging
import os

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, VotingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from config import settings
from models.training_status import training_status
from utils.feature_utils import create_features
from utils.stay_utils import compute_visit_stay, prepare_visit_data

logger = logging.getLogger("port_system")


# ─────────────────────────────────────────────────────────────────────────────
# Model builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_ensemble() -> VotingRegressor:
    ridge = Pipeline([
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=10.0)),
    ])
    xgb = XGBRegressor(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.06,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        reg_alpha=0.5,
        reg_lambda=2.0,
        random_state=42,
        verbosity=0,
    )
    gbr = GradientBoostingRegressor(
        n_estimators=120,
        max_depth=3,
        learning_rate=0.08,
        subsample=0.8,
        min_samples_leaf=5,
        random_state=42,
    )
    return VotingRegressor(
        estimators=[("ridge", ridge), ("xgb", xgb), ("gbr", gbr)]
    )


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────

def train_stay_model(df: pd.DataFrame, config: dict = None):
    try:
        training_status.set("training", "Training started")
        logger.info("ML training started")

        cfg = config or {}
        min_hours     = cfg.get("min_hours",     settings.TRAIN_MIN_HOURS)
        max_hours     = cfg.get("max_hours",      settings.TRAIN_MAX_HOURS)
        min_visit_rows = cfg.get("min_visit_rows", settings.MIN_VISIT_ROWS)

        # ── Load all crane data once ─────────────────────────────────────────
        from db.queries import load_from_db
        logger.info("Loading all crane movements for enrichment …")
        all_crane_df = load_from_db("crane")

        # Build a fast lookup: carrier_visit → sub-DataFrame
        crane_by_visit: dict[str, pd.DataFrame] = {}
        if not all_crane_df.empty:
            # Normalise time column
            if "time_completed" in all_crane_df.columns:
                all_crane_df["crane_time"] = pd.to_datetime(
                    all_crane_df["time_completed"], errors="coerce"
                )
            else:
                all_crane_df["crane_time"] = pd.NaT

            for visit_val, grp in all_crane_df.groupby("carrier_visit"):
                crane_by_visit[str(visit_val)] = grp.copy()

        # ── Iterate visits ───────────────────────────────────────────────────
        grouped = df.groupby("actual_outbound_carrier_visit_id")

        X_rows, y_vals = [], []
        skipped_rows  = 0
        skipped_noise = 0
        skipped_error = 0

        for visit_id, group in grouped:
            if len(group) < min_visit_rows:
                skipped_rows += 1
                continue

            visit_group = group.copy()
            visit_id_str = str(visit_id)

            # ── Crane enrichment ─────────────────────────────────────────────
            crane_grp = crane_by_visit.get(visit_id_str)
            if crane_grp is not None and not crane_grp.empty:
                valid = (
                    crane_grp[crane_grp["exclude"] != "Yes"]
                    if "exclude" in crane_grp.columns
                    else crane_grp
                )
                if not valid.empty:
                    c_count = int(valid["crane_id"].nunique())
                    min_t   = valid["crane_time"].min()
                    max_t   = valid["crane_time"].max()
                    dur     = (
                        max((max_t - min_t).total_seconds() / 3600, 0.1)
                        if pd.notna(min_t) and pd.notna(max_t) else 0.1
                    )
                    eff     = len(valid)
                    mphc    = (eff / dur) / c_count if c_count > 0 else 0.0
                    restows = (
                        len(valid[valid["move_kind"].isin(["RESTOW", "SHIFT"])])
                        if "move_kind" in valid.columns else 0
                    )

                    visit_group["_crane_count"]          = float(c_count)
                    visit_group["_crane_mphc"]           = float(min(mphc, 999.0))
                    visit_group["_crane_duration_hours"] = float(dur)
                    visit_group["_crane_intensity"]      = float(eff / max(len(group), 1))
                    visit_group["_crane_restow_ratio"]   = float(
                        restows / eff if eff > 0 else 0.0
                    )
                    visit_group["_crane_exclude_ratio"]  = float(
                        (len(crane_grp) - eff) / len(crane_grp)
                        if len(crane_grp) > 0 else 0.0
                    )

            visit_df = prepare_visit_data(visit_group)
            stay     = compute_visit_stay(visit_df)

            if stay is None:
                continue
            if stay < min_hours:
                skipped_noise += 1
                continue
            if stay > max_hours:
                skipped_error += 1
                continue

            features = create_features(visit_df)
            if features is None:
                continue

            X_rows.append([features[f] for f in settings.FEATURE_NAMES])
            y_vals.append(stay)

        # ── Validate ─────────────────────────────────────────────────────────
        if not X_rows:
            raise Exception(
                f"No training data after filtering "
                f"(noise={skipped_noise}, errors={skipped_error}, "
                f"short_visits={skipped_rows})"
            )

        X = pd.DataFrame(X_rows, columns=settings.FEATURE_NAMES)
        y = pd.Series(y_vals)

        print(f"[OK] Training samples    : {len(X)}")
        print(f"     Skipped (< {min_visit_rows} rows) : {skipped_rows}")
        print(f"     Skipped (< {min_hours}h)     : {skipped_noise}")
        print(f"     Skipped (> {max_hours}h)   : {skipped_error}")
        print(f"     Target range       : {y.min():.1f}h – {y.max():.1f}h")
        print(f"     Target mean        : {y.mean():.1f}h")
        print(f"     Model type         : VotingRegressor (Ridge + XGBoost + GBR)")
        logger.info(
            f"ML training: {len(X)} samples, target mean={y.mean():.1f}h"
        )

        # ── Fit ──────────────────────────────────────────────────────────────
        model = _build_ensemble()
        model.fit(X, y)

        os.makedirs(os.path.dirname(settings.MODEL_PATH), exist_ok=True)
        joblib.dump({"model": model, "features": settings.FEATURE_NAMES}, settings.MODEL_PATH)

        global _cached_model_bundle
        _cached_model_bundle = None

        training_status.set("completed", "Model trained successfully")
        print("[OK] Model trained and saved →", settings.MODEL_PATH)
        logger.info("ML training completed successfully")

        # ── Record model version in DB ────────────────────────────────────────
        _record_model_version(len(X), y, config)

    except Exception as e:
        training_status.set("failed", str(e))
        logger.error(f"ML training failed: {e}")
        print("[ERR] Training failed:", str(e))


def _record_model_version(n_samples: int, y: pd.Series, config: dict):
    try:
        from db.connection import get_engine
        from sqlalchemy import text
        import json as _json
        from datetime import datetime, timezone

        _engine = get_engine()
        _now    = datetime.now(timezone.utc)
        _vtag   = _now.strftime("%Y%m%d_%H%M%S")

        with _engine.begin() as _conn:
            fc_row = _conn.execute(text("""
                INSERT INTO feature_configs
                    (name, description, feature_names, created_at, updated_at)
                VALUES
                    ('default', 'Default VotingRegressor features',
                     CAST(:fn AS JSONB), :now, :now)
                ON CONFLICT (name) DO UPDATE SET updated_at = EXCLUDED.updated_at
                RETURNING id
            """), {
                "fn":  _json.dumps(settings.FEATURE_NAMES),
                "now": _now,
            }).fetchone()
            fc_id = fc_row[0]

            _conn.execute(text("""
                UPDATE model_versions SET status = 'retired', updated_at = :now
                WHERE model_name = 'vessel_stay' AND status = 'active'
            """), {"now": _now})

            _conn.execute(text("""
                INSERT INTO model_versions
                    (model_name, version, artifact_path, feature_config_id,
                     dataset_size, metrics, status, notes,
                     trained_at, promoted_at, created_at, updated_at)
                VALUES
                    ('vessel_stay', :ver, :path, :fcid,
                     :size, CAST(:metrics AS JSONB), 'active',
                     'Auto-trained via pipeline',
                     :now, :now, :now, :now)
                ON CONFLICT (version) DO UPDATE SET
                    status      = 'active',
                    promoted_at = EXCLUDED.promoted_at,
                    updated_at  = EXCLUDED.updated_at
            """), {
                "ver":     _vtag,
                "path":    settings.MODEL_PATH,
                "fcid":    fc_id,
                "size":    n_samples,
                "metrics": _json.dumps({
                    "sample_count":  n_samples,
                    "target_mean":   round(float(y.mean()), 2),
                    "target_min":    round(float(y.min()), 2),
                    "target_max":    round(float(y.max()), 2),
                }),
                "now": _now,
            })
            logger.info(f"[ML] Model version recorded: vessel_stay@{_vtag}")
    except Exception as _ve:
        logger.warning(f"[ML] Could not record model version (non-fatal): {_ve}")


# ─────────────────────────────────────────────────────────────────────────────
# Model loading  (cached)
# ─────────────────────────────────────────────────────────────────────────────

_cached_model_bundle = None


def load_stay_model():
    global _cached_model_bundle
    if _cached_model_bundle is not None:
        return _cached_model_bundle

    if not os.path.exists(settings.MODEL_PATH):
        return None

    bundle = joblib.load(settings.MODEL_PATH)

    if bundle.get("features") != settings.FEATURE_NAMES:
        logger.error(
            "Model feature mismatch. Bundle has %s, settings expects %s",
            bundle.get("features"), settings.FEATURE_NAMES,
        )
        return {"error": "Model features outdated — retrain required"}

    _cached_model_bundle = bundle
    return _cached_model_bundle


# ─────────────────────────────────────────────────────────────────────────────
# Single-visit prediction
# ─────────────────────────────────────────────────────────────────────────────

def predict_visit_stay_duration(
    df: pd.DataFrame,
    target_mph: float = None,
    crane_count_override: float = None,
    mph_override: float = None,
) -> float | dict | None:
    bundle = load_stay_model()
    if bundle is None:
        return {"error": "Model not trained"}
    if isinstance(bundle, dict) and "error" in bundle:
        return bundle

    model         = bundle["model"]
    feature_names = bundle["features"]

    features = create_features(df)
    if features is None:
        return None

    # Apply crane count override (from historical average)
    if crane_count_override and float(crane_count_override) > 0:
        features["crane_count"] = float(crane_count_override)

    # Resolve final MPH to use
    final_mph = None
    if target_mph and float(target_mph) > 0:
        final_mph = float(target_mph)
    elif mph_override and float(mph_override) > 0:
        final_mph = float(mph_override)

    if final_mph:
        features["crane_mphc"] = final_mph
        t_moves  = features.get("total_moves", 100)
        c_count  = max(features.get("crane_count", 2.0), 1.0)
        features["crane_duration_hours"] = t_moves / (c_count * final_mph)

    X    = pd.DataFrame(
        [[features[f] for f in feature_names]],
        columns=feature_names,
    )
    pred = model.predict(X)[0]
    return round(float(pred), 2)


# ─────────────────────────────────────────────────────────────────────────────
# Multi-visit vessel prediction
# ─────────────────────────────────────────────────────────────────────────────

def predict_vessel_stay_duration(
    prepared_visits: dict,
    target_mph: float = None,
    crane_count_override: float = None,
    mph_override: float = None,
) -> dict:
    if not prepared_visits:
        return {"error": "No data found for vessel"}

    preds: list[float] = []
    for visit_id, visit_df in prepared_visits.items():
        if visit_df is None or visit_df.empty:
            continue
        pred = predict_visit_stay_duration(
            visit_df,
            target_mph,
            crane_count_override=crane_count_override,
            mph_override=mph_override,
        )
        if isinstance(pred, dict):
            return pred
        if pred is not None:
            preds.append(pred)

    if not preds:
        return {"error": "No prediction data available"}

    return {
        "avg_hours": round(sum(preds) / len(preds), 2),
        "visits":    len(preds),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Manual/metric-based prediction  (no DataFrame required)
# ─────────────────────────────────────────────────────────────────────────────

def predict_stay_duration_from_metrics(
    loaded: int,
    discharged: int,
    target_mph: float = None,
    historical_crane_avg: float = None,
    historical_mph_avg: float = None,
) -> dict:
    bundle = load_stay_model()
    if bundle is None:
        return {"error": "Model not trained"}
    if isinstance(bundle, dict) and "error" in bundle:
        return bundle

    model         = bundle["model"]
    feature_names = bundle["features"]

    total_moves = loaded + discharged
    imbalance   = abs(loaded - discharged)

    # Resolve crane count
    hist_crane = float(historical_crane_avg) if historical_crane_avg and float(historical_crane_avg) > 0 else None
    crane_count = (
        hist_crane
        if hist_crane
        else (3.0 if total_moves > 300 else 2.0 if total_moves > 100 else 1.0)
    )

    # Resolve MPHC
    hist_mph = float(historical_mph_avg) if historical_mph_avg and float(historical_mph_avg) > 0 else None
    effective_mph = (
        float(target_mph) if target_mph and float(target_mph) > 0
        else hist_mph if hist_mph
        else settings.MOVES_PER_HOUR_PER_CRANE
    )

    crane_duration = max(
        6.0,
        total_moves / (max(crane_count, 1.0) * effective_mph),
    )

    features: dict = {
        "loaded":                 int(loaded),
        "discharged":             int(discharged),
        "total_moves":            int(total_moves),
        "imbalance":              int(imbalance),
        "load_ratio":             loaded / (total_moves + 1),
        "discharge_ratio":        discharged / (total_moves + 1),
        "container_count":        total_moves,
        "avg_weight":             settings.DEFAULT_AVG_WEIGHT_KG,
        "avg_weight_kg":          settings.DEFAULT_AVG_WEIGHT_KG,
        "heavy_count":            int(total_moves * 0.3),
        "reefer_count":           int(total_moves * settings.DEFAULT_REEFER_RATIO),
        "hazard_count":           int(total_moves * settings.DEFAULT_HAZARD_RATIO),
        "oog_count":              int(total_moves * settings.DEFAULT_OOG_RATIO),
        "service_hash":           123456,
        "move_span_hours":        crane_duration,
        "restow_intensity":       1.0,
        "block_concentration":    0.5,
        "crane_count":            crane_count,
        "crane_mphc":             effective_mph,
        "crane_intensity":        1.0,
        "crane_duration_hours":   crane_duration,
        "crane_restow_ratio":     0.0,
        "crane_exclude_ratio":    0.0,
        "reefer_equipment_ratio": settings.DEFAULT_REEFER_RATIO,
        "pct_40ft":               0.5,
        "heavy_ratio":            0.3,
    }

    # Fill any remaining feature names with 0
    for f in feature_names:
        if f not in features:
            features[f] = 0.0

    X        = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
    pred     = model.predict(X)[0]
    avg_hours = round(float(pred), 2)

    # Derived metrics
    predicted_cranes = (
        max(1, round((total_moves / avg_hours) / settings.MOVES_PER_HOUR_PER_CRANE))
        if avg_hours > 0 else 1
    )
    suitable_berth = (
        settings.BERTH_HIGH_LABEL if total_moves > settings.BERTH_HIGH_VOLUME_THRESHOLD
        else settings.BERTH_MED_LABEL if total_moves > settings.BERTH_MED_VOLUME_THRESHOLD
        else settings.BERTH_LOW_LABEL
    )
    cargo_concentration = (
        "100.0%" if total_moves > settings.BERTH_HIGH_VOLUME_THRESHOLD else "50.0%"
    )

    return {
        "mode":   "manual",
        "vessel": None,
        "actual": {"visits": {}, "avg_hours": None},
        "predicted": {"avg_hours": avg_hours, "visits": 1},
        "risks": [
            f"Expected {predicted_cranes} cranes required to maintain standard productivity."
        ],
        "execution_plan": [
            f"Assign vessel to {suitable_berth} based on volume.",
            f"Deploy {predicted_cranes} cranes for {avg_hours} hours.",
        ],
        "berth_analysis": [{
            "berth":               suitable_berth,
            "block":               "A",
            "cargo_concentration": cargo_concentration,
            "recommended_cranes":  predicted_cranes,
            "total_travel_distance": "Low",
            "congestion_risk":     "Low",
        }],
        "input": {"loaded": loaded, "discharged": discharged},
    }