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
from utils.data_loader import load_csv
from models.training_status import training_status

logger = logging.getLogger("port_system")

from dotenv import load_dotenv
load_dotenv()

MODEL_PATH = os.getenv("MODEL_PATH")

# Feature names in order of feature_utils.py file
FEATURE_NAMES = [
    "loaded",
    "discharged",
    "total_moves",
    "imbalance",
    "load_ratio",
    "discharge_ratio",

    "container_count",
    "avg_weight",
    "heavy_count",
    "reefer_count",
    "hazard_count",
    "oog_count",
    "service_hash",
]

# Training parameters
TRAIN_MIN_HOURS = 2     # Ignore stays shorter than 2 hours (noise)
TRAIN_MAX_HOURS = 240   # Ignore stays longer than 240 hours (outliers)
MIN_VISIT_ROWS  = 5     # Ignore visits with fewer than 5 rows

def _build_ensemble():
    ridge = Pipeline([
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=10.0)),
    ])
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
    gbr = GradientBoostingRegressor(
        n_estimators=60,
        max_depth=2,
        learning_rate=0.10,
        subsample=0.75,
        min_samples_leaf=8,
        random_state=42,
    )
    return VotingRegressor(estimators=[("ridge", ridge), ("xgb", xgb), ("gbr", gbr)])


# Function to train the model
def train_model(df):
    try:
        training_status.set("training", "Training started")
        logger.info("ML training started")

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

            if len(group) < MIN_VISIT_ROWS:
                skipped_rows += 1
                continue
            visit_df = prepare_visit_data(group)
            stay = compute_visit_stay(visit_df)

            if stay is None:
                continue

            if stay < TRAIN_MIN_HOURS:
                skipped_noise += 1
                continue

            if stay > TRAIN_MAX_HOURS:
                skipped_error += 1
                continue
            features = create_features(visit_df)

            if features is None:
                continue

            X.append([features[f] for f in FEATURE_NAMES])
            y.append(stay)

        # Check for empty training data after filtering
        if not X:
            raise Exception(
                f"No training data after filtering "
                f"(noise={skipped_noise}, errors={skipped_error})"
            )

        # Convert to pandas DataFrame and Series
        X = pd.DataFrame(X, columns=FEATURE_NAMES)
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
        model.fit(pd.DataFrame(X, columns=FEATURE_NAMES), pd.Series(y))

        # Create models directory if it doesn't exist
        os.makedirs("models", exist_ok=True)

        # Save the model and features
        joblib.dump({
            "model":    model,
            "features": FEATURE_NAMES,
        }, MODEL_PATH)

        global _cached_bundle
        _cached_bundle = None

        training_status.set("completed", "Model trained successfully")
        print("[OK] Model trained and saved ->", MODEL_PATH)
        logger.info("ML training completed successfully")

    except Exception as e:
        training_status.set("failed", str(e))
        logger.error(f"ML training failed: {e}")
        print("[ERR] Training failed:", str(e))


_cached_bundle = None

# LOAD MODEL
def load_model():
    global _cached_bundle
    if _cached_bundle is not None:
        return _cached_bundle

    if not os.path.exists(MODEL_PATH):
        return None
    
    _cached_bundle = joblib.load(MODEL_PATH)
    return _cached_bundle


# PREDICT VISIT  (single visit DataFrame → predicted hours)
def predict_visit(df):
    bundle = load_model()

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
def predict_vessel(prepared_visits: dict):
    if not prepared_visits:
        return {"error": "No data found for vessel"}

    preds = []

    for visit_id, visit_df in prepared_visits.items():
        if visit_df.empty:
            continue

        # Predict the stay time
        pred = predict_visit(visit_df)

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
def predict_from_input(loaded: int, discharged: int, actual_visits=None):
    bundle = load_model()

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
    X = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)

    # Predict the stay time
    pred = model.predict(X)[0]

    # Return predicted stay time
    return {
        "mode": "manual",
        "vessel": None,
        "actual": {
            "visits": {},
            "avg_hours": None
        },
        "predicted": {
            "avg_hours": round(float(pred), 2),
            "visits": 1
        },
        "risks": [],
        "execution_plan": [],
        "berth_analysis": [],
        "input": {
            "loaded": loaded,
            "discharged": discharged
        }
    }