from __future__ import annotations
import logging
from collections import defaultdict
from typing import Optional, Tuple

import pandas as pd
from sqlalchemy import text

from db.connection import get_engine
from models.stay_model import predict_vessel_stay_duration
from utils.position_parser import (
    block_label,
    classify_move,
    is_vessel_pos,
    parse_position,
    safe_get_pos,
)
from utils.stay_utils import compute_vessel_stay, prepare_visit_data

logger = logging.getLogger("port_system")

# helper function to check if a value is yes
def _is_yes(val) -> bool:
    return str(val).strip().upper() in ("YES", "Y", "TRUE", "1")

# Move-side extraction  (NaN-safe)
def _extract_move_side(row) -> Tuple[str, Optional[dict]]:
    row = dict(row)
    from_pos = safe_get_pos(row, "crane_from", "ctr_from_position", "from_position")
    to_pos   = safe_get_pos(row, "crane_to",   "ctr_to_position",   "to_position")
    move_type = classify_move(from_pos, to_pos)
    # Honour explicit move_kind when position-based classification yields UNKNOWN
    if move_type == "UNKNOWN":
        mk = str(
            row.get("crane_move_kind") or row.get("move_kind") or ""
        ).strip().upper()
        if mk in ("LOAD", "DISCHARGE", "SHIFT", "RESTOW"):
            move_type = mk

    f_p = parse_position(from_pos)
    t_p = parse_position(to_pos)
    # based on move type determine the yard position
    if move_type == "LOAD":
        yard_pos = f_p if (f_p and f_p["is_yard"]) else None
    elif move_type == "DISCHARGE":
        yard_pos = t_p if (t_p and t_p["is_yard"]) else None
    elif f_p and f_p["is_yard"]:
        yard_pos = f_p
    elif t_p and t_p["is_yard"]:
        yard_pos = t_p
    else:
        yard_pos = None

    return move_type, yard_pos

# Crane data fetching
def _fetch_crane_for_visit(visit_id: str) -> pd.DataFrame:
    from db.queries import load_from_db
    try:
        df = load_from_db("crane", vessel_id=str(visit_id))
        if df.empty:
            return pd.DataFrame()
            
        df = df.rename(columns={
            "time_completed": "crane_time",
            "from_position": "crane_from",
            "to_position": "crane_to",
            "move_kind": "crane_move_kind"
        })
        df["crane_time"] = pd.to_datetime(df["crane_time"], errors="coerce")
        return df
    except Exception as exc:
        logger.warning("crane fetch failed for %s: %s", visit_id, exc)
        return pd.DataFrame()

# Crane enrichment
def _enrich_history_group(group: pd.DataFrame, visit_id: str) -> pd.DataFrame:
    # enrich history data with crane data
    crane_df = _fetch_crane_for_visit(visit_id)
    if crane_df.empty:
        return group
    # create a crane map to join with the group
    crane_map = (
        crane_df
        .sort_values("crane_time")
        .drop_duplicates(subset=["unit_id"], keep="first")
        [["unit_id", "crane_time", "crane_from", "crane_to", "crane_move_kind"]]
    )
    # merge the crane map with the group
    group = group.merge(crane_map, on="unit_id", how="left")
    # fill move_complete_time with crane_time if move_complete_time is NaN
    if "move_complete_time" in group.columns:
        group["move_complete_time"] = group["move_complete_time"].fillna(
            group.get("crane_time")
        )
        
    crane_moves = len(crane_df)
    valid_cranes = crane_df[crane_df["exclude"] != "Yes"] if "exclude" in crane_df.columns else crane_df
    crane_count = valid_cranes["crane_id"].nunique()
    
    if valid_cranes.empty:
        group["_crane_move_count"] = 0
        group["_crane_effective_moves"] = 0
        group["_crane_count"] = 0.0
        group["_crane_duration_hours"] = 0.1
        group["_crane_mphc"] = 0.0
        group["_crane_intensity"] = 0.0
        group["_crane_restow_ratio"] = 0.0
        group["_crane_exclude_ratio"] = 0.0
        return group

    min_time = valid_cranes["crane_time"].min()
    max_time = valid_cranes["crane_time"].max()
    duration_hours = max((max_time - min_time).total_seconds() / 3600, 0.1) if pd.notna(min_time) and pd.notna(max_time) else 0.1
    
    effective_moves = len(valid_cranes)
    restow_moves = len(valid_cranes[valid_cranes["crane_move_kind"].isin(["RESTOW", "SHIFT"])]) if "crane_move_kind" in valid_cranes.columns else 0
    
    mphc = (effective_moves / duration_hours) / crane_count if crane_count > 0 else 0
    mphc = min(float(mphc), 999.0) # cap at 999
    
    intensity = effective_moves / max(len(group), 1)
    crane_id_list = valid_cranes["crane_id"].dropna().unique().tolist()

    group["_crane_ids"] = str(crane_id_list[:8])
    group["_crane_move_count"] = crane_moves
    group["_crane_effective_moves"] = effective_moves
    group["_crane_count"] = float(crane_count)
    group["_crane_intensity"] = float(intensity)
    group["_crane_mphc"] = float(mphc)
    group["_crane_duration_hours"] = float(duration_hours)
    group["_crane_restow_ratio"] = float(restow_moves / effective_moves)
    group["_crane_exclude_ratio"] = float((crane_moves - effective_moves) / crane_moves) if crane_moves > 0 else 0.0
    return group

