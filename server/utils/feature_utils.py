from __future__ import annotations
import hashlib
import pandas as pd
from utils.datetime_utils import parse_datetime
from utils.position_parser import parse_position

# Small helpers
def _is_yes(val) -> bool:
    """
    Checks if a string or value represents a 'yes', 'true', or '1' flag.
    """
    return str(val).strip().upper() in ("YES", "Y", "TRUE", "1")

# Feature engineering
def create_features(df: pd.DataFrame) -> dict | None:
    """
    Extracts and computes ML features from a vessel's historical container movement dataframe.
    """
    df = df.copy()

    #  Resolve event_time 
    if "event_time" not in df.columns:
        sources = ["move_complete_time", "time_in", "time_completed", "updated_at", "created_at"]
        event_time = pd.Series(
            [pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]"
        )
        for col in sources:
            if col in df.columns:
                event_time = event_time.fillna(parse_datetime(df[col], col))
        df["event_time"] = event_time

    df = df.dropna(subset=["event_time"])
    if df.empty:
        return None

    #  Time span — from move_complete_time when available 
    move_span_hours = 0.1
    if "move_complete_time" in df.columns:
        mct = pd.to_datetime(df["move_complete_time"], errors="coerce").dropna()
        if len(mct) >= 2:
            move_span_hours = max(
                (mct.max() - mct.min()).total_seconds() / 3600,
                0.1,
            )
        elif len(mct) == 1:
            # single timestamp — fall through to event_time span
            pass

    if move_span_hours <= 0.1:
        t_start = df["event_time"].min()
        t_end   = df["event_time"].max()
        move_span_hours = max((t_end - t_start).total_seconds() / 3600, 0.1)

    #  Move classification (Vectorised)
    f_str = df.get("crane_from", df.get("ctr_from_position", df.get("from_position", pd.Series(dtype=str, index=df.index)))).fillna("").astype(str).str.upper()
    t_str = df.get("crane_to", df.get("ctr_to_position", df.get("to_position", pd.Series(dtype=str, index=df.index)))).fillna("").astype(str).str.upper()

    f_is_v = f_str.str.startswith("V-")
    t_is_v = t_str.str.startswith("V-")
    f_is_y = (f_str != "") & (~f_is_v)
    t_is_y = (t_str != "") & (~t_is_v)

    is_load = f_is_y & t_is_v
    is_disc = f_is_v & t_is_y
    is_shift = (f_is_y & t_is_y) | (f_is_v & t_is_v)

    move_kind = df.get("crane_move_kind", df.get("move_kind", pd.Series(dtype=str, index=df.index))).fillna("").astype(str).str.upper()
    unknowns = ~(is_load | is_disc | is_shift)

    is_load = is_load | (unknowns & (move_kind == "LOAD"))
    is_disc = is_disc | (unknowns & (move_kind == "DISCHARGE"))
    is_shift = is_shift | (unknowns & move_kind.isin(["SHIFT", "RESTOW"]))

    loaded = int(is_load.sum())
    discharged = int(is_disc.sum())
    restows = int(is_shift.sum())

    blocks: dict[str, int] = {}
    
    def _extract_block(pos):
        p = parse_position(pos)
        return p.get("block", "UNKNOWN") if p and p.get("is_yard") else None

    if is_load.any():
        load_blocks = f_str[is_load & f_is_y].apply(_extract_block).dropna()
        for b, count in load_blocks.value_counts().items():
            blocks[str(b)] = blocks.get(str(b), 0) + int(count)

    if is_disc.any():
        disc_blocks = t_str[is_disc & t_is_y].apply(_extract_block).dropna()
        for b, count in disc_blocks.value_counts().items():
            blocks[str(b)] = blocks.get(str(b), 0) + int(count)

    total_moves = loaded + discharged

    #  Fallback when NO moves could be classified 
    # Do NOT fabricate a 50/50 split — it corrupts load_ratio/discharge_ratio.
    # Keep total_moves at len(df) but leave loaded/discharged as-is (both 0).
    if total_moves == 0:
        total_moves = len(df)

    imbalance       = abs(loaded - discharged)
    container_count = (
        int(df["unit_id"].nunique()) if "unit_id" in df.columns else max(total_moves, 1)
    )

    #  Efficiency / congestion 
    restow_intensity    = (total_moves + restows) / max(container_count, 1)
    max_block           = max(blocks.values()) if blocks else 0
    block_concentration = max_block / max(total_moves, 1)

    #  Weight / special cargo 
    w_col = "unit_weight_in_kg"
    if w_col not in df.columns:
        w_col = "verified_gross_mass_kg" if "verified_gross_mass_kg" in df.columns else None

    if w_col:
        df[w_col]    = pd.to_numeric(df[w_col], errors="coerce")
        avg_weight   = float(df[w_col].mean())  if not df[w_col].isna().all() else 0.0
        heavy_count  = int((df[w_col] > 25_000).sum())
    else:
        avg_weight, heavy_count = 0.0, 0

    reefer_count = (
        int(df["reefer"].apply(_is_yes).sum())          if "reefer"          in df.columns else 0
    )
    hazard_count = (
        int(df["hazardous_flag"].apply(_is_yes).sum())  if "hazardous_flag"  in df.columns else 0
    )
    oog_count    = (
        int(df["oog_unit"].apply(_is_yes).sum())        if "oog_unit"        in df.columns else 0
    )

    #  Service hash 
    svc = "unknown"
    if "outbound_service" in df.columns:
        vals = df["outbound_service"].dropna()
        svc  = str(vals.iloc[0]).strip() if not vals.empty else "unknown"
    service_hash = int(hashlib.md5(svc.encode()).hexdigest()[:6], 16)

    #  Container mix 
    reefer_equipment_ratio = float(
        df["equipment_type"].astype(str).str.contains("R", case=False).mean()
    ) if "equipment_type" in df.columns and not df["equipment_type"].isna().all() else 0.0

    pct_40ft = float(
        (pd.to_numeric(
            df.get("container_length", pd.Series(dtype=float)), errors="coerce"
        ) >= 40).mean()
    ) if "container_length" in df.columns and not df["container_length"].isna().all() else 0.0

    heavy_ratio = heavy_count / max(total_moves, 1)
    avg_weight_kg = float(avg_weight)

    return {
        "loaded":                 int(loaded),
        "discharged":             int(discharged),
        "total_moves":            int(total_moves),
        "imbalance":              int(imbalance),
        "load_ratio":             float(loaded  / (total_moves + 1)),
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
        "reefer_equipment_ratio": float(reefer_equipment_ratio),
        "pct_40ft":               float(pct_40ft),
        "avg_weight_kg":          avg_weight_kg,
        "heavy_ratio":            float(heavy_ratio),
        # Diagnostic (not in FEATURE_NAMES — ignored by model)
        "restow_count":           int(restows),
    }
