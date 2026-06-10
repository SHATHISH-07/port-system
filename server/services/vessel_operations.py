import logging
from typing import Tuple, Optional
import pandas as pd
from config import settings as _settings
from utils.position_parser import classify_move, parse_position, safe_get_pos
from services.crane_analytics_service import _fetch_crane_stats_batch, _compute_crane_stats
from utils.current_container_lookup import lookup_containers_by_ids

logger = logging.getLogger('port_system.services')

def _is_yes(val) -> bool:
    """
    Checks if a string or value represents a 'yes', 'true', or '1' flag.
    """
    return str(val).strip().upper() in ("YES", "Y", "TRUE", "1")

def _extract_move_side(row) -> Tuple[str, Optional[dict]]:
    """
    Determines if a crane move was a LOAD, DISCHARGE, SHIFT, or RESTOW and parses the yard position.
    """
    row = dict(row)
    from_pos = safe_get_pos(row, "crane_from", "ctr_from_position", "from_position")
    to_pos = safe_get_pos(row, "crane_to", "ctr_to_position", "to_position")
    current_pos = safe_get_pos(row, "current_position", "current_pos")

    move_type = classify_move(from_pos, to_pos)

    if move_type == "UNKNOWN":
        mk = str(row.get("crane_move_kind") or row.get("move_kind") or "").strip().upper()
        if mk in ("LOAD", "DISCHARGE", "SHIFT", "RESTOW"):
            move_type = mk

    f_p = parse_position(from_pos)
    t_p = parse_position(to_pos)
    c_p = parse_position(current_pos)

    if move_type == "LOAD":
        yard_pos = f_p if (f_p and f_p["is_yard"]) else None
    elif move_type == "DISCHARGE":
        yard_pos = t_p if (t_p and t_p["is_yard"]) else None
    elif f_p and f_p["is_yard"]:
        yard_pos = f_p
    elif t_p and t_p["is_yard"]:
        yard_pos = t_p
    elif c_p and c_p["is_yard"]:
        yard_pos = c_p
        move_type = "SNAPSHOT"
    else:
        yard_pos = None

    return move_type, yard_pos


# Crane data fetching
def discover_services_for_containers(unit_ids: list[str], yard_id: str = None) -> list[str]:
    """
    Looks up the list of containers and extracts all unique 'outbound_service' values.
    Returns a sorted list of unique vessel identifiers.
    """
    if not unit_ids:
        return []
    try:
        df = lookup_containers_by_ids(unit_ids, yard_id)
        if df is not None and not df.empty and "outbound_service" in df.columns:
            services = df["outbound_service"].dropna().astype(str).str.strip().str.upper().unique().tolist()
            # Filter out empty strings, NaN, NONE, UNKNOWN
            invalid = {"NAN", "NONE", "UNKNOWN", "NAT", ""}
            valid_services = sorted([s for s in services if s and s not in invalid])
            return valid_services
    except Exception as exc:
        logger.error(f"Error discovering services: {exc}", exc_info=True)
        
    return []