# enrich current data
def _enrich_current_group(group: pd.DataFrame, visit_id: str) -> pd.DataFrame:
    # enrich current data with crane data
    crane_df = _fetch_crane_for_visit(visit_id)
    if crane_df.empty:
        return group

    # fill move_complete_time with crane_time if move_complete_time is NaN
    earliest = crane_df["crane_time"].dropna().min()
    if pd.notna(earliest) and "move_complete_time" in group.columns:
        group["move_complete_time"] = group["move_complete_time"].fillna(earliest)
    # add crane ids to the group
    crane_ids = crane_df["crane_id"].dropna().unique().tolist()
    group["_crane_ids"] = str(crane_ids[:6])

    crane_moves = len(crane_df)
    valid_cranes = crane_df[crane_df["exclude"] != "Yes"] if "exclude" in crane_df.columns else crane_df
    crane_count = valid_cranes["crane_id"].nunique()
    
    if valid_cranes.empty:
        group["_crane_move_count"] = 0
        group["_crane_effective_moves"] = 0
        group["_crane_count"] = 0.0
        group["_crane_duration_hours"] = 0.1
        group["_crane_mphc"] = 0.0
        group["_crane_intensity"] = 0.0
        group["_crane_restow_ratio"] = 0.0
        group["_crane_exclude_ratio"] = 0.0
        return group

    min_time = valid_cranes["crane_time"].min()
    max_time = valid_cranes["crane_time"].max()
    duration_hours = max((max_time - min_time).total_seconds() / 3600, 0.1) if pd.notna(min_time) and pd.notna(max_time) else 0.1
    
    effective_moves = len(valid_cranes)
    restow_moves = len(valid_cranes[valid_cranes["crane_move_kind"].isin(["RESTOW", "SHIFT"])]) if "crane_move_kind" in valid_cranes.columns else 0
    
    mphc = (effective_moves / duration_hours) / crane_count if crane_count > 0 else 0
    mphc = min(float(mphc), 999.0) # cap at 999
    
    intensity = effective_moves / max(len(group), 1)
    
    group["_crane_move_count"] = crane_moves
    group["_crane_effective_moves"] = effective_moves
    group["_crane_count"] = float(crane_count)
    group["_crane_intensity"] = float(intensity)
    group["_crane_mphc"] = float(mphc)
    group["_crane_duration_hours"] = float(duration_hours)
    group["_crane_restow_ratio"] = float(restow_moves / effective_moves)
    group["_crane_exclude_ratio"] = float((crane_moves - effective_moves) / crane_moves) if crane_moves > 0 else 0.0
    return group

# Visit detail helpers
def _visit_details(enriched_visits: dict) -> dict:
    # compute per-visit detail stats from the enriched groups
    out: dict = {}
    for visit_id, vdf in enriched_visits.items():
        if vdf is None or vdf.empty:
            continue
            
        time_col = None
        # find the time column
        for tc in ("move_complete_time", "time_in", "crane_time"):
            if tc in vdf.columns and vdf[tc].notna().any():
                time_col = tc
                break
        if time_col is None:
            continue
        # convert time column to datetime
        times = pd.to_datetime(vdf[time_col], errors="coerce").dropna()
        if times.empty:
            continue
        # compute start and end times
        start = times.min()
        end   = times.max()
        # count loads and discharges
        loads = discharges = 0
        for _, row in vdf.iterrows():
            mt, _ = _extract_move_side(row)
            if mt == "LOAD":
                loads += 1
            elif mt == "DISCHARGE":
                discharges += 1
        # compute stay hours
        total_units = int(vdf["unit_id"].nunique()) if "unit_id" in vdf.columns else len(vdf)
        crane_mphc = float(vdf["_crane_mphc"].iloc[0]) if "_crane_mphc" in vdf.columns and not vdf["_crane_mphc"].isna().all() else 0.0
        w_col = "unit_weight_in_kg" if "unit_weight_in_kg" in vdf.columns else "verified_gross_mass_kg" if "verified_gross_mass_kg" in vdf.columns else None
        avg_weight_kg = float(pd.to_numeric(vdf[w_col], errors="coerce").mean()) if w_col and not vdf[w_col].isna().all() else 0.0
        freight_kind_breakdown = vdf["freight_kind"].value_counts().to_dict() if "freight_kind" in vdf.columns else {}
        pod_top5 = vdf["port_of_discharge"].value_counts().head(5).to_dict() if "port_of_discharge" in vdf.columns else {}
        restow_count = 0
        for _, r in vdf.iterrows():
            mt, _ = _extract_move_side(r)
            if mt in ("SHIFT", "RESTOW"):
                restow_count += 1
                
        crane_count_val = float(vdf["_crane_count"].iloc[0]) if "_crane_count" in vdf.columns and not vdf["_crane_count"].isna().all() else 0.0
        crane_ids_raw = vdf["_crane_ids"].iloc[0] if "_crane_ids" in vdf.columns and not vdf["_crane_ids"].isna().all() else "[]"
        crane_duration_h = float(vdf["_crane_duration_hours"].iloc[0]) if "_crane_duration_hours" in vdf.columns and not vdf["_crane_duration_hours"].isna().all() else 0.0
        crane_exclude_ratio = float(vdf["_crane_exclude_ratio"].iloc[0]) if "_crane_exclude_ratio" in vdf.columns and not vdf["_crane_exclude_ratio"].isna().all() else 0.0
        out[str(visit_id)] = {
            "start_time":            str(start),
            "end_time":              str(end),
            "stay_hours":            round((end - start).total_seconds() / 3600, 2),
            "loaded_containers":     loads,
            "discharged_containers": discharges,
            "move_start": (
                str(vdf["move_complete_time"].dropna().min())
                if "move_complete_time" in vdf.columns else None
            ),
            "move_end": (
                str(vdf["move_complete_time"].dropna().max())
                if "move_complete_time" in vdf.columns else None
            ),
            "total_units": total_units,
            "restow_count": restow_count,
            "crane_mphc": crane_mphc,
            "crane_count": int(crane_count_val),
            "crane_ids": crane_ids_raw,
            "crane_duration_hours": round(crane_duration_h, 2),
            "crane_exclude_ratio": crane_exclude_ratio,
            "avg_weight_kg": avg_weight_kg,
            "freight_kind_breakdown": freight_kind_breakdown,
            "port_of_discharge_top5": pod_top5,
        }
    return out

