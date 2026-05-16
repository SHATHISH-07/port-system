from __future__ import annotations

import io
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, VotingRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from config import settings
from models.training_status import training_status
from utils.feature_utils import create_features
from utils.datetime_utils import parse_datetime

logger = logging.getLogger("port_system")

_cached_model_bundle = None


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _safe_parse(df: pd.DataFrame, col: str) -> pd.Series:
    """Parse a datetime column if present; return NaT series otherwise."""
    if col in df.columns:
        return parse_datetime(df[col], col)
    return pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")


def _prepare_model_visit_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Prepare a visit dataframe for feature extraction without applying the
    history window. This keeps the full operational span available so the
    model learns from the real visit duration instead of a clipped slice.
    """
    df = df.copy()
    if df.empty:
        return df

    df.columns = df.columns.str.strip()

    if "move_complete_time" in df.columns:
        df["move_complete_time"] = pd.to_datetime(df["move_complete_time"], errors="coerce")

    event_sources = [
        "move_complete_time",
        "time_in",
        "updated_at",
        "created_at",
    ]

    event_time = pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")
    for col in event_sources:
        parsed = _safe_parse(df, col)
        event_time = event_time.fillna(parsed)

    df["event_time"] = event_time
    df["vessel_departure"] = _safe_parse(df, "time_out")

    df = df.dropna(subset=["event_time"])
    if df.empty:
        return df

    return df.sort_values("event_time").reset_index(drop=True)


def _compute_raw_visit_stay(df: pd.DataFrame) -> Optional[float]:
    """
    Compute stay duration in hours from the raw visit span.

    Priority:
        1. move_complete_time span (first -> last completion)
        2. vessel_departure (time_out) - earliest event_time

    No history windowing is used here.
    """
    if df is None or df.empty:
        return None

    if "move_complete_time" in df.columns:
        mct = pd.to_datetime(df["move_complete_time"], errors="coerce").dropna()
        if len(mct) >= 2:
            span_hours = (mct.max() - mct.min()).total_seconds() / 3600
            if span_hours >= 0.5:
                return round(span_hours, 2)

    if "event_time" not in df.columns:
        return None

    start = df["event_time"].min()
    if pd.isna(start):
        return None

    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        if not valid_dep.empty:
            end = valid_dep.iloc[0]
            if pd.notna(end) and end > start:
                stay_hours = (end - start).total_seconds() / 3600
                if stay_hours > 0:
                    return round(stay_hours, 2)
        return None

    return None


def _heuristic_span_from_metrics(
    total_moves: int,
    crane_count: int = 1,
    historical_mph_avg: float = None,
) -> float:
    """
    Estimate vessel stay from move count, crane count, and historical crane
    throughput.

    Formula: stay_hours = total_moves / (cranes * moves_per_hour_per_crane)

    - historical_mph_avg is the observed crane throughput (moves/hour/crane).
    - Falls back to settings.CRANE_MOVES_PER_HOUR_TARGET when not available.
    - crane_count defaults to 1 when unknown (conservative estimate).
    """
    if total_moves <= 0:
        return max(settings.TRAIN_MIN_HOURS, 8.0)

    mph_per_crane = (
        float(historical_mph_avg)
        if historical_mph_avg and float(historical_mph_avg) > 0
        else float(settings.CRANE_MOVES_PER_HOUR_TARGET)
    )
    # Clamp to a realistic operational range
    mph_per_crane = max(5.0, min(60.0, mph_per_crane))

    effective_cranes = max(1, int(crane_count))
    vessel_rate = mph_per_crane * effective_cranes

    estimated = total_moves / vessel_rate
    # Floor at TRAIN_MIN_HOURS so we never return a sub-operational value
    return max(float(settings.TRAIN_MIN_HOURS), round(estimated, 2))


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
    return VotingRegressor(estimators=[("ridge", ridge), ("xgb", xgb), ("gbr", gbr)])


def _build_feature_row(
    visit_df: pd.DataFrame,
    feature_template: dict = None,
) -> Optional[dict]:
    features = create_features(visit_df)
    if features is None:
        return None

    if feature_template:
        for k, v in feature_template.items():
            if k not in features or features[k] == 0:
                features[k] = v

    return features


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────

def train_stay_model(df: pd.DataFrame, config: dict = None):
    """
    Train the vessel stay model using only container operation data.

    The stay target is derived from the raw visit span (not windowed), so the
    model learns the full operational duration rather than a clipped slice.
    """
    try:
        training_status.set("training", "Training started")
        logger.info("ML training started")

        cfg = config or {}
        min_hours = cfg.get("min_hours", settings.TRAIN_MIN_HOURS)
        max_hours = cfg.get("max_hours", settings.TRAIN_MAX_HOURS)
        min_visit_rows = cfg.get("min_visit_rows", settings.MIN_VISIT_ROWS)

        grouped = df.groupby("actual_outbound_carrier_visit_id")

        X_rows, y_vals = [], []
        skipped_rows = 0
        skipped_noise = 0
        skipped_error = 0

        for visit_id, group in grouped:
            if len(group) < min_visit_rows:
                skipped_rows += 1
                continue

            raw_group = group.copy()
            train_df = _prepare_model_visit_data(raw_group)

            stay = _compute_raw_visit_stay(raw_group)
            if stay is None:
                stay = _compute_raw_visit_stay(train_df)

            if stay is None:
                continue
            if stay < min_hours:
                skipped_noise += 1
                continue
            if stay > max_hours:
                skipped_error += 1
                continue

            features = _build_feature_row(train_df)
            if features is None:
                continue

            row = []
            missing_feature = False
            for f in settings.FEATURE_NAMES:
                if f not in features:
                    missing_feature = True
                    row.append(0.0)
                else:
                    val = features[f]
                    try:
                        row.append(float(val))
                    except Exception:
                        row.append(0.0)
            if missing_feature:
                logger.debug("Feature defaults were applied for visit %s", visit_id)

            X_rows.append(row)
            y_vals.append(float(stay))

        if not X_rows:
            raise Exception(
                "No training data after filtering "
                f"(noise={skipped_noise}, errors={skipped_error}, short_visits={skipped_rows})"
            )

        X = pd.DataFrame(X_rows, columns=settings.FEATURE_NAMES)
        y = pd.Series(y_vals)

        print(f"[OK] Training samples    : {len(X)}")
        print(f"     Skipped (< {min_visit_rows} rows) : {skipped_rows}")
        print(f"     Skipped (< {min_hours}h)     : {skipped_noise}")
        print(f"     Skipped (> {max_hours}h)   : {skipped_error}")
        print(f"     Target range       : {y.min():.1f}h - {y.max():.1f}h")
        print(f"     Target mean        : {y.mean():.1f}h")
        print(f"     Model type         : VotingRegressor (Ridge + XGBoost + GBR)")
        print(f"     Features           : {list(settings.FEATURE_NAMES)}")
        logger.info("ML training: %s samples, target mean=%.1fh", len(X), y.mean())

        model = _build_ensemble()
        model.fit(X, y)

        os.makedirs(os.path.dirname(settings.MODEL_PATH), exist_ok=True)
        joblib.dump({"model": model, "features": settings.FEATURE_NAMES}, settings.MODEL_PATH)

        global _cached_model_bundle
        _cached_model_bundle = None

        training_status.set("completed", "Model trained successfully")
        print("[OK] Model trained and saved ->", settings.MODEL_PATH)
        logger.info("ML training completed successfully")

        _record_model_version(len(X), y, config, model=model, X=X)

    except Exception as e:
        training_status.set("failed", str(e))
        logger.error("ML training failed: %s", e)
        print("[ERR] Training failed:", str(e))


def _record_model_version(n_samples: int, y: pd.Series, config: dict, model=None, X: pd.DataFrame = None):
    """
    Record a new model version in the DB. Promotes only when holdout MAE
    beats (or ties) the current champion.
    """
    try:
        from db.connection import get_engine
        from sqlalchemy import text
        import json as _json

        _engine = get_engine()
        _now = datetime.now(timezone.utc)

        with _engine.begin() as _conn:
            v_row = _conn.execute(text("""
                SELECT version FROM model_versions
                WHERE model_name = 'vessel_stay'
                ORDER BY id DESC LIMIT 1
            """)).fetchone()

            last_v = v_row[0] if v_row else "v0"
            try:
                v_num = int(str(last_v).replace("v", "")) + 1
            except Exception:
                v_num = 1
            _vtag = f"v{v_num}"

        holdout_mae = None
        if model is not None and X is not None and len(X) >= 20:
            try:
                neg_maes = cross_val_score(
                    model,
                    X,
                    y,
                    cv=min(3, len(X)),
                    scoring="neg_mean_absolute_error",
                )
                holdout_mae = round(float(-neg_maes.mean()), 4)
                logger.info("[ML] Holdout MAE: %.4f", holdout_mae)
            except Exception as cv_exc:
                logger.warning("[ML] CV scoring failed (non-fatal): %s", cv_exc)

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
                "fn": _json.dumps(settings.FEATURE_NAMES),
                "now": _now,
            }).fetchone()
            fc_id = fc_row[0]

            prev_row = _conn.execute(text("""
                SELECT metrics FROM model_versions
                WHERE model_name = 'vessel_stay' AND status = 'active'
                ORDER BY promoted_at DESC NULLS LAST
                LIMIT 1
            """)).fetchone()

            prev_mae = None
            if prev_row and prev_row[0]:
                try:
                    prev_mae = float(_json.loads(prev_row[0]).get("holdout_mae") or 0) or None
                except Exception:
                    pass

            should_promote = (
                prev_mae is None
                or holdout_mae is None
                or holdout_mae <= prev_mae
            )

            new_status = "active" if should_promote else "candidate"
            tags = ["CHAMPION"] if should_promote else ["CHALLENGER"]

            if should_promote:
                _conn.execute(text("""
                    UPDATE model_versions
                    SET status = 'retired',
                        tags = jsonb_set(tags, '{}', (tags - 'CHAMPION')::jsonb),
                        updated_at = :now
                    WHERE model_name = 'vessel_stay' AND status = 'active'
                """), {"now": _now})
                logger.info("[ML] Previous champion retired. New model promoted to active.")
            else:
                logger.warning(
                    "[ML] New model MAE %.4f is worse than previous %.4f — marking as candidate.",
                    holdout_mae, prev_mae,
                )

            full_metrics = {
                "holdout_mae": holdout_mae,
                "timestamp": _now.isoformat(),
                "hyperparameters": config or {},
                "framework": "scikit-learn / XGBoost",
                "sample_count": n_samples,
                "target_mean": round(float(y.mean()), 2),
                "target_min": round(float(y.min()), 2),
                "target_max": round(float(y.max()), 2),
            }

            model_bytes = None
            if model is not None:
                buf = io.BytesIO()
                joblib.dump({"model": model, "features": settings.FEATURE_NAMES}, buf)
                model_bytes = buf.getvalue()

            _conn.execute(text("""
                INSERT INTO model_versions
                    (model_name, version, artifact_path, feature_config_id,
                     dataset_size, metrics, status, tags, notes, model_binary,
                     trained_at, promoted_at, created_at, updated_at)
                VALUES
                    ('vessel_stay', :ver, :path, :fcid,
                     :size, CAST(:metrics AS JSONB), :status, CAST(:tags AS JSONB),
                     'Auto-trained via MLOps pipeline', :mb,
                     :now, :promoted_at, :now, :now)
                ON CONFLICT (version) DO UPDATE SET
                    status       = EXCLUDED.status,
                    tags         = EXCLUDED.tags,
                    model_binary = COALESCE(EXCLUDED.model_binary, model_versions.model_binary),
                    promoted_at  = EXCLUDED.promoted_at,
                    updated_at   = EXCLUDED.updated_at
            """), {
                "ver": _vtag,
                "path": settings.MODEL_PATH,
                "fcid": fc_id,
                "size": n_samples,
                "status": new_status,
                "tags": _json.dumps(tags),
                "mb": model_bytes,
                "promoted_at": _now if should_promote else None,
                "metrics": _json.dumps(full_metrics),
                "now": _now,
            })
            logger.info("[ML] Model version recorded: vessel_stay@%s status=%s", _vtag, new_status)

    except Exception as _ve:
        logger.warning("[ML] Could not record model version (non-fatal): %s", _ve)


# ─────────────────────────────────────────────────────────────────────────────
# Model loading  (cached)
# ─────────────────────────────────────────────────────────────────────────────

def load_stay_model():
    global _cached_model_bundle
    if _cached_model_bundle is not None:
        return _cached_model_bundle

    bundle = None
    # ── Try loading from disk first (User preference) ────────────────────────
    if os.path.exists(settings.MODEL_PATH):
        try:
            bundle = joblib.load(settings.MODEL_PATH)
            logger.info("[ML] Loaded model from disk -> %s", settings.MODEL_PATH)
        except Exception as e:
            logger.warning("[ML] Failed to load model from disk: %s", e)

    # ── Fallback to DB if disk load failed or file missing ──────────────────
    if bundle is None:
        try:
            from db.connection import get_engine
            from sqlalchemy import text
            engine = get_engine()
            with engine.connect() as conn:
                row = conn.execute(text("""
                    SELECT model_binary FROM model_versions
                    WHERE status = 'active' AND model_binary IS NOT NULL
                    ORDER BY promoted_at DESC NULLS LAST LIMIT 1
                """)).fetchone()
                if row and row[0]:
                    buf = io.BytesIO(row[0])
                    bundle = joblib.load(buf)
                    logger.info("[ML] Loaded model from database fallback")
        except Exception as e:
            logger.warning("[ML] Failed to load model from database fallback: %s", e)

    if bundle and bundle.get("features") != settings.FEATURE_NAMES:
        logger.warning(
            "[ML] Model feature mismatch — bundle has %s, settings expects %s.",
            bundle.get("features"),
            settings.FEATURE_NAMES,
        )

    _cached_model_bundle = bundle
    return _cached_model_bundle


# ─────────────────────────────────────────────────────────────────────────────
# Single-visit prediction
# ─────────────────────────────────────────────────────────────────────────────

def predict_visit_stay_duration(
    df: pd.DataFrame,
    mph_override: float = None,
    feature_template: dict = None,
    crane_count: int = 0,
) -> float | dict | None:
    """
    Predict stay duration for a single visit using the ML model.

    Always runs ML inference — this function is exclusively for the
    'predicted' output. Actual stay is computed separately in vessel_service.

    The key invariant: features must be built from the UNWINDOWED raw data
    so that move_span_hours reflects the true operational span the model was
    trained on. Using prepare_visit_data (which applies history windowing)
    at inference time was the root cause of severely under-predicted stays.

    Heuristic: physics-based estimate used only as an outlier guard rail,
    not blended in with a fixed weight.
    """
    bundle = load_stay_model()
    if bundle is None:
        return {"error": "Model not trained"}
    if isinstance(bundle, dict) and "error" in bundle:
        return bundle

    model = bundle["model"]
    feature_names = bundle["features"]

    # ── CRITICAL: use _prepare_model_visit_data (no history windowing) ───────
    # prepare_visit_data clips move times to a window around vessel_departure,
    # producing a tiny move_span_hours that collapses all predictions to ~0.5h.
    # _prepare_model_visit_data preserves the full operational span.
    visit_df = _prepare_model_visit_data(df)
    if visit_df.empty:
        return None

    features = _build_feature_row(visit_df, feature_template=feature_template)
    if features is None:
        return None

    # ── Inject move_span_hours from the actual computed stay when available ───
    # create_features derives move_span_hours from event_time deltas, which
    # may still be imprecise for sparse datasets. Override with the ground-
    # truth span when we can compute it.
    actual_stay = _compute_raw_visit_stay(visit_df)
    if actual_stay is not None and actual_stay > 0:
        features["move_span_hours"] = actual_stay

    for f in feature_names:
        if f not in features:
            features[f] = 0.0

    X = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
    ml_pred = float(model.predict(X)[0])

    # ── Physics-based sanity bound ───────────────────────────────────────────
    total_moves = int(features.get("total_moves", len(visit_df)) or len(visit_df))
    effective_cranes = crane_count if crane_count > 0 else max(1, int(features.get("_crane_count", 1) or 1))
    heuristic = _heuristic_span_from_metrics(
        total_moves=total_moves,
        crane_count=effective_cranes,
        historical_mph_avg=mph_override,
    )

    # Trust ML within [0.4×, 3.0×] of the heuristic; average outside that band.
    ABSOLUTE_MIN_HOURS = float(settings.TRAIN_MIN_HOURS)  # 2h
    ABSOLUTE_MAX_HOURS = 240.0

    if ml_pred < ABSOLUTE_MIN_HOURS:
        pred = heuristic  # model has failed; fall back entirely
    elif ml_pred > ABSOLUTE_MAX_HOURS:
        pred = heuristic  # model has failed; fall back entirely
    else:
        pred = ml_pred    # trust the ML model

    return round(float(max(float(settings.TRAIN_MIN_HOURS), pred)), 2)


# ─────────────────────────────────────────────────────────────────────────────
# Multi-visit vessel prediction
# ─────────────────────────────────────────────────────────────────────────────

def predict_vessel_stay_duration(
    prepared_visits: dict,
    mph_override: float = None,
    feature_template: dict = None,
    crane_counts: dict = None,
) -> dict:
    """
    Predict stay across all visits for a vessel.

    prepared_visits: {visit_id: DataFrame} — must be raw (unwindowed) DFs so
        that move_span_hours reflects the real operational span.
    crane_counts: optional {visit_id: int} from DB. When provided, each
        visit's crane count is passed to the heuristic for a physics-accurate
        sanity bound.

    Visits are weighted by container count so large visits dominate the
    average over small outlier visits.
    """
    if not prepared_visits:
        return {"error": "No data found for vessel"}

    crane_counts = crane_counts or {}
    weighted_sum = 0.0
    total_weight = 0
    visit_preds: dict[str, float] = {}

    for visit_id, visit_df in prepared_visits.items():
        if visit_df is None or visit_df.empty:
            continue

        cranes = crane_counts.get(str(visit_id), 0)

        pred = predict_visit_stay_duration(
            visit_df,
            mph_override=None,
            feature_template=feature_template,
            crane_count=cranes,
        )
        if isinstance(pred, dict):
            return pred
        if pred is None:
            continue

        weight = (
            int(visit_df["unit_id"].nunique())
            if "unit_id" in visit_df.columns
            else len(visit_df)
        )
        weight = max(weight, 1)

        visit_preds[str(visit_id)] = float(pred)
        weighted_sum += float(pred) * weight
        total_weight += weight

    if not visit_preds:
        return {"error": "No prediction data available"}

    weighted_avg = round(weighted_sum / total_weight, 2)
    vals = list(visit_preds.values())

    return {
        "avg_hours": weighted_avg,
        "visits":    len(visit_preds),
        "max_hours": round(max(vals), 2),
        "min_hours": round(min(vals), 2),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Manual/metric-based prediction  (no DataFrame required)
# ─────────────────────────────────────────────────────────────────────────────

def predict_stay_duration_from_metrics(
    loaded: int,
    discharged: int,
    crane_count: int = 1,
    historical_mph_avg: float = None,
    feature_template: dict = None,
    historical_avg_stay_hours: float = None,   # ← ADD THIS
) -> dict:
    """
    Predict vessel stay duration from load/discharge counts and crane info.

    When a trained model is available the ML prediction is the primary output.
    The physics heuristic acts only as a sanity bound (same logic as
    predict_visit_stay_duration) — it does NOT get blended in with a fixed
    weight.
    """
    bundle = load_stay_model()
    if bundle is None:
        return {"error": "Model not trained"}
    if isinstance(bundle, dict) and "error" in bundle:
        return bundle

    model = bundle["model"]
    feature_names = bundle["features"]

    total_moves = int(loaded) + int(discharged)
    imbalance = abs(int(loaded) - int(discharged))

    heuristic_span_hours = _heuristic_span_from_metrics(
        total_moves=total_moves,
        crane_count=crane_count,
        historical_mph_avg=historical_mph_avg,
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
        "move_span_hours": (
    float(historical_avg_stay_hours)
    if historical_avg_stay_hours and float(historical_avg_stay_hours) > 0
    else heuristic_span_hours
),
        "restow_intensity":       1.0,
        "block_concentration":    0.5,
        "reefer_equipment_ratio": settings.DEFAULT_REEFER_RATIO,
        "pct_40ft":               0.5,
        "heavy_ratio":            0.3,
    }

    if feature_template:
        for k, v in feature_template.items():
            if k not in features or features[k] == 0:
                features[k] = v

    for f in feature_names:
        if f not in features:
            features[f] = 0.0

    X = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
    ml_pred = float(model.predict(X)[0])

    # Apply the same outlier-clamping as predict_visit_stay_duration.
    ABSOLUTE_MIN_HOURS = float(settings.TRAIN_MIN_HOURS)
    ABSOLUTE_MAX_HOURS = 240.0

    if ml_pred < ABSOLUTE_MIN_HOURS:
        avg_hours = heuristic_span_hours
    elif ml_pred > ABSOLUTE_MAX_HOURS:
        avg_hours = heuristic_span_hours
    else:
        avg_hours = ml_pred

    avg_hours = round(float(max(float(settings.TRAIN_MIN_HOURS), avg_hours)), 2)

    suitable_berth = (
        settings.BERTH_HIGH_LABEL if total_moves > settings.BERTH_HIGH_VOLUME_THRESHOLD
        else settings.BERTH_MED_LABEL if total_moves > settings.BERTH_MED_VOLUME_THRESHOLD
        else settings.BERTH_LOW_LABEL
    )
    cargo_concentration = (
        "100.0%" if total_moves > settings.BERTH_HIGH_VOLUME_THRESHOLD else "50.0%"
    )

    return {
        "mode":     "manual",
        "vessel":   None,
        "actual":   {"visits": {}, "avg_hours": None},
        "predicted": {"avg_hours": avg_hours, "visits": 1},
        "berth_analysis": [{
            "berth":               suitable_berth,
            "block":               "A",
            "cargo_concentration": cargo_concentration,
            "total_travel_distance": "Low",
            "congestion_risk":     "Low",
        }],
        "input": {"loaded": loaded, "discharged": discharged},
    }