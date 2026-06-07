from __future__ import annotations
# cspell:disable
from models.stay_model import predict_stay_duration_from_metrics

import logging
import math
from collections import defaultdict
from typing import Optional, Tuple

import pandas as pd

from models.stay_model import predict_vessel_stay_duration
from utils.feature_utils import create_features
from utils.position_parser import (
    block_label,
    classify_move,
    parse_position,
    safe_get_pos,
)
from utils.stay_utils import compute_vessel_stay, prepare_visit_data
from config import settings as _settings
from db.queries import load_from_db
from models.stay_model import _prepare_model_visit_data as _raw_prep
from models.stay_model import _compute_raw_visit_stay as _raw_stay

logger = logging.getLogger("port_system")

# Small helpers
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
def _fetch_crane_for_visit(visit_id: str) -> pd.DataFrame:
    """
    Fetches and normalizes crane operations for a specific visit.
    """
    from db.queries import load_from_db
    try:
        df = load_from_db("crane", vessel_id=str(visit_id))
        if df.empty:
            return pd.DataFrame()

        df = df.rename(columns={
            "time_completed": "crane_time",
            "from_position":  "crane_from",
            "to_position":    "crane_to",
            "move_kind":      "crane_move_kind",
        })
        df["crane_time"] = pd.to_datetime(df["crane_time"], errors="coerce")
        return df
    except Exception as exc:
        logger.warning("crane fetch failed for %s: %s", visit_id, exc)
        return pd.DataFrame()

def discover_services_for_containers(unit_ids: list[str], yard_id: str = None) -> list[str]:
    """
    Looks up the list of containers and extracts all unique 'outbound_service' values.
    Returns a sorted list of unique vessel identifiers.
    """
    if not unit_ids:
        return []
    
    from utils.current_container_lookup import lookup_containers_by_ids
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

def _fetch_crane_counts_batch(visit_ids: list[str]) -> dict[str, int]:
    """
    Fetch distinct crane counts for multiple visits in a single DB query.
    Returns {visit_id: count}.
    """
    if not visit_ids:
        return {}
    from db.queries import load_from_db
    try:
        # Load crane operations for all visits
        df = load_from_db("crane", vessel_id=visit_ids)
        if df.empty:
            return {vid: 0 for vid in visit_ids}

        # Filter out excludes
        valid = df[df["exclude"] != "Yes"] if "exclude" in df.columns else df
        if valid.empty or "crane_id" not in valid.columns or "carrier_visit" not in valid.columns:
            return {vid: 0 for vid in visit_ids}

        # Group by carrier_visit and count unique cranes
        counts = valid.groupby("carrier_visit")["crane_id"].nunique().to_dict()
        return {str(vid): int(counts.get(vid, 0)) for vid in visit_ids}
    except Exception as exc:
        logger.warning("Batch crane fetch failed: %s", exc)
    return {vid: 0 for vid in visit_ids}

def _fetch_crane_stats_batch(visit_groups: dict) -> dict:
    """
    Fetches and computes crane statistics for a batch of vessel visits.
    """
    visit_ids = list(visit_groups.keys())
    if not visit_ids:
        return {}
    from db.queries import load_from_db
    try:
        df = load_from_db("crane", vessel_id=visit_ids)
        if not df.empty:
            df = df.rename(columns={
                "time_completed": "crane_time",
                "from_position":  "crane_from",
                "to_position":    "crane_to",
                "move_kind":      "crane_move_kind",
            })
            df["crane_time"] = pd.to_datetime(df["crane_time"], errors="coerce")
    except Exception as exc:
        logger.warning("batch crane fetch failed: %s", exc)
        df = pd.DataFrame()

    out = {}
    crane_by_visit = {}
    if not df.empty and "carrier_visit" in df.columns:
        crane_by_visit = dict(tuple(df.groupby("carrier_visit")))

    for vid, vdf in visit_groups.items():
        container_count = int(vdf["unit_id"].nunique()) if "unit_id" in vdf.columns else len(vdf)
        crane_df = crane_by_visit.get(vid, pd.DataFrame())
        out[vid] = _compute_crane_stats(crane_df, container_count)
        
    return out

def _compute_crane_stats(crane_df: pd.DataFrame, container_count: int) -> dict:
    """
    Computes crane productivity (moves per hour), duration, and restow ratios for a visit.
    """
    empty_stats = {
        "_crane_move_count":      0,
        "_crane_effective_moves": 0,
        "_crane_count":           0.0,
        "_crane_duration_hours":  0.1,
        "_crane_mphc":            0.0,
        "_crane_intensity":       0.0,
        "_crane_restow_ratio":    0.0,
        "_crane_exclude_ratio":   0.0,
        "_crane_ids":             "[]",
    }
    if crane_df.empty:
        return empty_stats

    total_moves = len(crane_df)
    valid = crane_df[crane_df["exclude"] != "Yes"] if "exclude" in crane_df.columns else crane_df
    if valid.empty:
        return {**empty_stats, "_crane_move_count": total_moves}

    crane_count = int(valid["crane_id"].nunique()) if "crane_id" in valid.columns else 0
    IDLE_THRESHOLD_SEC = _settings.CRANE_IDLE_THRESHOLD_MINUTES * 60

    crane_mphs: list[float] = []
    total_active_hours = 0.0
    for _, cgrp in valid.groupby("crane_id"):
        sorted_times = cgrp["crane_time"].dropna().sort_values()
        if len(sorted_times) < 2:
            continue
        gaps = sorted_times.diff().dt.total_seconds().dropna()
        active_gaps = gaps[gaps <= IDLE_THRESHOLD_SEC]
        if active_gaps.empty:
            active_hrs = len(sorted_times) * (3 / 60)
        else:
            active_hrs = max(active_gaps.sum() / 3600, 0.05)
        total_active_hours += active_hrs
        crane_mphs.append(len(cgrp) / active_hrs)

    eff = len(valid)
    mphc = round(sum(crane_mphs) / max(len(crane_mphs), 1), 2) if crane_mphs else 0.0

    restows = (
        len(valid[valid["crane_move_kind"].isin(["RESTOW", "SHIFT"])])
        if "crane_move_kind" in valid.columns else 0
    )
    crane_ids = valid["crane_id"].dropna().unique().tolist() if "crane_id" in valid.columns else []

    return {
        "_crane_move_count":      total_moves,
        "_crane_effective_moves": eff,
        "_crane_count":           float(crane_count),
        "_crane_duration_hours":  float(total_active_hours),
        "_crane_mphc":            float(mphc),
        "_crane_intensity":       float(eff / max(container_count, 1)),
        "_crane_restow_ratio":    float(restows / eff) if eff > 0 else 0.0,
        "_crane_exclude_ratio":   float((total_moves - eff) / total_moves) if total_moves > 0 else 0.0,
        "_crane_ids":             str(crane_ids[:8]),
    }

