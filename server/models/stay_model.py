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
from config import settings

logger = logging.getLogger("port_system")

# Build the ensemble model
def _build_ensemble():
    # Ridge regression pipeline
    ridge = Pipeline([
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=10.0)),
    ])
    # XGBoost regressor - higher complexity for better fit
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
    # Gradient boosting regressor
    gbr = GradientBoostingRegressor(
        n_estimators=120,
        max_depth=3,
        learning_rate=0.08,
        subsample=0.8,
        min_samples_leaf=5,
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

        # Bulk fetch all crane data for these visits to avoid N+1 queries
        all_visit_ids = list(grouped.groups.keys())
        # We fetch all crane movements for these visits in one or a few goes
        # but load_from_db handles filtering. If we pass no vessel_id, it loads all.
        # For training, we load all crane movements once.
        from db.queries import load_from_db
        logger.info("Loading all crane movements for enrichment...")
        # Load all records to ensure every visit in history is correctly enriched
        all_crane_df = load_from_db("crane")
        
        # Lists to store training data and target values
        X, y = [], []

        # Counters for skipped records
        skipped_noise = 0
        skipped_error = 0
        skipped_rows  = 0

        # Create a dictionary for fast crane lookup
        crane_grouped = all_crane_df.groupby("carrier_visit") if not all_crane_df.empty else {}

        # Iterate through each visit ID and group
        for visit_id, group in grouped:
            if len(group) < min_visit_rows:
                skipped_rows += 1
                continue
            
            # Enrich group with its crane data if available
            visit_id_str = str(visit_id)
            visit_group = group.copy()
            
            if visit_id_str in crane_grouped.groups:
                visit_crane_df = crane_grouped.get_group(visit_id_str).copy()
                # Simple enrichment logic similar to vessel_service.py
                v_crane_df = visit_crane_df.rename(columns={
                    "time_completed": "crane_time",
                    "from_position": "crane_from",
                    "to_position": "crane_to",
                    "move_kind": "crane_move_kind"
                })
                v_crane_df["crane_time"] = pd.to_datetime(v_crane_df["crane_time"], errors="coerce")
                
                valid_cranes = v_crane_df[v_crane_df["exclude"] != "Yes"] if "exclude" in v_crane_df.columns else v_crane_df
                if not valid_cranes.empty:
                    c_count = valid_cranes["crane_id"].nunique()
                    min_t = valid_cranes["crane_time"].min()
                    max_t = valid_cranes["crane_time"].max()
                    dur = max((max_t - min_t).total_seconds() / 3600, 0.1) if pd.notna(min_t) and pd.notna(max_t) else 0.1
                    eff_moves = len(valid_cranes)
                    mphc = (eff_moves / dur) / c_count if c_count > 0 else 0
                    
                    visit_group["_crane_count"] = float(c_count)
                    visit_group["_crane_mphc"] = float(min(mphc, 999.0))
                    visit_group["_crane_duration_hours"] = float(dur)
                    visit_group["_crane_intensity"] = float(eff_moves / max(len(group), 1))
            
            visit_df = prepare_visit_data(visit_group)
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
                    ON CONFLICT (version) DO UPDATE SET
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
    
    bundle = joblib.load(settings.MODEL_PATH)
    if bundle["features"] != settings.FEATURE_NAMES:
        logger.error(
            "Model feature mismatch. Bundle has %s, settings expects %s",
            bundle["features"], settings.FEATURE_NAMES
        )
        return {"error": "Model features outdated — retrain required"}
        
    _cached_model_bundle = bundle
    return _cached_model_bundle


# PREDICT VISIT  (single visit DataFrame → predicted hours)
def predict_visit_stay_duration(df, target_mph=None, crane_count_override=None, mph_override=None):
    bundle = load_stay_model()

    if bundle is None:
        return {"error": "Model not trained"}

    model          = bundle["model"]
    feature_names  = bundle["features"]

    features = create_features(df)
    
    # Apply crane count override if provided (from historical average)
    if crane_count_override and features is not None:
        features["crane_count"] = float(crane_count_override)
    
    # Apply MPH override if provided (from history or user)
    final_mph = float(target_mph) if target_mph and float(target_mph) > 0 else (float(mph_override) if mph_override and float(mph_override) > 0 else None)
    
    if final_mph and features is not None:
        features["crane_mphc"] = final_mph
        # Recalculate duration based on new MPH
        t_moves = features.get("total_moves", 100)
        c_count = features.get("crane_count", 2.0)
        features["crane_duration_hours"] = t_moves / (max(c_count, 1.0) * final_mph)

    if features is None:
        return None

    # Prepare input features in the same order as training
    X    = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
    
    # Predict the stay time
    pred = model.predict(X)[0]

    return round(float(pred), 2)

# PREDICT VESSEL  (all visits for one Outbound Service)
def predict_vessel_stay_duration(prepared_visits: dict, target_mph=None, crane_count_override=None, mph_override=None):
    if not prepared_visits:
        return {"error": "No data found for vessel"}

    preds = []

    for visit_id, visit_df in prepared_visits.items():
        if visit_df.empty:
            continue

        # Predict the stay time
        pred = predict_visit_stay_duration(visit_df, target_mph, crane_count_override=crane_count_override, mph_override=mph_override)

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
def predict_stay_duration_from_metrics(loaded: int, discharged: int, target_mph=None, historical_crane_avg=None, historical_mph_avg=None):
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
        "avg_weight": settings.DEFAULT_AVG_WEIGHT_KG,
        "avg_weight_kg": settings.DEFAULT_AVG_WEIGHT_KG,
        "heavy_count": int(total_moves * 0.3),
        "reefer_count": int(total_moves * settings.DEFAULT_REEFER_RATIO),
        "hazard_count": int(total_moves * settings.DEFAULT_HAZARD_RATIO),
        "oog_count": int(total_moves * settings.DEFAULT_OOG_RATIO),
        "service_hash": 123456,
        "crane_count": float(historical_crane_avg) if historical_crane_avg and float(historical_crane_avg) > 0 else (3.0 if total_moves > 300 else 2.0 if total_moves > 100 else 1.0),
        "crane_mphc": float(target_mph) if target_mph and float(target_mph) > 0 else (float(historical_mph_avg) if historical_mph_avg and float(historical_mph_avg) > 0 else settings.MOVES_PER_HOUR_PER_CRANE),
        "crane_intensity": 1.0,
        "crane_duration_hours": max(6.0, total_moves / (max(float(historical_crane_avg or 3.0), 1.0) * (float(target_mph) if target_mph and float(target_mph) > 0 else (float(historical_mph_avg) if historical_mph_avg and float(historical_mph_avg) > 0 else settings.MOVES_PER_HOUR_PER_CRANE)))),
        "crane_restow_ratio": 0.0,
        "crane_exclude_ratio": 0.0,
        "reefer_equipment_ratio": settings.DEFAULT_REEFER_RATIO,
        "pct_40ft": 0.5,
        "heavy_ratio": 0.3,
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
    
    # Predict cranes required
    if avg_hours > 0:
        crane_moves_per_hour = total_moves / avg_hours
        predicted_cranes = max(1, round(crane_moves_per_hour / settings.MOVES_PER_HOUR_PER_CRANE))
    else:
        predicted_cranes = 1
        
    # Predict suitable berth
    suitable_berth = settings.BERTH_HIGH_LABEL if total_moves > settings.BERTH_HIGH_VOLUME_THRESHOLD else settings.BERTH_MED_LABEL if total_moves > settings.BERTH_MED_VOLUME_THRESHOLD else settings.BERTH_LOW_LABEL
    cargo_concentration = "100.0%" if total_moves > settings.BERTH_HIGH_VOLUME_THRESHOLD else "50.0%"

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