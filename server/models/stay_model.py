import pandas as pd
import joblib
import os
from xgboost import XGBRegressor

from utils.stay_utils import prepare_visit_data, compute_visit_stay
from utils.feature_utils import create_features
from utils.data_loader import get_data
from models.training_status import training_status

from dotenv import load_dotenv
load_dotenv()

MODEL_PATH = os.getenv("MODEL_PATH")

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
    "operation_hours",
    "moves_per_hour",
    "service_hash",
]

# Training bounds: visits outside this range are excluded from model training.
# They are still shown in actual/historical statistics.
TRAIN_MIN_HOURS = 2     # below this → single-move noise, not a real vessel stay
TRAIN_MAX_HOURS = 240   # above this → data error (vessel ID used across multiple voyages)
MIN_VISIT_ROWS  = 5     # visit IDs with fewer rows are single-transit containers, not vessel ops


# =========================================================
# TRAIN MODEL
# =========================================================
def train_model():
    try:
        training_status.set("training", "Training started")

        df = get_data()

        # Group by unique visit ID (one port call per vessel)
        grouped = df.groupby("Actual Outbound Carrier visit ID")

        X, y = [], []
        skipped_noise = 0
        skipped_error = 0
        skipped_rows  = 0

        for visit_id, group in grouped:

            # ── Skip groups with too few rows (transit noise, not real ops) ──
            if len(group) < MIN_VISIT_ROWS:
                skipped_rows += 1
                continue

            # ── Prepare: parse event_time, sort ascending ────────────────────
            visit_df = prepare_visit_data(group)

            # ── Compute stay: max(event_time) - min(event_time) ─────────────
            stay = compute_visit_stay(visit_df)

            if stay is None:
                continue

            # ── Filter training data ─────────────────────────────────────────
            # < TRAIN_MIN_HOURS → noise (too short to be a real vessel visit)
            if stay < TRAIN_MIN_HOURS:
                skipped_noise += 1
                continue

            # > TRAIN_MAX_HOURS → data error (two unrelated records merged)
            if stay > TRAIN_MAX_HOURS:
                skipped_error += 1
                continue

            # ── Extract features ─────────────────────────────────────────────
            features = create_features(visit_df)

            if features is None:
                continue

            X.append([features[f] for f in FEATURE_NAMES])
            y.append(stay)

        if not X:
            raise Exception(
                f"No training data after filtering "
                f"(noise={skipped_noise}, errors={skipped_error})"
            )

        X = pd.DataFrame(X, columns=FEATURE_NAMES)
        y = pd.Series(y)

        print(f"[OK] Training samples   : {len(X)}")
        print(f"     Skipped (< 5 rows) : {skipped_rows}")
        print(f"     Skipped (< 2h)     : {skipped_noise}")
        print(f"     Skipped (> 240h)   : {skipped_error}")
        print(f"     Target range       : {y.min():.1f}h - {y.max():.1f}h")
        print(f"     Target mean        : {y.mean():.1f}h")

        model = XGBRegressor(
            n_estimators=150,
            max_depth=6,
            learning_rate=0.05,
            subsample=1.0,
            colsample_bytree=1.0,
            min_child_weight=1,
            gamma=0.0,
            reg_alpha=0.0,
            reg_lambda=0.1,
            random_state=42,
        )

        model.fit(X, y)

        os.makedirs("models", exist_ok=True)

        joblib.dump({
            "model":    model,
            "features": FEATURE_NAMES,
        }, MODEL_PATH)

        training_status.set("completed", "Model trained successfully")
        print("[OK] Model trained and saved ->", MODEL_PATH)

    except Exception as e:
        training_status.set("failed", str(e))
        print("[ERR] Training failed:", str(e))


# =========================================================
# LOAD MODEL
# =========================================================
def load_model():
    if not os.path.exists(MODEL_PATH):
        return None
    return joblib.load(MODEL_PATH)


# =========================================================
# PREDICT VISIT  (single visit DataFrame → predicted hours)
# =========================================================
def predict_visit(df):
    bundle = load_model()

    if bundle is None:
        return {"error": "Model not trained"}

    model          = bundle["model"]
    feature_names  = bundle["features"]

    features = create_features(df)

    if features is None:
        return None

    X    = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
    pred = model.predict(X)[0]

    return round(float(pred), 2)


# =========================================================
# PREDICT VESSEL  (all visits for one Outbound Service)
# =========================================================
def predict_vessel(df, vessel_service):
    df = df[
        df["Outbound Service"].astype(str).str.strip() == str(vessel_service)
    ].copy()

    if df.empty:
        return {"error": f"No data found for vessel '{vessel_service}'"}

    grouped = df.groupby("Actual Outbound Carrier visit ID")

    preds = []

    for visit_id, group in grouped:

        # Same preparation pipeline as training
        visit_df = prepare_visit_data(group)

        pred = predict_visit(visit_df)

        if isinstance(pred, dict):   # error dict → propagate
            return pred

        if pred is not None:
            preds.append(pred)

    if not preds:
        return {"error": "No prediction data available"}

    return {
        "avg_hours": round(sum(preds) / len(preds), 2),
        "visits":    len(preds),
    }

def estimate_moves_per_hour_from_actual(actual_visits):
    rates = []

    for v in actual_visits.values():
        moves = v["loaded_containers"] + v["discharged_containers"]
        hours = v["stay_hours"]

        if hours > 0:
            rates.append({
                "rate": moves / hours,
                "load_ratio": v["loaded_containers"] / (moves + 1)
            })

    if not rates:
        return 50

    return rates

def pick_throughput(rates, loaded, discharged):
    total = loaded + discharged
    input_ratio = loaded / (total + 1)

    # find closest match in history
    closest = min(
        rates,
        key=lambda r: abs(r["load_ratio"] - input_ratio)
    )

    return closest["rate"]

def predict_from_input(loaded: int, discharged: int,actual_visits=None):
    bundle = load_model()

    if bundle is None:
        return {"error": "Model not trained"}

    model = bundle["model"]
    feature_names = bundle["features"]

    total_moves = loaded + discharged
    imbalance = abs(loaded - discharged)

    rates = estimate_moves_per_hour_from_actual(actual_visits)
    moves_per_hour = pick_throughput(rates, loaded, discharged)
    operation_hours = total_moves / moves_per_hour

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

        "operation_hours": operation_hours,
        "moves_per_hour": moves_per_hour,

        "service_hash": 123456,
    }

    X = pd.DataFrame([[features[f] for f in feature_names]], columns=feature_names)
    pred = model.predict(X)[0]

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