# Berth analysis

def _predict_operational_metrics(visit_df, crane_df, ml_stay_hours, loaded=0, discharged=0, target_mph_override=None, historical_crane_avg=None):
    import math
    if visit_df.empty:
        return None

    # Use actual loaded+discharged counts if provided; else fall back to row count
    total_ops = (loaded or 0) + (discharged or 0)
    if total_ops == 0:
        total_ops = len(visit_df)
    
    # Handle ml_stay_hours if it's a dict or float
    if isinstance(ml_stay_hours, dict):
        effective_stay_hours = ml_stay_hours.get("avg_hours", 24.0)
    else:
        effective_stay_hours = ml_stay_hours if (isinstance(ml_stay_hours, (int, float)) and ml_stay_hours > 0) else 24.0

    # Target moves per hour per crane (use override if provided, else default 25.0)
    target_mph = float(target_mph_override) if target_mph_override and float(target_mph_override) > 0 else 25.0
    
    required_mph = total_ops / max(effective_stay_hours, 1.0)
    recommended_crane_count = max(math.ceil(required_mph / target_mph), 1)
    
    # Use historical average as a dynamic baseline if available
    if historical_crane_avg and float(historical_crane_avg) > 0:
        # If the volume is significant (> 100), respect the historical floor.
        # For small volume 'what-if' scenarios, allow the math to recommend fewer cranes.
        if total_ops > 100:
            recommended_crane_count = max(recommended_crane_count, round(float(historical_crane_avg)))
    else:
        # Static proactive floor for larger vessels if no history
        if total_ops > 300:
            recommended_crane_count = max(recommended_crane_count, 3)
        elif total_ops > 100:
            recommended_crane_count = max(recommended_crane_count, 2)
    
    recommended_crane_count = min(recommended_crane_count, 6)

    intensity = total_ops / max(effective_stay_hours, 1)
    load_ratio = (loaded or 0) / max(total_ops, 1)

    # Strategy selection based on intensity and cargo imbalance
    if intensity > 80:
        strategy_label = 'HIGH_DENSITY_FIRST'
        strategy_desc = 'Prioritize dense blocks with dual cycling to meet aggressive schedule.'
    elif load_ratio > 0.7:
        strategy_label = 'LOAD_DOMINANT'
        strategy_desc = 'Heavy load operation — prioritize yard pre-staging and crane allocation.'
    elif load_ratio < 0.3 and (discharged or 0) > 100:
        strategy_label = 'DISCHARGE_DOMINANT'
        strategy_desc = 'Heavy discharge — clear berth blocks sequentially, ITV on high alert.'
    elif recommended_crane_count >= 3:
        strategy_label = 'BLOCK_SEQUENTIAL'
        strategy_desc = 'Assign cranes sequentially along the berth to avoid overlap.'
    else:
        strategy_label = 'BALANCED_DUAL_CRANE'
        strategy_desc = 'Balanced load/discharge spread to minimize ITV waiting.'

    crane_overlap_risk = 'High' if recommended_crane_count > 4 and intensity > 60 else 'Medium' if recommended_crane_count > 2 else 'Low'
    avg_travel_score = 35 + (intensity * 0.2)
    itv_needs = math.ceil(recommended_crane_count * 4.5)
    op_impact = min(100, int((intensity * 0.4) + (recommended_crane_count * 5) + (avg_travel_score * 0.3)))

    return {
        'recommended_crane_count': recommended_crane_count,
        'strategy_label': strategy_label,
        'strategy_description': strategy_desc,
        'conflict_risk': crane_overlap_risk,
        'load_discharge_ratio': round(load_ratio, 3),
        'total_operations': total_ops,
        'itv_impact': {
            'avg_travel_score': round(avg_travel_score, 1),
            'itv_cycle_impact': 'High traffic on main corridors' if avg_travel_score > 50 else 'Normal flow',
            'estimated_itv_needs': itv_needs,
        },
        'operational_impact_score': op_impact,
        'operational_rules_applied': [
            f'Target {target_mph:.0f} MPH per crane',
            f'Required MPH: {required_mph:.1f} → {recommended_crane_count} crane(s)',
            f'ITV ratio ~4.5:1 for {strategy_label}',
            'Conflict mitigation spacing',
        ]
    }

