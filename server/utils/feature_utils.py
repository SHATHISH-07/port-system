import pandas as pd
import numpy as np
import hashlib
from utils.datetime_utils import parse_datetime
from utils.stay_utils import VESSEL_WINDOW_HOURS

# Check if a value is yes
def is_yes(val):
    return str(val).strip().upper() == "YES"


# Create features for a given vessel
def create_features(df):
    df = df.copy()

    # Parse event time
    if "event_time" not in df.columns:
        move_time = parse_datetime(df["move_complete_time"], "move_complete_time")
        time_in = parse_datetime(df["time_in"], "time_in")
        df["event_time"] = move_time.fillna(time_in)

    # Drop rows with no event time
    df = df.dropna(subset=["event_time"])

    # Check if the dataframe is empty
    if df.empty:
        return None

    # Filter data based on vessel departure
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

    # Sort by event time
    df = df.sort_values("event_time")

    # Calculate total duration in hours (for historical info if needed later)
    t_start = df["event_time"].min()
    t_end = df["event_time"].max()
    total_hours = max((t_end - t_start).total_seconds() / 3600, 1)
    # Calculate loaded and discharged counts
    loaded = df[
        df["ctr_from_position"].astype(str).str.startswith("Y-") &
        df["ctr_to_position"].astype(str).str.startswith("V-")
    ]["unit_id"].nunique()

    discharged = df[
        df["ctr_from_position"].astype(str).str.startswith("V-") &
        df["ctr_to_position"].astype(str).str.startswith("Y-")
    ]["unit_id"].nunique()

    # Calculate total moves and imbalance
    total_moves = loaded + discharged
    imbalance = abs(loaded - discharged)
    
    # Get container count
    container_count = df["unit_id"].nunique()
    
    # Convert unit weight to numeric and calculate average weight
    df["unit_weight_in_kg"] = pd.to_numeric(df["unit_weight_in_kg"], errors="coerce")
    avg_weight = df["unit_weight_in_kg"].mean()
    heavy_count = int((df["unit_weight_in_kg"] > 20000).sum())

    # Count reefer, hazard, and OOG containers
    reefer_count = int(df["reefer"].astype(str).str.upper().eq("YES").sum())
    hazard_count = int(df["hazardous_flag"].astype(str).str.upper().eq("YES").sum())
    oog_count = int(df["oog_unit"].astype(str).str.upper().eq("YES").sum())

    # Get outbound service
    service_str = (
        str(df["outbound_service"].iloc[0]).strip()
        if "outbound_service" in df.columns else "unknown"
    )
    # Hash outbound service
    service_hash = int(hashlib.md5(service_str.encode()).hexdigest()[:6], 16)

    # Return features as a dictionary
    return {
        "loaded": int(loaded),
        "discharged": int(discharged),
        "total_moves": int(total_moves),
        "imbalance": int(imbalance),
        "load_ratio": float(loaded / (total_moves + 1)),
        "discharge_ratio": float(discharged / (total_moves + 1)),
        "container_count": int(container_count),
        "avg_weight": float(avg_weight) if pd.notna(avg_weight) else 0.0,
        "heavy_count": heavy_count,
        "reefer_count": reefer_count,
        "hazard_count": hazard_count,
        "oog_count": oog_count,
        "service_hash": service_hash,
    }