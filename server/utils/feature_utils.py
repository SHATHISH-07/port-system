import pandas as pd
import numpy as np
import hashlib
from utils.datetime_utils import parse_datetime
from utils.position_parser import parse_position
from config import settings

def is_yes(val):
    return str(val).strip().upper() in ("YES", "Y", "TRUE", "1")

def create_features(df):
    """
    Generate features for stay-time prediction.
    Expects df to be a single visit's data.
    """
    df = df.copy()

    # 1. Ensure event_time is present
    if "event_time" not in df.columns:
        move_time = parse_datetime(df["move_complete_time"], "move_complete_time")
        time_in = parse_datetime(df["time_in"], "time_in")
        df["event_time"] = move_time.fillna(time_in)

    df = df.dropna(subset=["event_time"])
    if df.empty:
        return None

    # 2. Time span features (Intensity)
    t_start = df["event_time"].min()
    t_end = df["event_time"].max()
    move_span_hours = max((t_end - t_start).total_seconds() / 3600, 0.1)

    # 3. Robust Move Classification (using position_parser)
    loaded = 0
    discharged = 0
    blocks = {}
    
    for _, row in df.iterrows():
        f_pos = parse_position(row.get("ctr_from_position"))
        t_pos = parse_position(row.get("ctr_to_position"))
        
        if f_pos and t_pos:
            # LOAD: Yard -> Vessel
            if f_pos["is_yard"] and t_pos["is_vessel"]:
                loaded += 1
                b = f_pos["block"]
                blocks[b] = blocks.get(b, 0) + 1
            # DISCHARGE: Vessel -> Yard
            elif f_pos["is_vessel"] and t_pos["is_yard"]:
                discharged += 1
                b = t_pos["block"]
                blocks[b] = blocks.get(b, 0) + 1

    total_moves = loaded + discharged
    if total_moves == 0:
        # Fallback if positions are missing but we have rows
        total_moves = len(df)
        loaded = total_moves // 2
        discharged = total_moves - loaded

    imbalance = abs(loaded - discharged)
    container_count = df["unit_id"].nunique()
    
    # 4. Efficiency metrics
    restow_intensity = len(df) / max(container_count, 1)
    
    # 5. Congestion metrics
    max_block_count = max(blocks.values()) if blocks else 0
    block_concentration = max_block_count / max(total_moves, 1)

    # 6. Weight and Special Cargo
    df["unit_weight_in_kg"] = pd.to_numeric(df["unit_weight_in_kg"], errors="coerce")
    avg_weight = df["unit_weight_in_kg"].mean()
    heavy_count = int((df["unit_weight_in_kg"] > 25000).sum())

    reefer_count = int(df["reefer"].apply(is_yes).sum()) if "reefer" in df.columns else 0
    hazard_count = int(df["hazardous_flag"].apply(is_yes).sum()) if "hazardous_flag" in df.columns else 0
    oog_count    = int(df["oog_unit"].apply(is_yes).sum()) if "oog_unit" in df.columns else 0

    # 7. Service Identity
    service_str = str(df["outbound_service"].iloc[0]).strip() if "outbound_service" in df.columns else "unknown"
    service_hash = int(hashlib.md5(service_str.encode()).hexdigest()[:6], 16)

    return {
        "loaded": int(loaded),
        "discharged": int(discharged),
        "total_moves": int(total_moves),
        "imbalance": int(imbalance),
        "load_ratio": float(loaded / (total_moves + 1)),
        "discharge_ratio": float(discharged / (total_moves + 1)),
        "container_count": int(container_count),
        "avg_weight": float(avg_weight) if pd.notna(avg_weight) else 0.0,
        "heavy_count": int(heavy_count),
        "reefer_count": int(reefer_count),
        "hazard_count": int(hazard_count),
        "oog_count": int(oog_count),
        "service_hash": int(service_hash),
        "move_span_hours": float(move_span_hours),
        "restow_intensity": float(restow_intensity),
        "block_concentration": float(block_concentration)
    }