def _calculate_delay_analysis(visit_df, crane_df):
    import pandas as pd
    causes = []
    if visit_df.empty: return causes
    
    if not crane_df.empty and 'time_completed' in crane_df.columns:
        crane_df = crane_df.sort_values('time_completed')
        crane_df['gap'] = crane_df['time_completed'].diff().dt.total_seconds() / 60
        long_gaps = crane_df[crane_df['gap'] > 30]
        if not long_gaps.empty:
            causes.append({
                'factor': 'Crane Idle Time',
                'impact': 'High',
                'reason': f'Detected {len(long_gaps)} idle periods exceeding 30 mins.'
            })
            
    restow = len(crane_df[crane_df.get('move_kind', '').isin(['RESTOW', 'SHIFT'])]) if 'move_kind' in crane_df.columns else 0
    if restow > 20:
        causes.append({
            'factor': 'High Restow Rate',
            'impact': 'Medium',
            'reason': f'{restow} restows detected, delaying primary load/discharge.'
        })
        
    return causes

def _build_berth_tables(
    visit_df: pd.DataFrame,
    total_loaded: int,
    total_discharged: int,
    avg_hours: float,
) -> tuple[list, dict, list]:
    # Pre-compute effective operation hours for crane recommendation
    eff_hours = max(avg_hours, 1.0) if avg_hours and avg_hours > 0 else max(
        (total_loaded + total_discharged) / 25.0, 1.0
    )
    # build berth analysis and conflict tables

    berth_counts: dict = defaultdict(lambda: {
        "total_moves": 0, "load_moves": 0, "discharge_moves": 0,
        "units": set(), "hazardous": 0, "reefer": 0, "oog": 0,
    })
    # iterate over the visit_df
    for _, row in visit_df.iterrows():
        move_type, yard_pos = _extract_move_side(row)
        if move_type not in ("LOAD", "DISCHARGE") or yard_pos is None:
            continue
        # get the block label
        bk = block_label(yard_pos) or "UNKNOWN"
        bucket = berth_counts[bk]
        bucket["total_moves"] += 1
        bucket["units"].add(str(row.get("unit_id", "")).strip())
        # update move counts
        if move_type == "LOAD":
            bucket["load_moves"] += 1
        else:
            bucket["discharge_moves"] += 1
        # update special container counts
        if _is_yes(row.get("hazardous_flag")):  bucket["hazardous"] += 1
        if _is_yes(row.get("reefer")):           bucket["reefer"]    += 1
        if _is_yes(row.get("oog_unit")):         bucket["oog"]       += 1
    # if no berth counts, return empty
    if not berth_counts:
        return [], {}, []
    
    total_all = sum(v["total_moves"] for v in berth_counts.values()) or 1
    # sort berths by total moves
    sorted_berths = sorted(
        berth_counts.items(), key=lambda x: x[1]["total_moves"], reverse=True
    )
    max_count = sorted_berths[0][1]["total_moves"]

    # build berth_analysis list
    berth_analysis: list[dict] = []
    for idx, (bk, data) in enumerate(sorted_berths[:5], start=1):
        total  = data["total_moves"]
        share  = round((total / total_all) * 100, 2)
        intensity = round(total / max(max_count, 1), 4)

        # Risk thresholds
        if share >= 40 or total >= 60:
            risk = "High"
        elif share >= 20 or total >= 30:
            risk = "Medium"
        else:
            risk = "Low"

        # Recommended cranes: scale by block's share of total vessel operations
        # total_ops = all load+discharge across the vessel visit
        total_ops_all = max(total_loaded + total_discharged, total_all, 1)
        block_share = total / max(total_all, 1)

        # Proactive crane recommendation: 
        # 1. Based on volume (enforce parallelism for larger vessels)
        # 2. Based on target stay (at least 20-25 moves/hour total)
        if total_ops_all > 300:
            vol_min_cranes = 3
        elif total_ops_all > 100:
            vol_min_cranes = 2
        else:
            vol_min_cranes = 1
            
        target_vessel_cranes = max(vol_min_cranes, round(total_ops_all / 120))
        stay_based_cranes = max(1, round(total_ops_all / (max(eff_hours, 1.0) * 20))) 
        vessel_total_cranes = max(target_vessel_cranes, stay_based_cranes)
        
        # This block gets cranes proportional to its share (min 1)
        rec_cranes = max(1, round(vessel_total_cranes * block_share * 1.5))
        rec_cranes = min(rec_cranes, vessel_total_cranes)

        # Derive terminal / block from berth key  (e.g. "PEB-2B" → terminal=PEB, block=2B)
        parts = bk.split("-", 1)
        terminal = parts[0] if len(parts) == 2 else "YARD"
        block    = parts[1] if len(parts) == 2 else bk

        impact_score = round(share + data["hazardous"] * 2 + data["reefer"] + data["oog"], 2)

        berth_analysis.append({
            "rank":                    idx,
            "berth":                   bk,
            "terminal":                terminal,
            "block":                   block,
            "total_moves":             total,
            "load_moves":              data["load_moves"],
            "discharge_moves":         data["discharge_moves"],
            "cargo_concentration_pct": share,
            "intensity":               intensity,
            "recommended_cranes":      rec_cranes,
            "congestion_risk":         risk,
            "hazardous":               data["hazardous"],
            "reefer":                  data["reefer"],
            "oog":                     data["oog"],
            "unique_containers":       len(data["units"]),
            "impact_score":            impact_score,
            "travel_distance_score":   int((hash(bk) % 90) + 10),
            "travel_distance_label":   "Short" if int((hash(bk) % 90) + 10) < 30 else "Moderate" if int((hash(bk) % 90) + 10) < 70 else "Long",
            "corridor_congestion":     "High" if intensity > 0.8 else "Moderate" if intensity > 0.4 else "Low",
            "mitigation":              "Deploy additional transport units" if int((hash(bk) % 90) + 10) >= 70 else "Standard operations",
        })

    # build conflict table
    top_impact = berth_analysis[0]["impact_score"] if berth_analysis else 1

    conflict_table: list[dict] = []
    for row in berth_analysis:
        conflicts: list[str] = []
        for other in berth_analysis:
            if other["berth"] == row["berth"]:
                continue
            same_terminal = (row["terminal"] == other["terminal"])
            high_combined = (row["impact_score"] + other["impact_score"]) > top_impact * 1.2
            haz_adjacent  = (row["hazardous"] > 0 or other["hazardous"] > 0) and same_terminal
            reef_adjacent = (row["reefer"] > 0 or other["reefer"] > 0) and same_terminal
            if same_terminal or high_combined or haz_adjacent or reef_adjacent:
                conflicts.append(other["berth"])

        # Build a human-readable reason
        if row["congestion_risk"] == "High":
            reason = f"High congestion — {row['cargo_concentration_pct']}% of moves here."
        elif row["congestion_risk"] == "Medium":
            reason = f"Moderate load — {row['cargo_concentration_pct']}% of moves here."
        else:
            reason = f"{row['cargo_concentration_pct']}% of moves concentrated here."

        if row["hazardous"] > 0:
            reason += f" {row['hazardous']} hazmat units require buffer zones."
        if row["reefer"] > 0:
            reason += f" {row['reefer']} reefer units need power allocation."
        # append conflict table
        conflict_table.append({
            "berth":         row["berth"],
            "block":         row["block"],
            "conflict_risk": row["congestion_risk"],
            "conflict_with": conflicts[:4],
            "impact_score":  row["impact_score"],
            "reason":        reason,
        })

    primary = berth_analysis[0] if berth_analysis else {}
    if primary:
        primary["recommendation_reason"] = f"{primary['cargo_concentration_pct']}% of cargo concentrated in this berth. {primary['congestion_risk']} congestion expected."
    return berth_analysis, primary, conflict_table

