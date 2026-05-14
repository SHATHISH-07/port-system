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
    """
    Train the vessel stay model using ONLY container operation data.
    Stay target is derived from move_complete_time span (first → last container
    move completion). No crane data is used in training.
    """
    try:
        training_status.set("training", "Training started")
        logger.info("ML training started")

        cfg = config or {}
        min_hours      = cfg.get("min_hours",      settings.TRAIN_MIN_HOURS)
        max_hours      = cfg.get("max_hours",       settings.TRAIN_MAX_HOURS)
        min_visit_rows = cfg.get("min_visit_rows",  settings.MIN_VISIT_ROWS)

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

            visit_group  = group.copy()

            # Prepare data for feature extraction
            visit_df = prepare_visit_data(visit_group)

            # Compute stay purely from move_complete_time span
            # (no crane data involved)
            stay = compute_visit_stay(visit_df)

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
        print(f"     Target range       : {y.min():.1f}h - {y.max():.1f}h")
        print(f"     Target mean        : {y.mean():.1f}h")
        print(f"     Model type         : VotingRegressor (Ridge + XGBoost + GBR)")
        print(f"     Features           : {list(settings.FEATURE_NAMES)}")
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
        print("[OK] Model trained and saved ->", settings.MODEL_PATH)
        logger.info("ML training completed successfully")

        # ── Record model version in DB ────────────────────────────────────────
        _record_model_version(len(X), y, config, model=model, X=X)

    except Exception as e:
        training_status.set("failed", str(e))
        logger.error(f"ML training failed: {e}")
        print("[ERR] Training failed:", str(e))


