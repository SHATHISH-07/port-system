import pandas as pd
import numpy as np
import hashlib
from utils.datetime_utils import parse_datetime
from utils.stay_utils import VESSEL_WINDOW_HOURS


def is_yes(val):
    return str(val).strip().upper() == "YES"


def create_features(df):
    """
    Extract ML features from a single prepared visit DataFrame.
    """

    df = df.copy()

    # -------------------------------------------------
    # EVENT TIME
    # -------------------------------------------------
    if "event_time" not in df.columns:
        move_time = parse_datetime(df["Move Complete Time"], "Move Complete Time")
        time_in = parse_datetime(df["Time In"], "Time In")
        df["event_time"] = move_time.fillna(time_in)

    df = df.dropna(subset=["event_time"])

    if df.empty:
        return None

    # -------------------------------------------------
    # WINDOW FILTER (same as your logic)
    # -------------------------------------------------
    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        if not valid_dep.empty:
            vessel_dep = valid_dep.mode().iloc[0]
            window_start = vessel_dep - pd.Timedelta(hours=VESSEL_WINDOW_HOURS)
            window_end = vessel_dep + pd.Timedelta(hours=1)

            df = df[
                (df["event_time"] >= window_start) &
                (df["event_time"] <= window_end)
            ]

    if df.empty:
        return None

    df = df.sort_values("event_time")

    # -------------------------------------------------
    # TIME FEATURES
    # -------------------------------------------------
    t_start = df["event_time"].min()
    t_end = df["event_time"].max()
    total_hours = max((t_end - t_start).total_seconds() / 3600, 1)

    # -------------------------------------------------
    # 🔥 KEY ADDITION: LOAD vs DISCHARGE
    # -------------------------------------------------
    loaded = df[
        df["Ctr From Position"].astype(str).str.startswith("Y-") &
        df["Ctr To Position"].astype(str).str.startswith("V-")
    ]["Unit ID"].nunique()

    discharged = df[
        df["Ctr From Position"].astype(str).str.startswith("V-") &
        df["Ctr To Position"].astype(str).str.startswith("Y-")
    ]["Unit ID"].nunique()

    total_moves = loaded + discharged
    imbalance = abs(loaded - discharged)

    # -------------------------------------------------
    # EXISTING FEATURES (KEEP)
    # -------------------------------------------------
    container_count = df["Unit ID"].nunique()

    df["Unit Weight in kg"] = pd.to_numeric(df["Unit Weight in kg"], errors="coerce")
    avg_weight = df["Unit Weight in kg"].mean()
    heavy_count = int((df["Unit Weight in kg"] > 20000).sum())

    reefer_count = int(df["Reefer"].astype(str).str.upper().eq("YES").sum())
    hazard_count = int(df["Hazardous Flag"].astype(str).str.upper().eq("YES").sum())
    oog_count = int(df["OOG Unit"].astype(str).str.upper().eq("YES").sum())

    moves_per_hour = len(df) / total_hours

    # -------------------------------------------------
    # SERVICE HASH (KEEP)
    # -------------------------------------------------
    service_str = (
        str(df["Outbound Service"].iloc[0]).strip()
        if "Outbound Service" in df.columns else "unknown"
    )
    service_hash = int(hashlib.md5(service_str.encode()).hexdigest()[:6], 16)

    # -------------------------------------------------
    # FINAL FEATURE SET
    # -------------------------------------------------
    return {
        # 🔥 NEW (CRITICAL)
        "loaded": int(loaded),
        "discharged": int(discharged),
        "total_moves": int(total_moves),
        "imbalance": int(imbalance),

        "load_ratio": float(loaded / (total_moves + 1)),
        "discharge_ratio": float(discharged / (total_moves + 1)),

        # EXISTING
        "container_count": int(container_count),
        "avg_weight": float(avg_weight) if pd.notna(avg_weight) else 0.0,
        "heavy_count": heavy_count,
        "reefer_count": reefer_count,
        "hazard_count": hazard_count,
        "oog_count": oog_count,
        "operation_hours": round(float(total_hours), 4),
        "moves_per_hour": round(float(moves_per_hour), 4),
        "service_hash": service_hash,
    }