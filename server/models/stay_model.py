import logging
import pandas as pd
import joblib
import os
from xgboost import XGBRegressor
from sklearn.linear_model import Ridge
from sklearn.ensemble import GradientBoostingRegressor, VotingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

from utils.stay_utils import prepare_visit_data, compute_visit_stay
from utils.feature_utils import create_features
from models.training_status import training_status

logger = logging.getLogger("port_system")

from config import settings

# Build the ensemble model
def _build_ensemble():
    # Ridge regression pipeline
    ridge = Pipeline([
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=10.0)),
    ])
    # XGBoost regressor
    xgb = XGBRegressor(
        n_estimators=80,
        max_depth=3,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_alpha=1.0,
        reg_lambda=5.0,
        random_state=42,
        verbosity=0,
    )
    # Gradient boosting regressor
    gbr = GradientBoostingRegressor(
        n_estimators=60,
        max_depth=2,
        learning_rate=0.10,
        subsample=0.75,
        min_samples_leaf=8,
        random_state=42,
    )
    # Voting regressor
    return VotingRegressor(estimators=[("ridge", ridge), ("xgb", xgb), ("gbr", gbr)])


# Function to train the stay model
def train_stay_model(df, config: dict = None):
    try:
        training_status.set("training", "Training started")
        logger.info("ML training started")

        # Apply config overrides for training filters
        cfg = config or {}
        min_hours = cfg.get("min_hours", settings.TRAIN_MIN_HOURS)
        max_hours = cfg.get("max_hours", settings.TRAIN_MAX_HOURS)
        min_visit_rows = cfg.get("min_visit_rows", settings.MIN_VISIT_ROWS)

        # Group the dataset by visit ID (using the DB column name)
        grouped = df.groupby("actual_outbound_carrier_visit_id")

        # Lists to store training data and target values
        X, y = [], []

        # Counters for skipped records
        skipped_noise = 0
        skipped_error = 0
        skipped_rows  = 0

        # Iterate through each visit ID and group
        for visit_id, group in grouped:

            if len(group) < min_visit_rows:
                skipped_rows += 1
                continue
            visit_df = prepare_visit_data(group)
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

            X.append([features[f] for f in settings.FEATURE_NAMES])
            y.append(stay)

        # Check for empty training data after filtering
        if not X:
            raise Exception(
                f"No training data after filtering "
                f"(noise={skipped_noise}, errors={skipped_error})"
            )

        # Convert to pandas DataFrame and Series
        X = pd.DataFrame(X, columns=settings.FEATURE_NAMES)
        y = pd.Series(y)

        # Print training statistics
        print(f"[OK] Training samples   : {len(X)}")
        print(f"     Skipped (< 5 rows) : {skipped_rows}")
        print(f"     Skipped (< 2h)     : {skipped_noise}")
        print(f"     Skipped (> 240h)   : {skipped_error}")
        print(f"     Target range       : {y.min():.1f}h - {y.max():.1f}h")
        print(f"     Target mean        : {y.mean():.1f}h")
        print(f"     Model type         : VotingRegressor (Ridge + XGBoost + GBR)")
        logger.info(f"ML training: {len(X)} samples, target mean={y.mean():.1f}h")

        # Build and train ensemble model
        model = _build_ensemble()
        model.fit(pd.DataFrame(X, columns=settings.FEATURE_NAMES), pd.Series(y))

        # Create models directory if it doesn't exist
        os.makedirs(os.path.dirname(settings.MODEL_PATH), exist_ok=True)

        # Save the model and features
        joblib.dump({
            "model":    model,
            "features": settings.FEATURE_NAMES,
        }, settings.MODEL_PATH)

        global _cached_model_bundle
        _cached_model_bundle = None

        training_status.set("completed", "Model trained successfully")
        print("[OK] Model trained and saved ->", settings.MODEL_PATH)
        logger.info("ML training completed successfully")

        # ── Record model version in DB ─────────────────────────────────────
        try:
            from db.connection import get_engine
            from sqlalchemy import text
            import json as _json
            from datetime import datetime, timezone

            _engine = get_engine()
            _now = datetime.now(timezone.utc)
            _version_tag = _now.strftime("%Y%m%d_%H%M%S")

            with _engine.begin() as _conn:
                # Ensure default feature_config exists
                fc_row = _conn.execute(text("""
                    INSERT INTO feature_configs (name, description, feature_names, created_at, updated_at)
                    VALUES ('default', 'Default VotingRegressor features', CAST(:fn AS JSONB), :now, :now)
                    ON CONFLICT (name) DO UPDATE SET updated_at = EXCLUDED.updated_at
                    RETURNING id
                """), {
                    "fn":  _json.dumps(settings.FEATURE_NAMES),
                    "now": _now,
                }).fetchone()
                fc_id = fc_row[0]

                # Demote existing active version
                _conn.execute(text("""
                    UPDATE model_versions SET status = 'retired', updated_at = :now
                    WHERE model_name = 'vessel_stay' AND status = 'active'
                """), {"now": _now})

                # Record this version as active
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
                    ON CONFLICT (model_name, version) DO UPDATE SET
                        status       = 'active',
                        promoted_at  = EXCLUDED.promoted_at,
                        updated_at   = EXCLUDED.updated_at
                """), {
                    "ver":     _version_tag,
                    "path":    settings.MODEL_PATH,
                    "fcid":    fc_id,
                    "size":    len(X),
                    "metrics": _json.dumps({
                        "sample_count":  len(X),
                        "target_mean":   round(float(y.mean()), 2),
                        "target_min":    round(float(y.min()), 2),
                        "target_max":    round(float(y.max()), 2),
                        "skipped_noise": skipped_noise,
                        "skipped_error": skipped_error,
                    }),
                    "now":     _now,
                })
                logger.info(f"[ML] Model version recorded: vessel_stay@{_version_tag}")
        except Exception as _ve:
            logger.warning(f"[ML] Could not record model version (non-fatal): {_ve}")

    except Exception as e:
        training_status.set("failed", str(e))
        logger.error(f"ML training failed: {e}")
        print("[ERR] Training failed:", str(e))


_cached_model_bundle = None

# LOAD MODEL
def load_stay_model():
    global _cached_model_bundle
    if _cached_model_bundle is not None:
        return _cached_model_bundle

    if not os.path.exists(settings.MODEL_PATH):
        return None
    
    _cached_model_bundle = joblib.load(settings.MODEL_PATH)
    return _cached_model_bundle


# PREDICT VISIT  (single visit DataFrame → predicted hours)
def predict_visit_stay_duration(df):
    bundle = load_stay_model()

    if bundle is None:
        return {"error": "Model not trained"}

    model          = bundle["model"]
    feature_names  = bundle["features"]

    features = create_features(df)

    if features is None:
        return None

    # Prepare input features in the same order as training
    X    = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
    
    # Predict the stay time
    pred = model.predict(X)[0]

    return round(float(pred), 2)


# PREDICT VESSEL  (all visits for one Outbound Service)
def predict_vessel_stay_duration(prepared_visits: dict):
    if not prepared_visits:
        return {"error": "No data found for vessel"}

    preds = []

    for visit_id, visit_df in prepared_visits.items():
        if visit_df.empty:
            continue

        # Predict the stay time
        pred = predict_visit_stay_duration(visit_df)

        # Error dict → propagate
        if isinstance(pred, dict):
            return pred

        if pred is not None:
            preds.append(pred)

    # No prediction data available
    if not preds:
        return {"error": "No prediction data available"}

    return {
        "avg_hours": round(sum(preds) / len(preds), 2),
        "visits":    len(preds),
    }


# Predict the stay time from input
def predict_stay_duration_from_metrics(loaded: int, discharged: int, actual_visits=None):
    bundle = load_stay_model()

    if bundle is None:
        return {"error": "Model not trained"}

    # Model and feature names
    model = bundle["model"]
    feature_names = bundle["features"]

    # Total moves and imbalance
    total_moves = loaded + discharged
    imbalance = abs(loaded - discharged)

    # Feature engineering without artificial time leakage
    features = {
        "loaded": loaded,
        "discharged": discharged,
        "total_moves": total_moves,
        "imbalance": imbalance,
        "load_ratio": loaded / (total_moves + 1),
        "discharge_ratio": discharged / (total_moves + 1),

        "container_count": total_moves,
        "avg_weight": 15000,
        "heavy_count": int(total_moves * 0.3),
        "reefer_count": int(total_moves * 0.1),
        "hazard_count": int(total_moves * 0.05),
        "oog_count": int(total_moves * 0.02),
        "service_hash": 123456,
    }

    # Prepare input features in the same order as training
    # Fallback for dynamic features
    for f in feature_names:
        if f not in features:
            features[f] = 0.0

    X = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)

    # Predict the stay time
    pred = model.predict(X)[0]
    avg_hours = round(float(pred), 2)
    
    # Predict cranes required (assuming ~25 moves per hour per crane)
    if avg_hours > 0:
        crane_moves_per_hour = total_moves / avg_hours
        predicted_cranes = max(1, round(crane_moves_per_hour / 25))
    else:
        predicted_cranes = 1
        
    # Predict suitable berth
    suitable_berth = "PEB-1" if total_moves > 1000 else "PEB-2" if total_moves > 500 else "PEB-3"
    cargo_concentration = "100.0%" if total_moves > 1000 else "50.0%"

    # Return predicted stay time
    return {
        "mode": "manual",
        "vessel": None,
        "actual": {
            "visits": {},
            "avg_hours": None
        },
        "predicted": {
            "avg_hours": avg_hours,
            "visits": 1
        },
        "risks": [
            f"Expected {predicted_cranes} cranes required to maintain standard productivity."
        ],
        "execution_plan": [
            f"Assign vessel to {suitable_berth} based on volume.",
            f"Deploy {predicted_cranes} cranes for {avg_hours} hours."
        ],
        "berth_analysis": [
            {
                "berth": suitable_berth,
                "block": "A",
                "cargo_concentration": cargo_concentration,
                "recommended_cranes": predicted_cranes,
                "total_travel_distance": "Low",
                "congestion_risk": "Low"
            }
        ],
        "input": {
            "loaded": loaded,
            "discharged": discharged
        }
    }