def _record_model_version(n_samples: int, y: pd.Series, config: dict, model=None, X: pd.DataFrame = None):
    """
    Record a new model version in the DB.
    Promotion only happens when the new model's holdout MAE beats (or ties)
    the previously active model.  If no previous model exists, promote
    unconditionally.  On any DB error the function logs and returns silently
    so a metadata failure never breaks the training pipeline.
    """
    try:
        from db.connection import get_engine
        from sqlalchemy import text
        import json as _json
        from datetime import datetime, timezone
        import numpy as np
        from sklearn.model_selection import cross_val_score

        _engine = get_engine()
        _now    = datetime.now(timezone.utc)
        _vtag   = _now.strftime("%Y%m%d_%H%M%S")

        # ── Holdout MAE via 5-fold CV ────────────────────────────────────────
        holdout_mae = None
        if model is not None and X is not None and len(X) >= 20:
            try:
                neg_maes = cross_val_score(model, X, y, cv=min(3, len(X)), scoring="neg_mean_absolute_error")
                holdout_mae = round(float(-neg_maes.mean()), 4)
                logger.info("[ML] Holdout MAE (5-fold CV): %.4f", holdout_mae)
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
                "fn":  _json.dumps(settings.FEATURE_NAMES),
                "now": _now,
            }).fetchone()
            fc_id = fc_row[0]

            # ── Check previous active model's MAE ────────────────────────────
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

            # Promote when: no previous model, no MAE available, or new MAE is better
            should_promote = (
                prev_mae is None
                or holdout_mae is None
                or holdout_mae <= prev_mae
            )

            new_status = "active" if should_promote else "candidate"

            if should_promote:
                _conn.execute(text("""
                    UPDATE model_versions SET status = 'retired', updated_at = :now
                    WHERE model_name = 'vessel_stay' AND status = 'active'
                """), {"now": _now})
                logger.info("[ML] Previous model retired. New model promoted to active.")
            else:
                logger.warning(
                    "[ML] New model MAE %.4f is worse than previous %.4f — "
                    "marking as 'candidate', NOT promoting.",
                    holdout_mae, prev_mae,
                )

            _conn.execute(text("""
                INSERT INTO model_versions
                    (model_name, version, artifact_path, feature_config_id,
                     dataset_size, metrics, status, notes,
                     trained_at, promoted_at, created_at, updated_at)
                VALUES
                    ('vessel_stay', :ver, :path, :fcid,
                     :size, CAST(:metrics AS JSONB), :status,
                     'Auto-trained via pipeline',
                     :now, :promoted_at, :now, :now)
                ON CONFLICT (version) DO UPDATE SET
                    status      = EXCLUDED.status,
                    promoted_at = EXCLUDED.promoted_at,
                    updated_at  = EXCLUDED.updated_at
            """), {
                "ver":        _vtag,
                "path":       settings.MODEL_PATH,
                "fcid":       fc_id,
                "size":       n_samples,
                "status":     new_status,
                "promoted_at": _now if should_promote else None,
                "metrics":    _json.dumps({
                    "sample_count":  n_samples,
                    "holdout_mae":   holdout_mae,
                    "target_mean":   round(float(y.mean()), 2),
                    "target_min":    round(float(y.min()),  2),
                    "target_max":    round(float(y.max()),  2),
                }),
                "now": _now,
            })
            logger.info("[ML] Model version recorded: vessel_stay@%s status=%s", _vtag, new_status)
    except Exception as _ve:
        logger.warning("[ML] Could not record model version (non-fatal): %s", _ve)


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
        logger.warning(
            "[ML] Model feature mismatch — bundle has %s, settings expects %s. "
            "Attempting to serve with available features; schedule a retrain.",
            bundle.get("features"), settings.FEATURE_NAMES,
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

    # Merge with feature template if provided (fills missing operational context)
    if feature_template:
        for k, v in feature_template.items():
            if k not in features or features[k] == 0:
                features[k] = v

    # Fill any remaining feature names with 0
    for f in feature_names:
        if f not in features:
            features[f] = 0.0

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
    mph_override: float = None,
    feature_template: dict = None,
) -> dict:
    if not prepared_visits:
        return {"error": "No data found for vessel"}

    preds: list[float] = []
    for visit_id, visit_df in prepared_visits.items():
        if visit_df is None or visit_df.empty:
            continue
        pred = predict_visit_stay_duration(
            visit_df,
            mph_override=mph_override,
            feature_template=feature_template,
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
    historical_mph_avg: float = None,
    feature_template: dict = None,
) -> dict:
    """
    Predict vessel stay duration from load/discharge counts alone.
    No crane data is used.

    move_span_hours is estimated as:
        total_moves / moves_per_hour_rate
    where moves_per_hour_rate defaults to MOVES_PER_HOUR_PER_CRANE (a
    per-vessel throughput baseline) or is overridden by historical_mph_avg
    when available from prior visits of this service.
    """
    bundle = load_stay_model()
    if bundle is None:
        return {"error": "Model not trained"}
    if isinstance(bundle, dict) and "error" in bundle:
        return bundle

    model         = bundle["model"]
    feature_names = bundle["features"]

    total_moves = loaded + discharged
    imbalance   = abs(loaded - discharged)

    # Estimate operational duration from move throughput rate (no crane data)
    throughput_rate = (
        float(historical_mph_avg)
        if historical_mph_avg and float(historical_mph_avg) > 0
        else settings.MOVES_PER_HOUR_PER_CRANE
    )
    # Minimum 6 hours to avoid unrealistically short predictions
    estimated_span_hours = max(6.0, total_moves / max(throughput_rate, 1.0))

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
        "move_span_hours":        estimated_span_hours,
        "restow_intensity":       1.0,
        "block_concentration":    0.5,
        "reefer_equipment_ratio": settings.DEFAULT_REEFER_RATIO,
        "pct_40ft":               0.5,
        "heavy_ratio":            0.3,
    }

    # Merge with feature template if provided
    if feature_template:
        for k, v in feature_template.items():
            if k not in features or features[k] == 0:
                features[k] = v

    # Fill any remaining feature names with 0
    for f in feature_names:
        if f not in features:
            features[f] = 0.0

    X        = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
    pred     = model.predict(X)[0]
    avg_hours = round(float(pred), 2)

    # Derived metrics (informational only)
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
            f"Estimated {avg_hours:.1f}h stay based on {total_moves} total moves."
        ],
        "execution_plan": [
            f"Assign vessel to {suitable_berth} based on volume.",
            f"Estimated stay: {avg_hours:.1f} hours for {total_moves} moves.",
        ],
        "berth_analysis": [{
            "berth":               suitable_berth,
            "block":               "A",
            "cargo_concentration": cargo_concentration,
            "total_travel_distance": "Low",
            "congestion_risk":     "Low",
        }],
        "input": {"loaded": loaded, "discharged": discharged},
    }