from __future__ import annotations
import hashlib
import pandas as pd
from utils.datetime_utils import parse_datetime
from utils.position_parser import classify_move, parse_position, safe_get_pos

# check if value is yes
def _is_yes(val) -> bool:
    return str(val).strip().upper() in ("YES", "Y", "TRUE", "1")

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

    return {
        "loaded":              int(loaded),
        "discharged":          int(discharged),
        "total_moves":         int(total_moves),
        "imbalance":           int(imbalance),
        "load_ratio":          float(loaded / (total_moves + 1)),
        "discharge_ratio":     float(discharged / (total_moves + 1)),
        "container_count":     int(container_count),
        "avg_weight":          avg_weight,
        "heavy_count":         int(heavy_count),
        "reefer_count":        int(reefer_count),
        "hazard_count":        int(hazard_count),
        "oog_count":           int(oog_count),
        "service_hash":        int(service_hash),
        "move_span_hours":     float(move_span_hours),
        "restow_intensity":    float(restow_intensity),
        "block_concentration": float(block_concentration),
        # Diagnostics (not in FEATURE_NAMES, ignored by model)
        "restow_count":        int(restows),
    }