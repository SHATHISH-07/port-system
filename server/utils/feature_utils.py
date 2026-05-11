from __future__ import annotations
import hashlib
import pandas as pd
from config import settings
from utils.datetime_utils import parse_datetime
from utils.position_parser import classify_move, parse_position, safe_get_pos

# check if value is yes
def _is_yes(val) -> bool:
    return str(val).strip().upper() in ("YES", "Y", "TRUE", "1")

def _safe_col(df: pd.DataFrame, col: str, default: float) -> float:
    return float(df[col].iloc[0]) if col in df.columns and not df[col].isna().all() else float(default)

# function to create features
def create_features(df: pd.DataFrame) -> dict | None:
    # create a copy of the dataframe
    df = df.copy()

    # resolve event_time
    if "event_time" not in df.columns:
        # list of possible event_time columns
        sources = ["move_complete_time", "crane_time", "time_in", "time_completed"]
        event_time = pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")
        # loop through sources
        for col in sources:
            # if column exists, parse it
            if col in df.columns:
                event_time = event_time.fillna(parse_datetime(df[col], col))
        df["event_time"] = event_time

    # drop rows with no event_time
    df = df.dropna(subset=["event_time"])
    if df.empty:
        return None

    # time span
    t_start = df["event_time"].min()
    t_end = df["event_time"].max()
    move_span_hours = max((t_end - t_start).total_seconds() / 3600, 0.1)

    # move classification
    loaded = 0
    discharged = 0
    restows = 0
    blocks: dict[str, int] = {}
    
    # loop through rows
    for _, row in df.iterrows():
        row = dict(row)

        # get from and to positions
        from_pos = safe_get_pos(row, "crane_from", "ctr_from_position", "from_position")
        to_pos   = safe_get_pos(row, "crane_to",   "ctr_to_position",   "to_position")

        # classify move type
        move_type = classify_move(from_pos, to_pos)

        # honour explicit move_kind when position-based classification fails
        if move_type == "UNKNOWN":
            mk = str(
                row.get("crane_move_kind") or row.get("move_kind") or ""
            ).strip().upper()
            # normalise "Load" / "Discharge" / "Restow" (title-case from CSV)
            if mk in ("LOAD", "DISCHARGE", "SHIFT", "RESTOW"):
                move_type = mk

        # increment counters based on move type
        if move_type == "LOAD":
            loaded += 1
            f_p = parse_position(from_pos)
            if f_p and f_p["is_yard"]:
                b = f_p.get("block", "UNKNOWN")
                blocks[b] = blocks.get(b, 0) + 1
        # discharge
        elif move_type == "DISCHARGE":
            discharged += 1
            t_p = parse_position(to_pos)
            if t_p and t_p["is_yard"]:
                b = t_p.get("block", "UNKNOWN")
                blocks[b] = blocks.get(b, 0) + 1
        # restow
        elif move_type in ("SHIFT", "RESTOW"):
            restows += 1

    # total moves
    total_moves = loaded + discharged
    # if total moves is 0, set it to the number of rows
    if total_moves == 0:
        total_moves = len(df)
        loaded = total_moves // 2
        discharged = total_moves - loaded
    
    # imbalance
    imbalance = abs(loaded - discharged)
    # container count
    container_count = int(df["unit_id"].nunique()) if "unit_id" in df.columns else max(total_moves, 1)

    # efficiency / congestion
    restow_intensity = (total_moves + restows) / max(container_count, 1)
    max_block = max(blocks.values()) if blocks else 0
    block_concentration = max_block / max(total_moves, 1)

    # weight / special cargo
    w_col = "unit_weight_in_kg"
    if w_col not in df.columns:
        w_col = "verified_gross_mass_kg" if "verified_gross_mass_kg" in df.columns else None
    # if weight column exists, calculate average weight and heavy count
    if w_col:
        df[w_col] = pd.to_numeric(df[w_col], errors="coerce")
        avg_weight = float(df[w_col].mean()) if not df[w_col].isna().all() else 0.0
        heavy_count = int((df[w_col] > 25_000).sum())
    # else set to 0
    else:
        avg_weight, heavy_count = 0.0, 0

    # reefer count
    reefer_count  = int(df["reefer"].apply(_is_yes).sum())        if "reefer"          in df.columns else 0
    # hazard count
    hazard_count  = int(df["hazardous_flag"].apply(_is_yes).sum()) if "hazardous_flag" in df.columns else 0
    # out of gauge count
    oog_count     = int(df["oog_unit"].apply(_is_yes).sum())       if "oog_unit"       in df.columns else 0

    # service hash
    svc = "unknown"
    # if outbound service exists, get the first value
    if "outbound_service" in df.columns:
        vals = df["outbound_service"].dropna()
        svc = str(vals.iloc[0]).strip() if not vals.empty else "unknown"
    # create hash
    service_hash = int(hashlib.md5(svc.encode()).hexdigest()[:6], 16)

    # --- Container Mix Features ---
    reefer_equipment_ratio = float(
        df["equipment_type"].astype(str).str.contains("R", case=False).mean()
    ) if "equipment_type" in df.columns and not df["equipment_type"].isna().all() else 0.0

    pct_40ft = float(
        (pd.to_numeric(df.get("container_length", pd.Series()), errors="coerce") >= 40).mean()
    ) if "container_length" in df.columns and not df["container_length"].isna().all() else 0.0

    heavy_ratio = heavy_count / max(total_moves, 1)

    # --- Crane Features ---
    crane_count = _safe_col(df, "_crane_count", 1.0)
    crane_mphc = _safe_col(df, "_crane_mphc", settings.MOVES_PER_HOUR_PER_CRANE)
    crane_intensity = _safe_col(df, "_crane_intensity", 1.0)
    crane_duration_hours = _safe_col(df, "_crane_duration_hours", move_span_hours)
    crane_restow_ratio = _safe_col(df, "_crane_restow_ratio", 0.0)
    crane_exclude_ratio = _safe_col(df, "_crane_exclude_ratio", 0.0)

    # average weight kg alias
    avg_weight_kg = float(avg_weight)

    return {
        "loaded":                 int(loaded),
        "discharged":             int(discharged),
        "total_moves":            int(total_moves),
        "imbalance":              int(imbalance),
        "load_ratio":             float(loaded / (total_moves + 1)),
        "discharge_ratio":        float(discharged / (total_moves + 1)),
        "container_count":        int(container_count),
        "avg_weight":             avg_weight,
        "heavy_count":            int(heavy_count),
        "reefer_count":           int(reefer_count),
        "hazard_count":           int(hazard_count),
        "oog_count":              int(oog_count),
        "service_hash":           int(service_hash),
        "move_span_hours":        float(move_span_hours),
        "restow_intensity":       float(restow_intensity),
        "block_concentration":    float(block_concentration),
        "crane_count":            float(crane_count),
        "crane_mphc":             float(crane_mphc),
        "crane_intensity":        float(crane_intensity),
        "crane_duration_hours":   float(crane_duration_hours),
        "crane_restow_ratio":     float(crane_restow_ratio),
        "crane_exclude_ratio":    float(crane_exclude_ratio),
        "reefer_equipment_ratio": float(reefer_equipment_ratio),
        "pct_40ft":               float(pct_40ft),
        "avg_weight_kg":          avg_weight_kg,
        "heavy_ratio":            float(heavy_ratio),
        # Diagnostics (not in FEATURE_NAMES, ignored by model)
        "restow_count":           int(restows),
    }