# Group enrichment
# Visit detail extraction
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

        if "move_complete_time" in vdf.columns:
            mct = pd.to_datetime(vdf["move_complete_time"], errors="coerce").dropna()
            if len(mct) >= 2:
                move_start = mct.min()
                move_end = mct.max()
                stay_hours = round((move_end - move_start).total_seconds() / 3600, 2)

        if stay_hours == 0.0:
            for tc in ("time_in", "updated_at", "created_at"):
                if tc in vdf.columns and vdf[tc].notna().any():
                    times = pd.to_datetime(vdf[tc], errors="coerce").dropna()
                    if len(times) >= 2:
                        stay_hours = round((times.max() - times.min()).total_seconds() / 3600, 2)
                    break

        # Fast vectorized move counting
        f_str = vdf.get("ctr_from_position", vdf.get("from_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
        t_str = vdf.get("ctr_to_position", vdf.get("to_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
        
        f_is_v = f_str.str.startswith("V-")
        t_is_v = t_str.str.startswith("V-")
        f_is_y = (f_str != "") & (~f_is_v)
        t_is_y = (t_str != "") & (~t_is_v)
        
        loads = int((f_is_y & t_is_v).sum())
        discharges = int((f_is_v & t_is_y).sum())
        restow_count = int(((f_is_y & t_is_y) | (f_is_v & t_is_v)).sum())
        
        move_kind = vdf.get("crane_move_kind", vdf.get("move_kind", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
        unknowns = ~( (f_is_y & t_is_v) | (f_is_v & t_is_y) | ((f_is_y & t_is_y) | (f_is_v & t_is_v)) )
        
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

# Operational metrics prediction
def _calculate_delay_analysis(visit_df) -> list:
    """Analyse potential delay causes from container operation data only."""
    causes = []
    if visit_df is None or visit_df.empty:
        return causes

    if "move_complete_time" in visit_df.columns:
        mct = pd.to_datetime(visit_df["move_complete_time"], errors="coerce").dropna().sort_values()
        if len(mct) >= 2:
            gaps_min = mct.diff().dt.total_seconds().dropna() / 60
            long_gaps = gaps_min[gaps_min > 60]
            if not long_gaps.empty:
                causes.append({
                    "factor": "Operational Gaps",
                    "impact": "Medium",
                    "reason": f"Detected {len(long_gaps)} move-completion gaps exceeding 60 mins.",
                    "recommendation": "Review crane allocation",
                })
        
        # M-Cycle (Dual Cycle) percentage analysis
        mct_df = visit_df.dropna(subset=["move_complete_time"]).copy()
        if not mct_df.empty:
            mct_df["move_complete_time"] = pd.to_datetime(mct_df["move_complete_time"], errors="coerce")
            mct_df = mct_df.dropna(subset=["move_complete_time"]).sort_values("move_complete_time")
            if len(mct_df) > 10:
                f_str_mct = mct_df.get("ctr_from_position", mct_df.get("from_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
                t_str_mct = mct_df.get("ctr_to_position", mct_df.get("to_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
                
                is_load = (~f_str_mct.str.startswith("V-")) & t_str_mct.str.startswith("V-")
                is_disc = f_str_mct.str.startswith("V-") & (~t_str_mct.str.startswith("V-"))
                
                mct_df["op_type"] = "OTHER"
                mct_df.loc[is_load, "op_type"] = "LOAD"
                mct_df.loc[is_disc, "op_type"] = "DISCHARGE"
                
                productive_mask = mct_df["op_type"].isin(["LOAD", "DISCHARGE"])
                if productive_mask.sum() > 10:
                    prod_df = mct_df[productive_mask].copy()
                    prod_df["prev_op"] = prod_df["op_type"].shift(1)
                    prod_df["gap_mins"] = prod_df["move_complete_time"].diff().dt.total_seconds() / 60
                    
                    dual_cycles = (
                        (prod_df["op_type"] != prod_df["prev_op"]) &
                        (prod_df["prev_op"].notna()) &
                        (prod_df["gap_mins"] <= 15)
                    ).sum()
                    
                    productive = len(prod_df)
                    dual_cycle_rate = (dual_cycles / productive) * 100
                    
                    if dual_cycle_rate < 15.0:
                        causes.append({
                            "factor": "Low M-Cycle Percentage",
                            "impact": "Low",
                            "reason": f"Only {dual_cycle_rate:.1f}% dual-cycles (M-cycles) detected. Poor interleaving of loads and discharges.",
                            "recommendation": "Improve stacking and consolidation",
                        })

    # Fast vectorised restow count
    f_str = visit_df.get("ctr_from_position", visit_df.get("from_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    t_str = visit_df.get("ctr_to_position", visit_df.get("to_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    
    f_is_v = f_str.str.startswith("V-")
    t_is_v = t_str.str.startswith("V-")
    f_is_y = (f_str != "") & (~f_is_v)
    t_is_y = (t_str != "") & (~t_is_v)
    
    restow_count = int(((f_is_y & t_is_y) | (f_is_v & t_is_v)).sum())
    move_kind = visit_df.get("crane_move_kind", visit_df.get("move_kind", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    unknowns = ~( (f_is_y & t_is_v) | (f_is_v & t_is_y) | ((f_is_y & t_is_y) | (f_is_v & t_is_v)) )
    if unknowns.any():
        restow_count += int((unknowns & move_kind.isin(["SHIFT", "RESTOW"])).sum())

    if restow_count > 20:
        causes.append({
            "factor": "High Restow Rate",
            "impact": "Medium",
            "reason": f"{restow_count} restow/shift moves detected — increases berth time.",
            "recommendation": "Improve stacking and consolidation",
        })

    # Fetch visit_id to get crane data
    visit_id = None
    if "actual_outbound_carrier_visit_id" in visit_df.columns and not visit_df["actual_outbound_carrier_visit_id"].isna().all():
        visit_id = str(visit_df["actual_outbound_carrier_visit_id"].dropna().iloc[0])

    crane_df = pd.DataFrame()
    if visit_id:
        try:
            from db.queries import load_from_db
            crane_df = load_from_db("crane", vessel_id=[visit_id])
        except Exception as e:
            print(f"Error loading crane df in delay analysis: {e}")

    # 1. Crane idle time
    if not crane_df.empty and "crane_id" in crane_df.columns and "time_completed" in crane_df.columns:
        crane_mct = crane_df.dropna(subset=["time_completed"]).sort_values(["crane_id", "time_completed"])
        if not crane_mct.empty:
            crane_mct["time_completed"] = pd.to_datetime(crane_mct["time_completed"], errors="coerce")
            crane_mct = crane_mct.dropna(subset=["time_completed"])
            crane_mct["gap_mins"] = crane_mct.groupby("crane_id")["time_completed"].diff().dt.total_seconds() / 60
            idle_gaps = crane_mct[crane_mct["gap_mins"] > 30]
            if not idle_gaps.empty:
                causes.append({
                    "factor": "Crane Idle Time",
                    "impact": "High",
                    "reason": f"Detected {len(idle_gaps)} instances of crane idle time >30 mins.",
                    "recommendation": "Review crane allocation",
                })

    # 2. Container availability timing
    if "time_in" in visit_df.columns:
        loads = visit_df[f_is_y & t_is_v]
        if not loads.empty and "move_complete_time" in loads.columns:
            first_load_time = pd.to_datetime(loads["move_complete_time"], errors="coerce").min()
            if pd.notna(first_load_time):
                time_in = pd.to_datetime(visit_df["time_in"], errors="coerce")
                late_arrivals = visit_df[(time_in > first_load_time)]
                if not late_arrivals.empty:
                    causes.append({
                        "factor": "Container not ready",
                        "impact": "High",
                        "reason": f"{len(late_arrivals)} containers arrived after vessel loading started.",
                        "recommendation": "Improve yard readiness before arrival",
                    })

    # 3. Long unladen travel & ITV congestion
    try:
        from services.xml_layout_service import xml_layout_service
        xml_distances = xml_layout_service.compute_distances()
        if "block_to_berth" in xml_distances:
            from utils.position_parser import parse_position
            load_blocks = f_str[f_is_y & t_is_v].apply(lambda x: parse_position(str(x), "").get("block") if parse_position(str(x), "").get("is_yard") else None).dropna()
            if not load_blocks.empty:
                long_travel_count = 0
                for bk in load_blocks:
                    if bk in xml_distances["block_to_berth"]:
                        berths = xml_distances["block_to_berth"][bk]
                        if berths:
                            b_name = list(berths.keys())[0]
                            dist = berths[b_name].get("distance_m", 0)
                            if dist > 800:
                                long_travel_count += 1
                if long_travel_count > len(load_blocks) * 0.3:
                    causes.append({
                        "factor": "ITV congestion / Long unladen travel",
                        "impact": "Medium",
                        "reason": f"{long_travel_count} load moves originated from blocks >800m from the berth.",
                        "recommendation": "Review corridor planning",
                    })
    except Exception as e:
        print(f"Error computing unladen travel delay: {e}")

    # 4. Crane crossing conflicts
    if not crane_df.empty and "crane_id" in crane_df.columns:
        crane_bays = {}
        from utils.position_parser import parse_position
        for row in crane_df.to_dict('records'):
            cid = row.get("crane_id")
            pos = row.get("from_position") or row.get("to_position")
            if pd.isna(cid) or pd.isna(pos):
                continue
            p_info = parse_position(str(pos), "")
            if p_info and p_info.get("is_vessel"):
                bay = p_info.get("bay")
                if bay and str(bay).isdigit():
                    bay = int(bay)
                    if cid not in crane_bays:
                        crane_bays[cid] = {"min": bay, "max": bay}
                    else:
                        crane_bays[cid]["min"] = min(crane_bays[cid]["min"], bay)
                        crane_bays[cid]["max"] = max(crane_bays[cid]["max"], bay)
        
        c_ids = list(crane_bays.keys())
        crossing_conflicts = 0
        for i in range(len(c_ids)):
            for j in range(i+1, len(c_ids)):
                b1 = crane_bays[c_ids[i]]
                b2 = crane_bays[c_ids[j]]
                if b1["max"] >= b2["min"] and b1["min"] <= b2["max"]:
                    crossing_conflicts += 1
        
        if crossing_conflicts > 0:
            causes.append({
                "factor": "Crane crossing conflicts",
                "impact": "High",
                "reason": f"Detected {crossing_conflicts} instances of crane working zone (bay) overlap.",
                "recommendation": "Review crane deployment zones",
            })

    return causes

# Berth table builder
# Dashboard & Heatmap builders
def get_yard_heatmap_data(
    unit_ids: list[str],
    yard_id: str = None,
    vessel_id: str = None,
) -> dict:
    """
    Unified endpoint for all map/heatmap/terminal visualization data.
    """
    visit_id = ""

    if unit_ids:
        from utils.current_container_lookup import lookup_containers_by_ids
        full_df = lookup_containers_by_ids(unit_ids, yard_id)
        df = full_df.copy() if full_df is not None else pd.DataFrame()
        if not df.empty:
            df["unit_id"] = df["unit_id"].astype(str).str.strip().str.upper()
            if "actual_outbound_carrier_visit_id" in df.columns:
                valid_visits = df["actual_outbound_carrier_visit_id"].dropna()
                if not valid_visits.empty:
                    visit_id = str(valid_visits.iloc[0])
            if "outbound_service" in df.columns:
                if vessel_id:
                    # Filter specifically for the selected outbound service
                    df = df[df["outbound_service"].astype(str).str.strip().str.upper() == vessel_id.strip().upper()].copy()
                
                valid_services = df["outbound_service"].dropna()
                if not valid_services.empty:
                    # After filter, this represents the targeted vessel
                    # or the first available if no specific filter was applied
                    found_vessel_id = str(valid_services.iloc[0])
                    if not vessel_id:
                        vessel_id = found_vessel_id
            
    else:
        return {"error": "Must provide unit_ids"}

    if not df.empty:
        if "unit_id" in df.columns:
            df["unit_id"] = df["unit_id"].astype(str).str.strip().str.upper()
            sort_cols = [c for c in ["updated_at", "time_in", "created_at"] if c in df.columns]
            if sort_cols:
                df = df.sort_values(sort_cols, ascending=False)
            df = df.drop_duplicates(subset=["unit_id"], keep="first")
        
        if not df.empty and "actual_outbound_carrier_visit_id" in df.columns:
            valid_visits = df["actual_outbound_carrier_visit_id"].dropna()
            if not valid_visits.empty:
                visit_id = str(valid_visits.iloc[0])

    if df.empty:
        return {
            "vessel": vessel_id or "",
            "visit_id": "",
            "yard_id": yard_id,
            "error": f"No containers found for request",
            "blocks": [],
            "summary": {
                "total_containers": 0,
                "total_blocks": 0,
                "reefer_total": 0,
                "hazmat_total": 0,
                "oog_total": 0,
            },
            "infrastructure": _get_infrastructure([]),
            "berth_analysis": [],
            "conflict_table": [],
            "primary_berth": {},
        }

    if unit_ids and "unit_id" in df.columns:
        unit_ids_upper = [u.strip().upper() for u in unit_ids]
        df = df[df["unit_id"].astype(str).str.strip().str.upper().isin(unit_ids_upper)].copy()

    if df.empty:
        return {
            "vessel": vessel_id,
            "visit_id": "",
            "yard_id": yard_id,
            "error": "No matching containers found in the yard",
            "blocks": [],
            "summary": {
                "total_containers": 0,
                "total_blocks": 0,
                "reefer_total": 0,
                "hazmat_total": 0,
                "oog_total": 0,
            },
            "infrastructure": _get_infrastructure([]),
            "berth_analysis": [],
            "conflict_table": [],
            "primary_berth": {},
        }

    blocks = defaultdict(lambda: {
        "density": 0,
        "reefer": 0,
        "hazmat": 0,
        "oog": 0,
        "stack_heights": [],
        "max_stack": 0,
        "unit_rows": [],
    })

    for row in df.to_dict('records'):
        visit_state = str(row.get("visit_state", "") or "").upper()
        is_loaded = "DEPARTED" in visit_state
        pos_str = str(row.get("ctr_from_position", "")) if is_loaded else str(row.get("current_position", ""))
        if not pos_str or str(pos_str) == "nan":
            pos_str = str(row.get("current_position") or row.get("ctr_to_position") or row.get("ctr_from_position") or "")
        
        if not pos_str:
            continue

        pos_info = parse_position(pos_str, yard_id)
        if not pos_info or not pos_info["is_yard"]:
            continue

        bk = block_label(pos_info) or "UNKNOWN"
        b = blocks[bk]
        b["density"] += 1

        if _is_yes(row.get("reefer")):
            b["reefer"] += 1
        if _is_yes(row.get("hazardous_flag")):
            b["hazmat"] += 1
        if _is_yes(row.get("oog_unit")):
            b["oog"] += 1

        tier = pos_info.get("tier")
        try:
            h = int(tier) if tier and str(tier).isdigit() else 1
            b["stack_heights"].append(h)
            if h > b["max_stack"]:
                b["max_stack"] = h
        except Exception:
            pass

        b["unit_rows"].append(row)

    block_list = []
    max_density = max((b["density"] for b in blocks.values()), default=1)

    for bk, data in blocks.items():
        avg_h = sum(data["stack_heights"]) / len(data["stack_heights"]) if data["stack_heights"] else 1
        density_pct = round(data["density"] / max(max_density, 1), 4)

        # FIX: concentration label per block (Red/Orange/Green)
        concentration_label = (
            "Red" if density_pct >= 0.7
            else "Orange" if density_pct >= 0.4
            else "Green"
        )

        block_list.append({
            "block_id": bk,
            "total_containers": data["density"],
            "reefer_count": data["reefer"],
            "hazmat_count": data["hazmat"],
            "oog_count": data["oog"],
            "density_pct": density_pct,
            "concentration_label": concentration_label,
            "avg_stack_height": round(avg_h, 1),
            "distance_to_berth_m": None,  # populated after XML distance calc
            "containers": []
        })

        for u in data["unit_rows"]:
            visit_state = str(u.get("visit_state", "") or "").upper()
            is_loaded = "DEPARTED" in visit_state
            c_pos = str(u.get("ctr_from_position", "")) if is_loaded else str(u.get("current_position", ""))
            if not c_pos or str(c_pos) == "nan":
                c_pos = str(u.get("current_position") or u.get("ctr_to_position") or u.get("ctr_from_position") or "")

            p_info = parse_position(c_pos, yard_id)

            # FIX: derive weight_class from unit_weight_in_kg or verified_gross_mass
            raw_weight = u.get("unit_weight_in_kg") or u.get("verified_gross_mass_kg")
            try:
                w_kg = float(raw_weight) if raw_weight and str(raw_weight) not in ("nan", "None", "") else 0
            except (ValueError, TypeError):
                w_kg = 0
            weight_class = (
                "HEAVY" if w_kg >= 20000
                else "MEDIUM" if w_kg >= 10000
                else "LIGHT"
            )

            block_list[-1]["containers"].append({
                "unit_id": u.get("unit_id"),
                "position": c_pos,
                "bay": p_info.get("bay") if p_info else "-",
                "row": p_info.get("row") if p_info else "-",
                "tier": p_info.get("tier") if p_info else "-",
                "freight_kind": u.get("freight_kind"),
                "outbound_service": u.get("outbound_service"),
                "category": u.get("category_id"),
                "hazardous": _is_yes(u.get("hazardous_flag")),
                "reefer": _is_yes(u.get("reefer")),
                "oog": _is_yes(u.get("oog_unit")),
                "equipment_class": u.get("equipment_class") or "CONTAINER",
                "container_length": u.get("container_length"),
                "weight_class": weight_class,
            })

    summary = {
        "total_containers": sum(b["total_containers"] for b in block_list),
        "total_blocks": len(block_list),
        "reefer_total": sum(b["reefer_count"] for b in block_list),
        "hazmat_total": sum(b["hazmat_count"] for b in block_list),
        "oog_total": sum(b["oog_count"] for b in block_list),
    }

    unique_blocks = [b["block_id"] for b in block_list]
    
    from config import settings
    full_layout = None
    try:
        from services.xml_layout_service import xml_layout_service
        full_layout = xml_layout_service.parse(settings.TERMINAL_XML_PATH)
    except Exception:
        pass

    berth_analysis: list[dict] = []
    conflict_table: list[dict] = []
    primary_berth: dict = {}

    total_all = summary["total_containers"] or 1
    
    # 1. Get XML Berths
    berths_data = full_layout.get("berths", {}) if full_layout else {}
    if not berths_data:
        berths_data = {"Berth 1": {"name": "Berth 1", "center": (0.185, 0.55)}}
        
    yard_w = full_layout.get("bbox", {}).get("width", 1500) if full_layout else 1500
    yard_h = full_layout.get("bbox", {}).get("height", 800) if full_layout else 800
    NEAR_THRESHOLD_M = 600

    xml_distances = {}
    if full_layout:
        try:
            from services.xml_layout_service import xml_layout_service
            xml_distances = xml_layout_service.compute_distances(cached=full_layout)
        except Exception as e:
            logger.error(f"Failed to compute xml distances: {e}")

    # 2. Calculate Berth Metrics
    berth_metrics = []
    for berth_id, berth_info in berths_data.items():
        berth_name = berth_info.get("name", berth_id)
        berth_cx, berth_cy = berth_info.get("center", (0.185, 0.55))
        
        near_count = 0
        near_blocks = set()
        total_laden = 0
        corridors = set()
        equipment = set()
        
        for bk_data in block_list:
            bk_id = bk_data["block_id"]
            bk_count = bk_data["total_containers"]
            
            dist_m = 500
            
            if full_layout:
                if bk_id in xml_distances.get("block_to_berth", {}):
                    if berth_id in xml_distances["block_to_berth"][bk_id]:
                        d_info = xml_distances["block_to_berth"][bk_id][berth_id]
                        dist_m = d_info.get("distance_m", 500)
                        for node in d_info.get("route", []):
                            corridors.add(node)
                
                bk_info = full_layout.get("blocks", {}).get(bk_id, {})
                if bk_info.get("type"):
                    equipment.add(bk_info["type"])
            else:
                # Fallback to math
                b_cx, b_cy = 0.5, 0.5
                dx_norm = abs(b_cx - berth_cx)
                dy_norm = abs(b_cy - berth_cy)
                dist_m = int((dx_norm * yard_w + dy_norm * yard_h) / 100)
            
            # The routing distance is exactly in metres
            dist_m = int(dist_m)

            if dist_m <= NEAR_THRESHOLD_M:
                near_count += bk_count
                near_blocks.add(bk_id)
                
            total_laden += bk_count * dist_m

            # FIX: populate distance_to_berth_m on each block
            for bl in block_list:
                if bl["block_id"] == bk_id and bl["distance_to_berth_m"] is None:
                    bl["distance_to_berth_m"] = dist_m

        concentration_pct = round((near_count / total_all) * 100, 2)
        avg_dist = int(total_laden / total_all) if total_all > 0 else 0

        # FIX: unladen travel = return trips (empty trucks), ~85% of laden distance
        total_unladen = int(total_laden * 0.85)

        berth_metrics.append({
            "berth_name": berth_name,
            "concentration_pct": concentration_pct,
            "near_count": near_count,
            "avg_dist": avg_dist,
            "total_laden": total_laden,
            "total_unladen": total_unladen,
            "near_blocks": near_blocks,
            "corridors": corridors,
            "equipment": equipment
        })
        
    # Sort: Highest concentration first, then shortest avg distance
    berth_metrics.sort(key=lambda x: (-x["concentration_pct"], x["avg_dist"]))

    # Dynamic Crane Capacity Calculation
    dynamic_crane_capacity = 60.0 # Default fallback
    try:
        from db.queries import get_engine
        from sqlalchemy import text
        import pandas as pd
        
        outbound_svc = str(df["outbound_service"].dropna().iloc[0]).strip().upper() if not df.empty and "outbound_service" in df.columns else None
        if outbound_svc:
            query = text("""
                SELECT 
                    visit_id as actual_outbound_carrier_visit_id,
                    MIN(time_in) as first_move,
                    MAX(move_complete_time) as last_move,
                    COUNT(unit_id) as total_moves
                FROM containers 
                WHERE UPPER(TRIM(outbound_service)) = :svc
                  AND visit_id IS NOT NULL
                  AND move_complete_time IS NOT NULL
                GROUP BY visit_id
            """)
            engine = get_engine()
            hist_df = pd.read_sql(query, engine, params={"svc": outbound_svc})
            
            if not hist_df.empty:
                hist_df["first_move"] = pd.to_datetime(hist_df["first_move"])
                hist_df["last_move"] = pd.to_datetime(hist_df["last_move"])
                hist_df["stay_hours"] = (hist_df["last_move"] - hist_df["first_move"]).dt.total_seconds() / 3600.0
                
                valid_stays = hist_df[hist_df["stay_hours"] > 0].copy()
                if not valid_stays.empty:
                    valid_stays["mph"] = valid_stays["total_moves"] / valid_stays["stay_hours"]
                    avg_stay = valid_stays["stay_hours"].mean()
                    
                    visit_ids = valid_stays["actual_outbound_carrier_visit_id"].tolist()
                    from services.vessel_service import _fetch_crane_counts_batch
                    crane_counts = _fetch_crane_counts_batch(visit_ids)
                    
                    mph_list = []
                    for _, row in valid_stays.iterrows():
                        v_id = row["actual_outbound_carrier_visit_id"]
                        cc = crane_counts.get(v_id, 0)
                        if cc > 0:
                            mph_list.append(row["mph"] / cc)
                            
                    avg_crane_mph = sum(mph_list) / len(mph_list) if mph_list else 25.0
                    dynamic_crane_capacity = max(10.0, avg_stay * avg_crane_mph)
    except Exception as e:
        print(f"Error calculating dynamic crane capacity: {e}")

    for idx, b in enumerate(berth_metrics, start=1):
        dist_m = b["avg_dist"]
        travel_distance_label = "Short" if dist_m < 500 else "Moderate" if dist_m < 1200 else "Long"
        
        risk = (
            "High" if b["concentration_pct"] >= _settings.BERTH_HIGH_RISK_SHARE_PCT
            else "Medium" if b["concentration_pct"] >= _settings.BERTH_MEDIUM_RISK_SHARE_PCT
            else "Low"
        )
        
        # FIX: unladen distance is separate from laden
        unladen_dist = int(b["total_unladen"] / total_all) if total_all > 0 else 0

        berth_analysis.append({
            "rank":                    idx,
            "berth":                   b["berth_name"],
            "terminal":                yard_id or "YARD",
            "near_blocks":             sorted(list(b["near_blocks"])),
            "total_moves":             b["near_count"],
            "load_moves":              b["near_count"],
            "discharge_moves":         0,
            "cargo_concentration_pct": b["concentration_pct"],
            "intensity":               round(b["concentration_pct"] / 100, 4),
            "recommended_cranes":      max(1, math.ceil(b["near_count"] / dynamic_crane_capacity)),
            "congestion_risk":         risk,
            "hazardous":               summary.get("hazmat_total", 0),
            "reefer":                  summary.get("reefer_total", 0),
            "oog":                     summary.get("oog_total", 0),
            "unique_containers":       b["near_count"],
            "impact_score":            dist_m,
            "travel_distance_score":   dist_m,
            "travel_distance_label":   travel_distance_label,
            "laden_travel_distance_m": dist_m,
            "unladen_travel_distance_m": unladen_dist,
            "avg_laden_distance_m":    b["avg_dist"],
            "avg_unladen_distance_m":  unladen_dist,
            "corridor_congestion": (
                "High" if b["concentration_pct"] > 80
                else "Moderate" if b["concentration_pct"] > 40
                else "Low"
            ),
            "mitigation": (
                "Deploy additional transport units"
                if dist_m >= 500 else "Standard operations"
            ),
            "_near_blocks_set": b["near_blocks"],
            "_corridors_set": b.get("corridors", set()),
            "_equipment_set": b.get("equipment", set()),
        })

    if berth_analysis:
        # 1. Target Vessel Window
        target_visit_id = str(visit_id) if visit_id else ""
        min_time, max_time = pd.NaT, pd.NaT
        if not df.empty and "move_complete_time" in df.columns:
            mct = pd.to_datetime(df["move_complete_time"], errors="coerce").dropna()
            if not mct.empty:
                min_time = mct.min()
                max_time = mct.max()
        
        # 2. Query Concurrent Vessels
        concurrent_vessels = {}  # visit_id -> {"service": str, "blocks": set()}
        if pd.notna(min_time) and pd.notna(max_time):
            try:
                cdf = pd.DataFrame()
                if "full_df" in locals() and full_df is not None and not full_df.empty:
                    if "outbound_service" in full_df.columns:
                        target = str(vessel_id).strip().upper() if vessel_id else ""
                        mask = (
                            (full_df["outbound_service"].astype(str).str.strip().str.upper() != target) &
                            (full_df["outbound_service"].notna())
                        )
                        cdf = full_df[mask].copy()

                for crow in cdf.to_dict('records'):
                    v_id = crow.get("actual_outbound_carrier_visit_id") or crow.get("outbound_service")
                    if v_id not in concurrent_vessels:
                        concurrent_vessels[v_id] = {"service": crow.get("outbound_service"), "blocks": set()}
                    
                    visit_state = str(crow.get("visit_state", "") or "").upper()
                    is_loaded = "DEPARTED" in visit_state
                    c_pos = str(crow.get("ctr_from_position", "")) if is_loaded else str(crow.get("current_position", ""))
                    
                    if c_pos and c_pos.lower() not in ('nan', 'none'):
                        cp_info = parse_position(str(c_pos), yard_id)
                        if cp_info and cp_info.get("is_yard"):
                            cbk = block_label(cp_info)
                            if cbk:
                                concurrent_vessels[v_id]["blocks"].add(cbk)
            except Exception as e:
                print(f"Error querying concurrent vessels: {e}")

        # Fetch Cranes for Target and Concurrent Vessels
        vessel_crane_map = {}
        target_cranes = []
        try:
            all_vids = [target_visit_id] + list(concurrent_vessels.keys())
            from db.queries import load_from_db
            import re
            
            crane_df = load_from_db("crane", vessel_id=all_vids)
            if not crane_df.empty and "crane_id" in crane_df.columns and "carrier_visit" in crane_df.columns:
                for cv, grp in crane_df.groupby("carrier_visit"):
                    c_ids = grp["crane_id"].dropna().unique().tolist()
                    nums = []
                    for cid in c_ids:
                        m = re.search(r'\d+', str(cid))
                        if m:
                            nums.append(int(m.group()))
                    vessel_crane_map[str(cv)] = sorted(nums)
            
            target_cranes = vessel_crane_map.get(target_visit_id, [])
        except Exception as e:
            print(f"Error querying cranes for conflicts: {e}")

        # Enrich concurrent vessels with XML corridors and equipment
        for v_id, v_data in concurrent_vessels.items():
            v_data["corridors"] = set()
            v_data["equipment"] = set()
            if full_layout:
                for bk in v_data["blocks"]:
                    if bk in xml_distances.get("block_to_berth", {}):
                        xml_berth_names = list(xml_distances["block_to_berth"][bk].keys())
                        xml_b = xml_berth_names[0] if xml_berth_names else None
                        if xml_b:
                            for node in xml_distances["block_to_berth"][bk][xml_b].get("route", []):
                                v_data["corridors"].add(node)
                    bk_info = full_layout.get("blocks", {}).get(bk, {})
                    if bk_info.get("type"):
                        v_data["equipment"].add(bk_info["type"])

        for row in berth_analysis:
            conflicts: list[dict] = []
            row_berth = row["berth"]
            # FIX: use internal keys then remove them, keeping near_blocks in response
            near_blocks = row.pop("_near_blocks_set", set())
            corridors = row.pop("_corridors_set", set())
            equipment = row.pop("_equipment_set", set())
            
            for v_id, v_data in concurrent_vessels.items():
                shared_blocks = list(near_blocks.intersection(v_data["blocks"]))
                shared_corridors = list(corridors.intersection(v_data["corridors"]))
                shared_equipment = list(equipment.intersection(v_data["equipment"]))
                print(f"DEBUG: berth={row_berth}, v_id={v_id}, near_blocks={near_blocks}, v_data_blocks={v_data['blocks']}, shared={shared_blocks}")
                
                conflict_types = []
                if shared_blocks: 
                    conflict_types.append("Block Overlap")
                if len(shared_corridors) >= 2: 
                    conflict_types.append("Corridor Overlap")
                if "TRANSTAINER" in shared_equipment: 
                    conflict_types.append("Equipment Competition")
                
                # Check for Crane Rail / Working Zone Overlap
                c_cranes = vessel_crane_map.get(str(v_id), [])
                if target_cranes and c_cranes:
                    shared_c = set(target_cranes).intersection(c_cranes)
                    if shared_c:
                        conflict_types.append("Crane Rail Overlap")
                    else:
                        t_min, t_max = min(target_cranes), max(target_cranes)
                        c_min, c_max = min(c_cranes), max(c_cranes)
                        if t_max > c_min and t_min < c_max:
                            conflict_types.append("Crane Rail Overlap")
                
                if conflict_types:
                    overlap_hours = round((max_time - min_time).total_seconds() / 3600, 1) if pd.notna(max_time) else 0
                    shared_block_pct = round((len(shared_blocks) / len(near_blocks)) * 100, 1) if near_blocks else 0
                    conflicts.append({
                        "vessel_service": str(v_data["service"]),
                        "visit_id": str(v_id),
                        "shared_blocks": shared_blocks,
                        "shared_block_pct": shared_block_pct,
                        "shared_corridors": shared_corridors,
                        "shared_equipment": shared_equipment,
                        "conflict_types": conflict_types,
                        "overlap_hours": overlap_hours
                    })

            reason = (
                f"High concentration — {row['cargo_concentration_pct']}% of cargo located nearby."
                if row["cargo_concentration_pct"] > 60
                else f"Moderate load — {row['cargo_concentration_pct']}% of cargo nearby."
                if row["cargo_concentration_pct"] > 30
                else f"{row['cargo_concentration_pct']}% of cargo located nearby."
            )
            
            if conflicts:
                svc = conflicts[0]["vessel_service"]
                hrs = conflicts[0]["overlap_hours"]
                ctype = conflicts[0]["conflict_types"][0] if conflicts[0].get("conflict_types") else "Operational Conflict"
                
                mitigation = "Standard operations"
                if "Crane Rail Overlap" in conflicts[0]["conflict_types"]:
                    mitigation = "Adjust crane allocation"
                elif "Block Overlap" in conflicts[0]["conflict_types"]:
                    mitigation = "Pre-consolidate yard cargo"
                
                if len(conflicts[0]["conflict_types"]) > 1 or len(conflicts) > 1:
                    mitigation = "Change berth"

                # FIX: Granular risk classification based on conflict severity
                total_conflict_types = set()
                max_shared_pct = 0
                for c in conflicts:
                    total_conflict_types.update(c["conflict_types"])
                    max_shared_pct = max(max_shared_pct, c.get("shared_block_pct", 0))

                if (len(total_conflict_types) >= 3
                    or "Crane Rail Overlap" in total_conflict_types
                    or max_shared_pct >= 50
                    or len(conflicts) >= 3):
                    conflict_risk = "High"
                elif (len(total_conflict_types) >= 2
                      or max_shared_pct >= 25
                      or len(conflicts) >= 2):
                    conflict_risk = "Medium"
                else:
                    conflict_risk = "Low"

                row["congestion_risk"] = conflict_risk
                reason = f"Berth {row_berth} is shared with vessel {svc} for {hrs} hrs — {conflict_risk} clash risk ({ctype})."

                # FIX: collect all contested blocks across all conflicts
                all_contested_blocks = set()
                for c in conflicts:
                    all_contested_blocks.update(c.get("shared_blocks", []))

                conflict_table.append({
                    "berth":         row["berth"],
                    "contested_blocks": sorted(list(all_contested_blocks)),
                    "conflict_risk": conflict_risk,
                    "conflict_with": conflicts[:4],
                    "impact_score":  row["impact_score"],
                    "reason":        reason,
                    "mitigation":    mitigation,
                })

        primary_berth = dict(berth_analysis[0])
        primary_berth["recommendation_reason"] = (
            f"{primary_berth['cargo_concentration_pct']}% of loading cargo located in blocks near {primary_berth['berth']}. "
            f"Lowest operational impact based on travel distance."
        )

    from services.heatmap_service import _deterministic_layout
    from services.xml_layout_service import xml_layout_service

    if full_layout:
        # For AECY, we only return the normalized block layout for backward compatibility
        layout = xml_layout_service.get_normalized_layout(unique_blocks, cached=full_layout)
    else:
        layout = _deterministic_layout(unique_blocks)

    terminal_layout = full_layout

    return {
        "vessel": vessel_id,
        "visit_id": visit_id,
        "yard_id": yard_id,
        "blocks": block_list,
        "summary": summary,
        "infrastructure": _get_infrastructure(block_list),
        "berth_analysis": berth_analysis,
        "conflict_table": conflict_table,
        "primary_berth": primary_berth,
        "layout": layout,
        "terminal_layout": terminal_layout,
        "timestamp": pd.Timestamp.now().isoformat(),
    }

def _get_infrastructure(block_list: list = None) -> dict:
    """Terminal infrastructure data dynamically constructed from block list."""
    if not block_list:
        return {"berths": [], "lanes": []}
    
    # Generate abstract berths based on the active blocks (e.g. A, B, C)
    berths = []
    lanes = []
    
    block_letters = list(dict.fromkeys(b["block_id"][0] if b["block_id"] else "Z" for b in block_list))
    for i, letter in enumerate(block_letters[:3]):  # Show up to 3 berths for visualization
        berths.append({
            "id": f"Berth-{letter}",
            "slots": [1, 2, 3],
            "status": "available" if i % 2 == 0 else "occupied"
        })
        
    for i, b in enumerate(block_list[:3]):
        lanes.append({
            "id": f"Lane-{b['block_id']}",
            "occupancy": round(b.get("density_pct", 0.0), 2)
        })
        
    return {
        "berths": berths,
        "lanes": lanes,
    }

# Main dashboard entry point
def analyze_vessel_dashboard(
    df: pd.DataFrame,
    vessel_service: str,
    loaded_override: int = None,
    discharged_override: int = None,
    history_df: pd.DataFrame = None,
    optional_unit_ids: list[str] = None,
) -> dict:
    """
    Analyzes vessel data to predict stay durations, identify bottlenecks, and synthesize operational dashboards.
    """
    if df is None or df.empty:
        return {
            "error": "No data available",
            "vessel": vessel_service,
            "vessel_service": vessel_service,
            "mode": "vessel",
            "actual": {"visits": {}, "avg_hours": 0.0, "max_hours": 0.0, "min_hours": 0.0, "avg_restows": 0.0},
            "predicted": None,
            "delay_analysis": [],
            "suggestions": []
        }

    search_key = str(vessel_service).strip().upper()

    # ── Unit ID filtering (What-If workloads) ────────────────────────────────
    if optional_unit_ids:
        vessel_df = df[df["unit_id"].isin(optional_unit_ids)].copy()
        if (
            "actual_outbound_carrier_visit_id" not in vessel_df.columns
            or vessel_df["actual_outbound_carrier_visit_id"].isna().all()
        ):
            vessel_df["actual_outbound_carrier_visit_id"] = vessel_service
    else:
        vessel_df = pd.DataFrame()
        if "outbound_service" in df.columns:
            vessel_df = df[
                df["outbound_service"].astype(str).str.strip().str.upper() == search_key
            ].copy()

        if vessel_df.empty and "actual_outbound_carrier_visit_id" in df.columns:
            vessel_df = df[
                df["actual_outbound_carrier_visit_id"]
                .astype(str).str.strip().str.upper() == search_key
            ].copy()

    if vessel_df.empty:
        suggestions: list[str] = []
        if "outbound_service" in df.columns:
            all_svcs = df["outbound_service"].dropna().unique().tolist()
            prefix = search_key[:2]
            prefix_matches = sorted(
                [s for s in all_svcs if str(s).upper().startswith(prefix)]
            )[:5]
            suggestions = prefix_matches or sorted([str(s) for s in all_svcs])[:5]
        hint = f" Available similar services: {', '.join(suggestions)}." if suggestions else ""
        return {
            "error": f"No data found for vessel '{vessel_service}'.{hint}",
            "vessel": vessel_service,
            "vessel_service": vessel_service,
            "mode": "vessel",
            "actual": {"visits": {}, "avg_hours": 0.0, "max_hours": 0.0, "min_hours": 0.0, "avg_restows": 0.0},
            "predicted": None,
            "delay_analysis": [],
            "suggestions": suggestions,
        }

    if "actual_outbound_carrier_visit_id" not in vessel_df.columns:
        vessel_df["actual_outbound_carrier_visit_id"] = vessel_service

    # ── Prepare visits ───────────────────────────────────────────────────────
    # visit_groups:    raw DataFrames — used for prediction (unwindowed, full span)
    # prepared_visits: windowed DataFrames — used only for actual stay computation
    visit_groups: dict = {}
    prepared_visits: dict = {}

    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        grp = group.copy()
        visit_groups[visit_id] = grp
        prepared_visits[visit_id] = prepare_visit_data(grp)

    # ── Compute actual stay ──────────────────────────────────────────────────
    actual_raw = compute_vessel_stay(prepared_visits)

    # A visit has history data when time-based stay can be computed directly.
    is_current_mode = not bool(actual_raw.get("visits"))

    # ── Fetch crane counts from DB for all visits (BATCHED) ──────────────────
    visit_ids = [str(vid) for vid in visit_groups.keys()]
    visit_crane_counts = _fetch_crane_counts_batch(visit_ids)

    # ── Historical baseline for feature template ─────────────────────────────
    feature_template: dict = {}
    historical_mph_avg = 0.0

    baseline_vessel = pd.DataFrame()
    if history_df is not None and not history_df.empty:
        baseline_vessel = history_df.copy()
    elif actual_raw.get("visits"):
        baseline_vessel = df.copy()

    if not baseline_vessel.empty and "outbound_service" in baseline_vessel.columns:
        baseline_vessel = baseline_vessel[
            baseline_vessel["outbound_service"].astype(str).str.strip().str.upper() == search_key
        ].copy()

    baseline_prepared: dict = {}
    if not baseline_vessel.empty:
        for vid, grp in baseline_vessel.groupby("actual_outbound_carrier_visit_id"):
            # Use raw (unwindowed) prep so move_span_hours is the full span
            baseline_prepared[vid] = _raw_prep(grp.copy())

    if baseline_prepared:
        historical_features_list = []
        for vid, vdf in baseline_prepared.items():
            f = create_features(vdf)
            if f:
                # Override move_span_hours with actual computed stay when available
                raw_stay = _raw_stay(vdf)
                if raw_stay and raw_stay > 0:
                    f["move_span_hours"] = raw_stay
                historical_features_list.append(f)

        if historical_features_list:
            for k in _settings.FEATURE_NAMES:
                vals = [f[k] for f in historical_features_list if k in f]
                if vals:
                    feature_template[k] = sum(vals) / len(vals)

            # historical_mph_avg: moves per hour across the full operational span
            # Use actual stay hours (not move_span_hours from features) as the denominator
            mph_rates = []
            avg_hist_cranes = max(
                sum(v for v in visit_crane_counts.values() if v > 0)
                    / max(sum(1 for v in visit_crane_counts.values() if v > 0), 1),
                    1.0,
                )
            for f in historical_features_list:
                span = f.get("move_span_hours", 0)
                moves = f.get("total_moves", 0)
                if span > 0 and moves > 0:
                    mph_rates.append(moves / span / avg_hist_cranes)  # ← per-crane rate
            if mph_rates:
                historical_mph_avg = sum(mph_rates) / len(mph_rates)

    # ── Synthesise stay for current mode when no actual stay is available ────
    if not actual_raw:
        if is_current_mode:
            try:
                predicted_init = predict_vessel_stay_duration(
                    visit_groups,  # raw, unwindowed
                    mph_override=historical_mph_avg or None,
                    feature_template=feature_template,
                    crane_counts=visit_crane_counts,
                )
                pred_avg = (
                    predicted_init.get("avg_hours")
                    if isinstance(predicted_init, dict) else None
                )
            except Exception:
                pred_avg = None

            synthetic_visits: dict = {}
            for vid, vdf in visit_groups.items():
                if vdf is None or vdf.empty:
                    continue
                n_units = len(vdf)
                synthetic_stay = pred_avg if pred_avg else max(8.0, n_units / 25.0)
                synthetic_visits[str(vid)] = synthetic_stay

            if not synthetic_visits:
                return {"error": "No valid visit data found", "vessel": vessel_service}

            vals = list(synthetic_visits.values())
            actual_raw = {
                "visits": synthetic_visits,
                "avg_hours": round(sum(vals) / len(vals), 2),
                "max_hours": round(max(vals), 2),
                "min_hours": round(min(vals), 2),
            }
        else:
            return {"error": "No valid visit data found", "vessel": vessel_service}

    # ── Predict stay duration ────────────────────────────────────────────────
    try:
        if loaded_override is not None or discharged_override is not None:
            total_loaded = loaded_override if loaded_override is not None else 0
            total_discharged = discharged_override if discharged_override is not None else 0

            # Use average crane count across visits for metric-override path
            avg_crane_count = (
                round(sum(visit_crane_counts.values()) / len(visit_crane_counts))
                if visit_crane_counts else 1
            )
            # ✅ FIX — use actual_raw instead
            p_res = predict_stay_duration_from_metrics(
                total_loaded,
                total_discharged,
                crane_count=max(avg_crane_count, 1),
                historical_mph_avg=historical_mph_avg,
                historical_avg_stay_hours=actual_raw.get("avg_hours"),  # ← was actual
            )
            p_stay = p_res.get("predicted", {}).get("avg_hours") if isinstance(p_res, dict) else p_res
            predicted = {"avg_hours": p_stay, "visits": 1, "source": "metric_override"}
        else:
            # Pass raw unwindowed visit_groups so move_span_hours is correct
            predicted = predict_vessel_stay_duration(
                visit_groups,
                mph_override=historical_mph_avg or None,
                feature_template=feature_template,
                crane_counts=visit_crane_counts,
            )
    except Exception:
        predicted = None

    # ── Build merged visit details ───────────────────────────────────────────
    visit_details = _visit_details(visit_groups)
    merged_visits: dict = {}

    for vid, stay in actual_raw.get("visits", {}).items():
        details = visit_details.get(str(vid), {})
        detail_stay = details.get("stay_hours", 0.0)
        final_stay = detail_stay if detail_stay > 0 else round(stay, 2)

        merged_visits[str(vid)] = {
            "stay_hours":             final_stay,
            "start_time":             details.get("start_time"),
            "end_time":               details.get("end_time"),
            "loaded_containers":      details.get("loaded_containers", 0),
            "discharged_containers":  details.get("discharged_containers", 0),
            "move_start":             details.get("move_start"),
            "move_end":               details.get("move_end"),
            "restow_count":           details.get("restow_count", 0),
            "avg_weight_kg":          details.get("avg_weight_kg", 0),
            "port_of_discharge_top5": details.get("port_of_discharge_top5", []),
            "assigned_cranes":        details.get("assigned_cranes", 0),
            "cranes_assigned":        details.get("cranes_assigned", []),
            "crane_mph":              details.get("crane_mph", 0.0),
            "crane_mpm":              round(60.0 / details.get("crane_mph"), 1) if details.get("crane_mph") > 0 else 0.0,
        }

    merged_stays = [v["stay_hours"] for v in merged_visits.values() if v.get("stay_hours", 0) > 0]
    merged_avg_hours = round(sum(merged_stays) / len(merged_stays), 2) if merged_stays else 0.0

    merged_restows = [v.get("restow_count", 0) for v in merged_visits.values()]
    merged_avg_restows = round(sum(merged_restows) / len(merged_restows), 1) if merged_restows else 0.0

    actual = {
        "visits":    merged_visits,
        "avg_hours": merged_avg_hours if merged_avg_hours > 0 else actual_raw.get("avg_hours"),
        "max_hours": max(merged_stays) if merged_stays else actual_raw.get("max_hours"),
        "min_hours": min(merged_stays) if merged_stays else actual_raw.get("min_hours"),
        "avg_restows": merged_avg_restows,
    }

    # ── Pick busiest visit ───────────────────────────────────────────────────
    visit_scores: list[tuple] = []
    for vid, vdf in visit_groups.items():
        if vdf is None or vdf.empty:
            continue
        visit_scores.append((vid, len(vdf)))

    if not visit_scores:
        return {"error": "No valid visit data found", "vessel": vessel_service}

    visit_scores.sort(key=lambda x: x[1], reverse=True)
    top_visit_id = visit_scores[0][0]
    visit_df = visit_groups[top_visit_id]

    if visit_df is None or visit_df.empty:
        return {"error": "Top visit has no usable rows", "vessel": vessel_service}

    # ── Count loads / discharges ─────────────────────────────────────────────
    f_str = visit_df.get("ctr_from_position", visit_df.get("from_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    t_str = visit_df.get("ctr_to_position", visit_df.get("to_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    
    f_is_v = f_str.str.startswith("V-")
    t_is_v = t_str.str.startswith("V-")
    f_is_y = (f_str != "") & (~f_is_v)
    t_is_y = (t_str != "") & (~t_is_v)
    
    total_loaded = int((f_is_y & t_is_v).sum())
    total_discharged = int((f_is_v & t_is_y).sum())
    
    move_kind = visit_df.get("crane_move_kind", visit_df.get("move_kind", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    unknowns = ~( (f_is_y & t_is_v) | (f_is_v & t_is_y) | ((f_is_y & t_is_y) | (f_is_v & t_is_v)) )
    
    if unknowns.any():
        total_loaded += int((unknowns & (move_kind == "LOAD")).sum())
        total_discharged += int((unknowns & (move_kind == "DISCHARGE")).sum())

    total_visit_units = int(visit_df["unit_id"].nunique()) if "unit_id" in visit_df.columns else len(visit_df)
    if total_loaded == 0 and total_discharged == 0 and total_visit_units > 0:
        total_loaded = total_visit_units

    # Removed unused local variables for hazardous, reefer, oog, total_units, avg_hours, and restow_count
    actual.get("visits", {}).get(str(top_visit_id), {})

    if loaded_override is not None:
        total_loaded = loaded_override
    if discharged_override is not None:
        total_discharged = discharged_override

    delay_analysis = _calculate_delay_analysis(visit_df) if actual else None

    # predicted is returned directly from the model — no post-hoc blending
    # with actual_avg here. The model already handles the actual/ML distinction
    # internally (returns actual stay for historical visits, ML pred for live).

    return {
        "mode":           "vessel",
        "delay_analysis": delay_analysis,
        "vessel":         vessel_service,
        "vessel_service": (
            str(vessel_df["outbound_service"].iloc[0]).strip()
            if "outbound_service" in vessel_df.columns and not vessel_df["outbound_service"].isna().all()
            else vessel_service
        ),
        "actual":    actual,
        "predicted": predicted,
    }