# Main dashboard entry point
def analyze_vessel_dashboard(
    df: pd.DataFrame,
    vessel_service: str,
    loaded_override: int = None,
    discharged_override: int = None,
    target_mph_override: float = None,
    history_df: pd.DataFrame = None,
) -> dict:
    """Analyze a vessel from either outbound_service OR actual_outbound_carrier_visit_id."""
    if df is None or df.empty:
        return {"error": "No data available", "vessel": vessel_service}

    # Require at least one searchable column
    if "outbound_service" not in df.columns and "actual_outbound_carrier_visit_id" not in df.columns:
        return {"error": "Missing required columns", "vessel": vessel_service}

    search_key = str(vessel_service).strip().upper()

    # Try outbound_service first (service code like FF116)
    vessel_df = pd.DataFrame()
    if "outbound_service" in df.columns:
        vessel_df = df[
            df["outbound_service"].astype(str).str.strip().str.upper() == search_key
        ].copy()

    # Fallback: search by actual_outbound_carrier_visit_id (visit ID like CQN180001)
    if vessel_df.empty and "actual_outbound_carrier_visit_id" in df.columns:
        vessel_df = df[
            df["actual_outbound_carrier_visit_id"].astype(str).str.strip().str.upper() == search_key
        ].copy()

    if vessel_df.empty:
        # Build a helpful suggestion list from available services
        suggestions: list[str] = []
        if "outbound_service" in df.columns:
            all_svcs = df["outbound_service"].dropna().unique().tolist()
            # Prefix match first (e.g. user typed "FF161" → suggest "FF116", "FF119")
            prefix = search_key[:2]
            prefix_matches = sorted([s for s in all_svcs if str(s).upper().startswith(prefix)])[:5]
            suggestions = prefix_matches or sorted([str(s) for s in all_svcs])[:5]
        hint = f" Available similar services: {', '.join(suggestions)}." if suggestions else ""
        return {
            "error": f"No data found for vessel '{vessel_service}'.{hint} Make sure the vessel has been ingested.",
            "vessel": vessel_service,
            "suggestions": suggestions,
        }


    # Ensure actual_outbound_carrier_visit_id column exists for grouping
    if "actual_outbound_carrier_visit_id" not in vessel_df.columns:
        vessel_df["actual_outbound_carrier_visit_id"] = vessel_service

    # check if there is time out data
    has_time_out = (
        "time_out" in vessel_df.columns
        and vessel_df["time_out"].notna().sum() > len(vessel_df) * 0.3
        and "visit_state" not in vessel_df.columns
    )

    # enrich visits with crane data
    enriched_visits: dict = {}
    prepared_visits: dict = {}
    # group by visit id
    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        group = group.copy()
        if has_time_out:
            group = _enrich_history_group(group, str(visit_id))
        else:
            # enrich current data
            group = _enrich_current_group(group, str(visit_id))

        enriched_visits[visit_id] = group
        prepared_visits[visit_id] = prepare_visit_data(group)
    # compute actual stay
    actual_raw = compute_vessel_stay(prepared_visits)
    
    # Calculate historical averages for dynamic recommendations
    # If in Current mode, we should use history_df for baseline stats
    baseline_df = history_df if (history_df is not None and not history_df.empty) else vessel_df
    
    # Isolate the specific vessel/service in baseline
    search_key = str(vessel_service).strip().upper()
    if "outbound_service" in baseline_df.columns:
        baseline_vessel = baseline_df[baseline_df["outbound_service"].astype(str).str.strip().str.upper() == search_key].copy()
    else:
        baseline_vessel = baseline_df[baseline_df["actual_outbound_carrier_visit_id"].astype(str).str.strip().str.upper() == search_key].copy()
    
    # If baseline is still empty (e.g. current visit but no history), fallback to vessel_df
    if baseline_vessel.empty:
        baseline_vessel = vessel_df
        
    baseline_prepared = {}
    baseline_enriched = {}
    for vid, group in baseline_vessel.groupby("actual_outbound_carrier_visit_id"):
        # We don't need full enrichment for baseline, just counts
        baseline_prepared[vid] = prepare_visit_data(group)
        baseline_enriched[vid] = group

    visit_counts = len(baseline_prepared)
    historical_crane_avg = 0.0
    avg_loaded_per_visit = 0.0
    avg_discharged_per_visit = 0.0
    
    if visit_counts > 0:
        total_cranes = 0
        total_mph = 0.0
        total_load = 0
        total_disc = 0
        for vid, vdf in baseline_enriched.items():
            total_cranes += int(float(vdf["_crane_count"].iloc[0])) if "_crane_count" in vdf.columns and not vdf["_crane_count"].isna().all() else 0
            total_mph += float(vdf["_crane_mphc"].iloc[0]) if "_crane_mphc" in vdf.columns and not vdf["_crane_mphc"].isna().all() else 0.0
            for _, row in vdf.iterrows():
                mt, _ = _extract_move_side(row)
                if mt == "LOAD": total_load += 1
                elif mt == "DISCHARGE": total_disc += 1
        historical_crane_avg = total_cranes / visit_counts
        historical_mph_avg = total_mph / visit_counts
        avg_loaded_per_visit = total_load / visit_counts
        avg_discharged_per_visit = total_disc / visit_counts
        
        # Also update actual_raw in Current Mode to use historical average as baseline
        if history_df is not None and not history_df.empty:
            baseline_raw = compute_vessel_stay(baseline_prepared)
            if baseline_raw and baseline_raw.get("avg_hours"):
                actual_raw["avg_hours"] = baseline_raw["avg_hours"]

    # For current vessels (no time_out), compute_vessel_stay may return empty.
    # Build synthetic stay from ML predictions or unit count heuristic.
    is_current_mode = not has_time_out

    # Always build synthetic_visits so the override block below can use it
    synthetic_visits: dict = {}
    for vid, vdf in enriched_visits.items():
        if vdf is not None and not vdf.empty:
            synthetic_visits[str(vid)] = float(len(vdf))

    if not actual_raw:
        if is_current_mode:
            # Build synthetic stays for current vessels using ML model
            try:
                predicted_init = predict_vessel_stay_duration(prepared_visits)
                pred_avg = predicted_init.get("avg_hours") if isinstance(predicted_init, dict) else None
            except Exception:
                pred_avg = None

            # Synthesize stay from ML or total container count heuristic
            synthetic_visits = {}
            for vid, vdf in enriched_visits.items():
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

    # For current mode: if user provided overrides, re-derive the synthetic stay
    # from those counts so actual_raw AND predicted both reflect the user's input.
    if is_current_mode and (loaded_override is not None or discharged_override is not None):
        _ld = loaded_override or 0
        _dc = discharged_override or 0
        if _ld + _dc > 0:
            try:
                from models.stay_model import predict_stay_duration_from_metrics
                _mp = predict_stay_duration_from_metrics(_ld, _dc)
                _override_stay = (
                    _mp.get("predicted", {}).get("avg_hours")
                    if isinstance(_mp, dict) else None
                )
                if _override_stay and _override_stay > 0:
                    # In current mode, we do NOT overwrite actual_raw with the override.
                    # actual_raw should represent the 'Historical Baseline' (avg_hours) 
                    # while 'predicted' will reflect the override scenario.
                    pass
            except Exception:
                pass
    
    # predict stay duration
    try:
        if loaded_override is not None or discharged_override is not None or target_mph_override is not None:
            # If at berth, use live inventory counts as defaults. If upcoming, default to 0 as requested.
            live_load = int(vessel_df["is_load"].sum()) if not vessel_df.empty and "is_load" in vessel_df.columns else 0
            live_disc = int(vessel_df["is_discharge"].sum()) if not vessel_df.empty and "is_discharge" in vessel_df.columns else 0
            
            total_loaded = loaded_override if loaded_override is not None else live_load
            total_discharged = discharged_override if discharged_override is not None else live_disc
            
            # Use metric-based prediction for overrides
            p_res = predict_stay_duration_from_metrics(
                total_loaded, total_discharged, 
                target_mph=target_mph_override, 
                historical_crane_avg=historical_crane_avg,
                historical_mph_avg=historical_mph_avg
            )
            p_stay = p_res.get("predicted", {}).get("avg_hours") if isinstance(p_res, dict) else p_res
            predicted = {
                "avg_hours": p_stay,
                "visits": 1,
                "source": "metric_override",
            }
        else:
            from models.stay_model import predict_vessel_stay_duration
            predicted = predict_vessel_stay_duration(
                prepared_visits, 
                target_mph=target_mph_override, 
                crane_count_override=historical_crane_avg,
                mph_override=historical_mph_avg
            )
    except Exception:
        predicted = None

    
    visit_details = _visit_details(enriched_visits)
    
    # Merge stay hours into visit details
    merged_visits: dict = {}
    for vid, stay in actual_raw.get("visits", {}).items():
        details = visit_details.get(str(vid), {})
        merged_visits[str(vid)] = {
            "stay_hours":            round(stay, 2),
            "start_time":            details.get("start_time"),
            "end_time":              details.get("end_time"),
            "loaded_containers":     details.get("loaded_containers", 0),
            "discharged_containers": details.get("discharged_containers", 0),
            "move_start":            details.get("move_start"),
            "move_end":              details.get("move_end"),
            "total_units":           details.get("total_units", 0),
            "restow_count":          details.get("restow_count", 0),
            "crane_mphc":            details.get("crane_mphc", 0.0),
            "avg_weight_kg":         details.get("avg_weight_kg", 0.0),
            "freight_kind_breakdown": details.get("freight_kind_breakdown", {}),
            "port_of_discharge_top5": details.get("port_of_discharge_top5", {}),
            "crane_exclude_ratio":   details.get("crane_exclude_ratio", 0.0),
        }

    actual = {
        "visits":    merged_visits,
        "avg_hours": actual_raw.get("avg_hours"),
        "max_hours": actual_raw.get("max_hours"),
        "min_hours": actual_raw.get("min_hours"),
    }

    # pick busiest visit (by raw unit count for current, by load/discharge for history)
    visit_scores: list[tuple] = []
    for vid, vdf in enriched_visits.items():
        if vdf is None or vdf.empty:
            continue
        if is_current_mode:
            score = len(vdf)  # current: score by container count
        else:
            score = sum(
                1 for _, row in vdf.iterrows()
                if _extract_move_side(row)[0] in ("LOAD", "DISCHARGE")
            )
        visit_scores.append((vid, score))

    # check if visit scores are empty
    if not visit_scores:
        return {"error": "No valid visit data found", "vessel": vessel_service}
    # sort by score
    visit_scores.sort(key=lambda x: x[1], reverse=True)
    # get top visit
    top_visit_id = visit_scores[0][0]
    visit_df     = enriched_visits[top_visit_id]

    if visit_df is None or visit_df.empty:
        return {"error": "Top visit has no usable rows", "vessel": vessel_service}
    
    # get counts for the top visit
    total_loaded = total_discharged = 0
    for _, row in visit_df.iterrows():
        mt, _ = _extract_move_side(row)
        if mt == "LOAD":
            total_loaded += 1
        elif mt == "DISCHARGE":
            total_discharged += 1

    # fallback: raw crane counts when container rows give 0
    crane_df_top = _fetch_crane_for_visit(str(top_visit_id))
    crane_ids: list[str] = []
    # check if crane_df_top is not empty
    if not crane_df_top.empty:
        crane_ids = crane_df_top["crane_id"].dropna().unique().tolist()
        # get loaded counts
        if total_loaded == 0:
            total_loaded = int(crane_df_top[
                crane_df_top.apply(
                    lambda r: (not is_vessel_pos(str(r.get("crane_from", ""))))
                              and is_vessel_pos(str(r.get("crane_to", ""))),
                    axis=1,
                )
            ]["unit_id"].nunique())
        # get discharged counts
        if total_discharged == 0:
            total_discharged = int(crane_df_top[
                crane_df_top.apply(
                    lambda r: is_vessel_pos(str(r.get("crane_from", "")))
                              and not is_vessel_pos(str(r.get("crane_to", ""))),
                    axis=1,
                )
            ]["unit_id"].nunique())

    # get special cargo counts
    hazardous   = int(visit_df["hazardous_flag"].apply(_is_yes).sum()) if "hazardous_flag" in visit_df.columns else 0
    reefer      = int(visit_df["reefer"].apply(_is_yes).sum())          if "reefer"         in visit_df.columns else 0
    oog         = int(visit_df["oog_unit"].apply(_is_yes).sum())        if "oog_unit"       in visit_df.columns else 0
    total_units = int(visit_df["unit_id"].nunique())                    if "unit_id"        in visit_df.columns else 0

    avg_hours = actual.get("avg_hours") or 0

    # get berth analysis
    berth_analysis, berth_rec, berth_conflicts = _build_berth_tables(
        visit_df=visit_df,
        total_loaded=total_loaded,
        total_discharged=total_discharged,
        avg_hours=avg_hours,
    )

    from config import settings
    # get risks
    risks: list[str] = []
    
    top_visit_stats_merged = actual.get("visits", {}).get(str(top_visit_id), {})
    exclude_ratio = top_visit_stats_merged.get("crane_exclude_ratio", 0.0)
    restow_count = top_visit_stats_merged.get("restow_count", 0)
    
    if total_loaded > settings.RISK_HIGH_LOAD_THRESHOLD:
        risks.append("High loading volume — potential crane congestion.")
    if hazardous > settings.RISK_HAZARDOUS_THRESHOLD:
        risks.append("Hazardous cargo present — requires safety buffer.")
    if reefer > settings.RISK_REEFER_THRESHOLD:
        risks.append("High reefer concentration — ensure power point allocation.")
    if avg_hours > settings.RISK_EXTENDED_STAY_HOURS:
        risks.append("Extended vessel stay — possible inefficiency.")
    if exclude_ratio > 0.05:
        risks.append(f"High anomaly rate detected in crane movements ({exclude_ratio*100:.1f}% excluded).")
    if restow_count > 20:
        risks.append(f"High restow count ({restow_count}) indicates suboptimal stowage planning.")
    if not risks:
        risks.append("Operations appear stable.")

    # get execution plan
    steps: list[str] = []
    if berth_rec:
        steps.append(f"Prioritise berth {berth_rec['berth']} — {berth_rec.get('recommendation_reason', '')}")
    else:
        steps.append("Allocate cranes based on cargo concentration.")
    if crane_ids:
        steps.append(f"Assign {len(crane_ids)} cranes: {', '.join(crane_ids[:4])} confirmed operational.")
    steps.append("Separate hazardous and reefer flows.")

    
    predicted_avg_hours = (
        predicted.get("avg_hours")
        if isinstance(predicted, dict)
        else actual.get("avg_hours", 0)
    )

    # Apply user-supplied load/discharge overrides for current-mode analysis
    if loaded_override is not None:
        total_loaded = loaded_override
    if discharged_override is not None:
        total_discharged = discharged_override

    op_preds = _predict_operational_metrics(
        visit_df, crane_df_top, predicted_avg_hours,
        loaded=total_loaded, discharged=total_discharged,
        target_mph_override=target_mph_override,
        historical_crane_avg=historical_crane_avg,
    )
    delay_analysis = _calculate_delay_analysis(visit_df, crane_df_top) if actual else None
    
    # Build per-visit crane assignment summary
    crane_assignment: list[dict] = []
    for vid, vdf in enriched_visits.items():
        if vdf is None or vdf.empty:
            continue
        visit_crane_count = int(float(vdf["_crane_count"].iloc[0])) if "_crane_count" in vdf.columns and not vdf["_crane_count"].isna().all() else 0
        visit_crane_ids_raw = vdf["_crane_ids"].iloc[0] if "_crane_ids" in vdf.columns and not vdf["_crane_ids"].isna().all() else "[]"
        visit_crane_mphc = float(vdf["_crane_mphc"].iloc[0]) if "_crane_mphc" in vdf.columns and not vdf["_crane_mphc"].isna().all() else 0.0
        visit_crane_dur = float(vdf["_crane_duration_hours"].iloc[0]) if "_crane_duration_hours" in vdf.columns and not vdf["_crane_duration_hours"].isna().all() else 0.0
        v_details = visit_details.get(str(vid), {})

        # For current mode with user overrides, show the user's scenario counts
        entry_loaded = v_details.get("loaded_containers", 0)
        entry_discharged = v_details.get("discharged_containers", 0)
        if is_current_mode:
            if loaded_override is not None:
                entry_loaded = loaded_override
            if discharged_override is not None:
                entry_discharged = discharged_override

        crane_assignment.append({
            "visit_id":       str(vid),
            "vessel_service": vessel_service,   # service code the user searched for
            "crane_count":    visit_crane_count,
            "crane_ids":      visit_crane_ids_raw,
            "crane_mphc":     round(visit_crane_mphc, 2),
            "duration_hours": round(visit_crane_dur, 2),
            "loaded":         entry_loaded,
            "discharged":     entry_discharged,
            "total_units":    v_details.get("total_units", 0),
        })
    crane_assignment.sort(key=lambda x: x["total_units"], reverse=True)

    return {
        "mode":               "vessel",
        "operational_predictions": op_preds,
        "delay_analysis": delay_analysis,
        "vessel":             vessel_service,
        "actual":             actual,
        "predicted":          predicted,
        "risks":              risks,
        "execution_plan":     steps,
        "berth_analysis":     berth_analysis,
        "berth_impact_table": berth_analysis,
        "berth_recommendation": berth_rec,
        "berth_conflict_table": berth_conflicts,
        "berth_conflicts":      berth_conflicts,
        "crane_assignment":   crane_assignment,
        "top_visit_stats": {
            "loaded":      total_loaded,
            "discharged":  total_discharged,
            "hazardous":   hazardous,
            "reefer":      reefer,
            "oog":         oog,
            "total_units": total_units,
            "crane_count": len(crane_ids),
            "crane_ids":   crane_ids,
            "crane_mphc": top_visit_stats_merged.get("crane_mphc", 0.0),
            "avg_weight_kg": top_visit_stats_merged.get("avg_weight_kg", 0.0),
            "freight_kind_breakdown": top_visit_stats_merged.get("freight_kind_breakdown", {}),
            "port_of_discharge_top5": top_visit_stats_merged.get("port_of_discharge_top5", {}),
        },
    }