def _visit_details(visit_groups: dict) -> dict:
    """
    Extracts detailed operational metrics (stay hours, load/discharge counts, weights) per visit.
    """
    out: dict = {}
    batch_crane_stats = _fetch_crane_stats_batch(visit_groups)
    for visit_id, vdf in visit_groups.items():
        if vdf is None or vdf.empty:
            continue

        stay_hours = 0.0
        move_start = None
        move_end = None

        # Fast vectorized move counting
        f_str = vdf.get("ctr_from_position", vdf.get("from_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
        t_str = vdf.get("ctr_to_position", vdf.get("to_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
        
        # Strict matching for timestamp bounding to avoid pulling dates from other transshipment vessels
        f_is_v_strict = f_str.str.startswith(("V-", "VS-")) & f_str.str.contains(visit_id.upper())
        t_is_v_strict = t_str.str.startswith(("V-", "VS-")) & t_str.str.contains(visit_id.upper())
        involved = f_is_v_strict | t_is_v_strict
        
        # Generic matching for load/discharge counting
        f_is_v_any = f_str.str.startswith(("V-", "VS-"))
        t_is_v_any = t_str.str.startswith(("V-", "VS-"))
        f_is_y = (f_str != "") & (~f_is_v_any)
        t_is_y = (t_str != "") & (~t_is_v_any)

        # Calculate operational bounds using valid timestamps
        valid_times = pd.Series(dtype="datetime64[ns]")
        
        if "move_complete_time" in vdf.columns:
            mct = pd.to_datetime(vdf.loc[involved, "move_complete_time"], errors="coerce").dropna()
            if not mct.empty:
                valid_times = pd.concat([valid_times, mct])
                
        if "time_in" in vdf.columns:
            tin = pd.to_datetime(vdf.loc[f_is_v_strict, "time_in"], errors="coerce").dropna()
            if not tin.empty:
                valid_times = pd.concat([valid_times, tin])
                
        if "time_out" in vdf.columns:
            tout = pd.to_datetime(vdf.loc[t_is_v_strict, "time_out"], errors="coerce").dropna()
            if not tout.empty:
                valid_times = pd.concat([valid_times, tout])
                
        if len(valid_times) >= 2:
            move_start = valid_times.min()
            move_end = valid_times.max()
            stay_hours = round((move_end - move_start).total_seconds() / 3600, 2)
        
        loads = int((f_is_y & t_is_v_any).sum())
        discharges = int((f_is_v_any & t_is_y).sum())
        restow_count = int(((f_is_y & t_is_y) | (f_is_v_any & t_is_v_any)).sum())
        
        move_kind = vdf.get("crane_move_kind", vdf.get("move_kind", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
        unknowns = ~( (f_is_y & t_is_v_any) | (f_is_v_any & t_is_y) | ((f_is_y & t_is_y) | (f_is_v_any & t_is_v_any)) )
        
        if unknowns.any():
            loads += int((unknowns & (move_kind == "LOAD")).sum())
            discharges += int((unknowns & (move_kind == "DISCHARGE")).sum())
            restow_count += int((unknowns & move_kind.isin(["SHIFT", "RESTOW"])).sum())

        total_units = int(vdf["unit_id"].nunique()) if "unit_id" in vdf.columns else len(vdf)

        if loads == 0 and discharges == 0 and total_units > 0:
            # Fallback: If no positional move data is present but we have outbound units, assume they are all loads
            loads = total_units
        w_col = (
            "unit_weight_in_kg" if "unit_weight_in_kg" in vdf.columns
            else "verified_gross_mass_kg" if "verified_gross_mass_kg" in vdf.columns
            else None
        )
        avg_weight_kg = (
            float(pd.to_numeric(vdf[w_col], errors="coerce").mean())
            if w_col and not vdf[w_col].isna().all() else 0.0
        )
        # Removed unused freight_breakdown

        svc_name = (
            str(vdf["outbound_service"].iloc[0]).strip()
            if "outbound_service" in vdf.columns and not vdf["outbound_service"].isna().all()
            else None
        )

        pod_top5 = (
            vdf["port_of_discharge"].value_counts().head(5).to_dict()
            if "port_of_discharge" in vdf.columns else {}
        )

        crane_stats = batch_crane_stats.get(str(visit_id)) or _compute_crane_stats(pd.DataFrame(), total_units)

        out[str(visit_id)] = {
            "stay_hours":            stay_hours,
            "vessel_service":        svc_name,
            "start_time":            str(move_start) if move_start is not None else None,
            "end_time":              str(move_end) if move_end is not None else None,
            "loaded_containers":     loads,
            "discharged_containers": discharges,
            "move_start":            str(move_start) if move_start is not None else None,
            "move_end":              str(move_end) if move_end is not None else None,
            "restow_count":          restow_count,
            "avg_weight_kg":         avg_weight_kg,
            "port_of_discharge_top5": pod_top5,
            "assigned_cranes":       int(crane_stats.get("_crane_count", 0)),
            "cranes_assigned":       eval(crane_stats.get("_crane_ids", "[]")),
            "crane_mph":             float(crane_stats.get("_crane_mphc", 0.0)),
        }

    return out
