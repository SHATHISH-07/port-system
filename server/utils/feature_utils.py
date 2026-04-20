import pandas as pd
import numpy as np
from utils.datetime_utils import parse_datetime
from utils.stay_utils import VESSEL_WINDOW_HOURS


def create_features(df):
    """
    Extracts ML features from a single visit's prepared DataFrame.

    The DataFrame is expected to already be window-filtered and sorted
    (via prepare_visit_data). If 'event_time' is not present, it is resolved
    here using the same logic.

    Features
    --------
    container_count  – unique containers handled
    avg_weight       – mean unit weight (kg)
    heavy_count      – containers > 20 000 kg
    reefer_count     – refrigerated containers
    hazard_count     – hazardous containers
    oog_count        – out-of-gauge containers
    operation_hours  – window from first to last crane move (hours)
    moves_per_hour   – throughput rate (rows / operation_hours)
    """
    df = df.copy()

    # ── resolve event_time if not already present ────────────────────────────
    if "event_time" not in df.columns:
        move_time = parse_datetime(df["Move Complete Time"], "Move Complete Time")
        time_in   = parse_datetime(df["Time In"],            "Time In")
        df["event_time"] = move_time.fillna(time_in)

    df = df.dropna(subset=["event_time"])

    if df.empty:
        return None

    # ── apply window filter if vessel_departure available ───────────────────
    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        if not valid_dep.empty:
            vessel_dep   = valid_dep.mode().iloc[0]
            window_start = vessel_dep - pd.Timedelta(hours=VESSEL_WINDOW_HOURS)
            window_end   = vessel_dep + pd.Timedelta(hours=1)
            df = df[
                (df["event_time"] >= window_start) &
                (df["event_time"] <= window_end)
            ]

    if df.empty:
        return None

    # ── sort ascending ───────────────────────────────────────────────────────
    df = df.sort_values("event_time")

    # ── time window ──────────────────────────────────────────────────────────
    t_start = df["event_time"].min()
    t_end   = df["event_time"].max()
    total_hours = max((t_end - t_start).total_seconds() / 3600, 1)

    # ── cargo features ───────────────────────────────────────────────────────
    container_count = df["Unit ID"].nunique()

    df["Unit Weight in kg"] = pd.to_numeric(df["Unit Weight in kg"], errors="coerce")
    avg_weight   = df["Unit Weight in kg"].mean()
    heavy_count  = int((df["Unit Weight in kg"] > 20000).sum())

    reefer_count = int(df["Reefer"].astype(str).str.upper().eq("YES").sum())
    hazard_count = int(df["Hazardous Flag"].astype(str).str.upper().eq("YES").sum())
    oog_count    = int(df["OOG Unit"].astype(str).str.upper().eq("YES").sum())

    moves_per_hour = len(df) / total_hours

    # ── Identifiers (deterministic numeric hashes for tree splitting) ───────
    service_str = str(df["Outbound Service"].iloc[0]).strip() if "Outbound Service" in df.columns else "unknown"
    import hashlib
    service_hash = int(hashlib.md5(service_str.encode()).hexdigest()[:6], 16)

    return {
        "container_count": container_count,
        "avg_weight":      avg_weight,
        "heavy_count":     heavy_count,
        "reefer_count":    reefer_count,
        "hazard_count":    hazard_count,
        "oog_count":       oog_count,
        "operation_hours": round(total_hours, 4),
        "moves_per_hour":  round(moves_per_hour, 4),
        "service_hash":    service_hash,
    }