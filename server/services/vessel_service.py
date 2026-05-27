from __future__ import annotations
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

# Vessel summary fetch  (fast-path from vessel_visits table)
def _fetch_vessel_summary(vessel_id: str) -> Optional[dict]:
    """
    Fetches the latest summary record for a vessel visit from the database.
    """
    try:
        df = load_from_db("vessel_visits", vessel_id=vessel_id)
        if df.empty:
            return None
        if "last_move_time" in df.columns:
            df = df.sort_values("last_move_time", ascending=False)
        elif "updated_at" in df.columns:
            df = df.sort_values("updated_at", ascending=False)
        return df.iloc[0].to_dict()
    except Exception as exc:
        logger.warning("vessel summary fetch failed for %s: %s", vessel_id, exc)
    return None

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
        if valid.empty or "crane_id" not in valid.columns or "vessel_id" not in valid.columns:
            return {vid: 0 for vid in visit_ids}

        # Group by vessel_id and count unique cranes
        counts = valid.groupby("vessel_id")["crane_id"].nunique().to_dict()
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
        })

    return causes

# Berth table builder
# Dashboard & Heatmap builders
def get_yard_heatmap_data(
    vessel_id: str,
    unit_ids: list[str] = None,
    yard_id: str = None,
) -> dict:
    """
    Unified endpoint for all map/heatmap/terminal visualization data.
    """
    visit_id = ""

    if unit_ids:
        from utils.current_container_lookup import lookup_containers_by_ids
        df = lookup_containers_by_ids(unit_ids, yard_id)
        if df is not None and not df.empty:
            df["unit_id"] = df["unit_id"].astype(str).str.strip().str.upper()
            if "actual_outbound_carrier_visit_id" in df.columns:
                valid_visits = df["actual_outbound_carrier_visit_id"].dropna()
                if not valid_visits.empty:
                    visit_id = str(valid_visits.iloc[0])
    else:
        df = load_from_db("current", yard_id=yard_id, vessel_id=vessel_id)

        if df.empty:
            df = load_from_db("history", yard_id=yard_id, vessel_id=vessel_id)

        if not df.empty:
            v_id_upper = vessel_id.strip().upper()
            mask = pd.Series([False] * len(df), index=df.index)
            if "outbound_service" in df.columns:
                mask |= (df["outbound_service"].astype(str).str.strip().str.upper() == v_id_upper)
            if "actual_outbound_carrier_visit_id" in df.columns:
                mask |= (df["actual_outbound_carrier_visit_id"].astype(str).str.strip().str.upper() == v_id_upper)
            df = df[mask].copy()

            if not df.empty and "unit_id" in df.columns:
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
            "vessel": vessel_id,
            "visit_id": "",
            "yard_id": yard_id,
            "error": f"No containers found for vessel '{vessel_id}'",
            "blocks": [],
            "summary": {
                "total_containers": 0,
                "total_blocks": 0,
                "reefer_total": 0,
                "hazmat_total": 0,
                "oog_total": 0,
            },
            "infrastructure": _get_infrastructure(),
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
            "infrastructure": _get_infrastructure(),
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
        pos_str = row.get("current_position") or row.get("ctr_to_position") or row.get("ctr_from_position")
        if not pos_str:
            continue

        pos_info = parse_position(pos_str)
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
        block_list.append({
            "block_id": bk,
            "total_containers": data["density"],
            "reefer_count": data["reefer"],
            "hazmat_count": data["hazmat"],
            "oog_count": data["oog"],
            "density_pct": round(data["density"] / max(max_density, 1), 4),
            "avg_stack_height": round(avg_h, 1),
            "containers": []
        })

        for u in data["unit_rows"]:
            c_pos = u.get("current_position") or u.get("ctr_to_position")
            p_info = parse_position(c_pos)
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
            })

    summary = {
        "total_containers": sum(b["total_containers"] for b in block_list),
        "total_blocks": len(block_list),
        "reefer_total": sum(b["reefer_count"] for b in block_list),
        "hazmat_total": sum(b["hazmat_count"] for b in block_list),
        "oog_total": sum(b["oog_count"] for b in block_list),
    }

    berth_analysis: list[dict] = []
    conflict_table: list[dict] = []
    primary_berth: dict = {}

    total_all = summary["total_containers"] or 1
    sorted_blocks = sorted(block_list, key=lambda x: x["total_containers"], reverse=True)
    max_count = sorted_blocks[0]["total_containers"] if sorted_blocks else 1

    for idx, block_data in enumerate(sorted_blocks[:5], start=1):
        bk = block_data["block_id"]
        total = block_data["total_containers"]
        share = round((total / total_all) * 100, 2)
        intensity = round(total / max(max_count, 1), 4)

        risk = (
            "High" if share >= _settings.BERTH_HIGH_RISK_SHARE_PCT or total >= _settings.BERTH_HIGH_RISK_MOVES
            else "Medium" if share >= _settings.BERTH_MEDIUM_RISK_SHARE_PCT or total >= _settings.BERTH_MEDIUM_RISK_MOVES
            else "Low"
        )

        parts = bk.split("-", 1)
        terminal = parts[0] if len(parts) == 2 else "YARD"
        block = parts[1] if len(parts) == 2 else bk

        haz = block_data["hazmat_count"]
        ref = block_data["reefer_count"]
        oog = block_data["oog_count"]

        impact_score = round(share + haz * 2 + ref + oog, 2)
        travel_score = int((hash(bk) % 90) + 10)

        berth_analysis.append({
            "rank":                    idx,
            "berth":                   bk,
            "terminal":                terminal,
            "block":                   block,
            "total_moves":             total,
            "load_moves":              total,
            "discharge_moves":         0,
            "cargo_concentration_pct": share,
            "intensity":               intensity,
            "recommended_cranes":      max(1, math.ceil((total / max(120, 1)) * 2.0)),
            "congestion_risk":         risk,
            "hazardous":               haz,
            "reefer":                  ref,
            "oog":                     oog,
            "unique_containers":       total,
            "impact_score":            impact_score,
            "travel_distance_score":   travel_score,
            "travel_distance_label": (
                "Short" if travel_score < 30
                else "Moderate" if travel_score < 70
                else "Long"
            ),
            "corridor_congestion": (
                "High" if intensity > 0.8
                else "Moderate" if intensity > 0.4
                else "Low"
            ),
            "mitigation": (
                "Deploy additional transport units"
                if travel_score >= 70 else "Standard operations"
            ),
        })

    if berth_analysis:
        # 1. Target Vessel Window
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
                from db.queries import get_engine, _discover_tables
                from sqlalchemy import text
                engine = get_engine()
                tables = _discover_tables(engine, "container_operations", yard_id)
                for tbl in tables:
                    query = text(f"""
                        SELECT actual_outbound_carrier_visit_id, outbound_service, ctr_from_position
                        FROM {tbl}
                        WHERE actual_outbound_carrier_visit_id != :visit_id
                          AND actual_outbound_carrier_visit_id IS NOT NULL
                          AND move_complete_time BETWEEN :min_time AND :max_time
                    """)
                    cdf = pd.read_sql(query, engine, params={
                        "visit_id": target_visit_id,
                        "min_time": min_time,
                        "max_time": max_time
                    })
                    for crow in cdf.to_dict('records'):
                        v_id = crow.get("actual_outbound_carrier_visit_id")
                        if v_id not in concurrent_vessels:
                            concurrent_vessels[v_id] = {"service": crow.get("outbound_service"), "blocks": set()}
                        c_pos = crow.get("ctr_from_position")
                        if pd.notna(c_pos):
                            cp_info = parse_position(str(c_pos))
                            if cp_info and cp_info.get("is_yard"):
                                cbk = block_label(cp_info)
                                if cbk:
                                    concurrent_vessels[v_id]["blocks"].add(cbk)
            except Exception as e:
                print(f"Error querying concurrent vessels: {e}")

        for row in berth_analysis:
            conflicts: list[dict] = []
            row_block = row["berth"]
            
            for v_id, v_data in concurrent_vessels.items():
                shared_blocks = []
                if row_block in v_data["blocks"]:
                    shared_blocks.append(row_block)
                if shared_blocks:
                    overlap_hours = round((max_time - min_time).total_seconds() / 3600, 1) if pd.notna(max_time) else 0
                    conflicts.append({
                        "vessel_service": str(v_data["service"]),
                        "visit_id": str(v_id),
                        "shared_blocks": shared_blocks,
                        "overlap_hours": overlap_hours
                    })

            reason = (
                f"High congestion — {row['cargo_concentration_pct']}% of units here."
                if row["congestion_risk"] == "High"
                else f"Moderate load — {row['cargo_concentration_pct']}% of units here."
                if row["congestion_risk"] == "Medium"
                else f"{row['cargo_concentration_pct']}% of units concentrated here."
            )
            
            if conflicts:
                svc = conflicts[0]["vessel_service"]
                hrs = conflicts[0]["overlap_hours"]
                reason = f"Block {row_block} is shared with vessel {svc} for {hrs} hrs — HIGH crane clash risk."
                row["congestion_risk"] = "High"
                
            elif row["hazardous"] > 0:
                reason += f" {row['hazardous']} hazmat units require buffer zones."
            elif row["reefer"] > 0:
                reason += f" {row['reefer']} reefer units need power allocation."

            conflict_table.append({
                "berth":         row["berth"],
                "block":         row["block"],
                "conflict_risk": row["congestion_risk"],
                "conflict_with": conflicts[:4],
                "impact_score":  row["impact_score"],
                "reason":        reason,
            })

        primary_berth = dict(berth_analysis[0])
        primary_berth["recommendation_reason"] = (
            f"{primary_berth['cargo_concentration_pct']}% of cargo concentrated in this berth. "
            f"{primary_berth['congestion_risk']} congestion expected."
        )

    return {
        "vessel": vessel_id,
        "visit_id": visit_id,
        "yard_id": yard_id,
        "blocks": block_list,
        "summary": summary,
        "infrastructure": _get_infrastructure(),
        "berth_analysis": berth_analysis,
        "conflict_table": conflict_table,
        "primary_berth": primary_berth,
        "timestamp": pd.Timestamp.now().isoformat(),
    }

def _get_infrastructure() -> dict:
    """Terminal infrastructure data for berths and lanes."""
    return {
        "berths": [
            {"id": "B1", "slots": [1, 2, 3], "status": "available"},
            {"id": "B2", "slots": [4, 5, 6], "status": "occupied"},
            {"id": "B3", "slots": [7, 8, 9], "status": "available"},
        ],
        "lanes": [
            {"id": "L1", "occupancy": 0.2},
            {"id": "L2", "occupancy": 0.5},
            {"id": "L3", "occupancy": 0.8},
        ],
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
        return {"error": "No data available", "vessel": vessel_service}

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