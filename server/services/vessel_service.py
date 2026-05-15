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

logger = logging.getLogger("port_system")


# ─────────────────────────────────────────────────────────────────────────────
# Small helpers
# ─────────────────────────────────────────────────────────────────────────────

def _is_yes(val) -> bool:
    return str(val).strip().upper() in ("YES", "Y", "TRUE", "1")


def _extract_move_side(row) -> Tuple[str, Optional[dict]]:
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


# ─────────────────────────────────────────────────────────────────────────────
# Vessel summary fetch  (fast-path from vessel_visits table)
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_vessel_summary(vessel_id: str) -> Optional[dict]:
    from db.queries import load_from_db
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


# ─────────────────────────────────────────────────────────────────────────────
# Crane data fetching
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_crane_for_visit(visit_id: str) -> pd.DataFrame:
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


def _fetch_assigned_crane_count(visit_id: str) -> int:
    """
    Fetch the number of distinct cranes assigned to a visit directly from the DB.
    Returns 0 if no crane data is found.
    """
    crane_df = _fetch_crane_for_visit(visit_id)
    if crane_df.empty:
        return 0
    valid = crane_df[crane_df["exclude"] != "Yes"] if "exclude" in crane_df.columns else crane_df
    if valid.empty or "crane_id" not in valid.columns:
        return 0
    return int(valid["crane_id"].nunique())


def _compute_crane_stats(crane_df: pd.DataFrame, container_count: int) -> dict:
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
    IDLE_THRESHOLD_SEC = 1800  # 30 minutes

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


# ─────────────────────────────────────────────────────────────────────────────
# Group enrichment
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_group(group: pd.DataFrame, visit_id: str) -> pd.DataFrame:
    crane_df = _fetch_crane_for_visit(visit_id)
    stats = _compute_crane_stats(crane_df, len(group))

    group = group.copy()
    for col, val in stats.items():
        group[col] = val

    return group


# ─────────────────────────────────────────────────────────────────────────────
# Visit detail extraction
# ─────────────────────────────────────────────────────────────────────────────

def _visit_details(visit_groups: dict) -> dict:
    out: dict = {}
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

        loads = discharges = restow_count = 0
        for _, row in vdf.iterrows():
            mt, _ = _extract_move_side(row)
            if mt == "LOAD":
                loads += 1
            elif mt == "DISCHARGE":
                discharges += 1
            elif mt in ("SHIFT", "RESTOW"):
                restow_count += 1

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
        freight_breakdown = (
            vdf["freight_kind"].value_counts().to_dict()
            if "freight_kind" in vdf.columns else {}
        )

        svc_name = (
            str(vdf["outbound_service"].iloc[0]).strip()
            if "outbound_service" in vdf.columns and not vdf["outbound_service"].isna().all()
            else None
        )

        pod_top5 = (
            vdf["port_of_discharge"].value_counts().head(5).to_dict()
            if "port_of_discharge" in vdf.columns else {}
        )

        # Fetch assigned crane count from DB for this visit
        assigned_cranes = _fetch_assigned_crane_count(str(visit_id))

        out[str(visit_id)] = {
            "stay_hours":            stay_hours,
            "vessel_service":        svc_name,
            "start_time":            str(move_start) if move_start is not None else None,
            "end_time":              str(move_end) if move_end is not None else None,
            "loaded_containers":     loads,
            "discharged_containers": discharges,
            "move_start":            str(move_start) if move_start is not None else None,
            "move_end":              str(move_end) if move_end is not None else None,
            "total_units":           total_units,
            "restow_count":          restow_count,
            "avg_weight_kg":         avg_weight_kg,
            "freight_kind_breakdown": freight_breakdown,
            "port_of_discharge_top5": pod_top5,
            "assigned_cranes":       assigned_cranes,
        }

    return out


# ─────────────────────────────────────────────────────────────────────────────
# Operational metrics prediction
# ─────────────────────────────────────────────────────────────────────────────

def _predict_operational_metrics(
    visit_df,
    loaded: int = 0,
    discharged: int = 0,
    historical_mph_avg: float = None,
):
    if visit_df.empty:
        return None

    total_ops = (loaded or 0) + (discharged or 0)
    if total_ops == 0:
        total_ops = len(visit_df)

    from config import settings as _s
    if historical_mph_avg and float(historical_mph_avg) > 0:
        target_mph = max(float(historical_mph_avg), 15.0)
    else:
        target_mph = float(_s.CRANE_MOVES_PER_HOUR_TARGET)

    load_ratio = (loaded or 0) / max(total_ops, 1)

    return {
        "load_discharge_ratio":    round(load_ratio, 3),
        "total_operations":        total_ops,
        "effective_mph_used":      round(target_mph, 2),
        "operational_rules_applied": [
            f"Target {target_mph:.1f} MPH per crane"
            + (" (historical avg)" if historical_mph_avg and float(historical_mph_avg) > 0 else "")
        ],
    }


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

    restow_count = 0
    for _, row in visit_df.iterrows():
        mt, _ = _extract_move_side(row)
        if mt in ("SHIFT", "RESTOW"):
            restow_count += 1

    if restow_count > 20:
        causes.append({
            "factor": "High Restow Rate",
            "impact": "Medium",
            "reason": f"{restow_count} restow/shift moves detected — increases berth time.",
        })

    return causes


# ─────────────────────────────────────────────────────────────────────────────
# Berth table builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_berth_tables(
    visit_df: pd.DataFrame,
    total_loaded: int,
    total_discharged: int,
    avg_hours: float,
    historical_crane_avg: float = None,
) -> tuple[list, dict, list]:
    eff_hours = (
        max(avg_hours, 1.0)
        if avg_hours and avg_hours > 0
        else max((total_loaded + total_discharged) / 25.0, 1.0)
    )

    berth_counts: dict = defaultdict(lambda: {
        "total_moves": 0,
        "load_moves": 0,
        "discharge_moves": 0,
        "units": set(),
        "hazardous": 0,
        "reefer": 0,
        "oog": 0,
    })

    for _, row in visit_df.iterrows():
        move_type, yard_pos = _extract_move_side(row)
        if yard_pos is None:
            continue
        if move_type not in ("LOAD", "DISCHARGE", "SHIFT", "RESTOW", "SNAPSHOT"):
            continue

        bk = block_label(yard_pos) or "UNKNOWN"
        bucket = berth_counts[bk]

        bucket["total_moves"] += 1
        bucket["units"].add(str(row.get("unit_id", "")).strip())

        if move_type == "LOAD":
            bucket["load_moves"] += 1
        elif move_type == "DISCHARGE":
            bucket["discharge_moves"] += 1

        if _is_yes(row.get("hazardous_flag")):
            bucket["hazardous"] += 1
        if _is_yes(row.get("reefer")):
            bucket["reefer"] += 1
        if _is_yes(row.get("oog_unit")):
            bucket["oog"] += 1

    if not berth_counts:
        return [], {}, []

    total_all = sum(v["total_moves"] for v in berth_counts.values()) or 1
    sorted_berths = sorted(berth_counts.items(), key=lambda x: x[1]["total_moves"], reverse=True)
    max_count = sorted_berths[0][1]["total_moves"]

    berth_analysis: list[dict] = []
    for idx, (bk, data) in enumerate(sorted_berths[:5], start=1):
        total = data["total_moves"]
        share = round((total / total_all) * 100, 2)
        intensity = round(total / max(max_count, 1), 4)

        risk = (
            "High" if share >= 40 or total >= 60
            else "Medium" if share >= 20 or total >= 30
            else "Low"
        )

        total_ops_all = max(total_loaded + total_discharged, total_all, 1)
        block_share = total / max(total_all, 1)
        vol_min_cranes = 3 if total_ops_all > 300 else 2 if total_ops_all > 100 else 1
        target_v_cranes = max(vol_min_cranes, round(total_ops_all / 120))
        stay_based_cranes = max(1, round(total_ops_all / (max(eff_hours, 1.0) * 20)))
        vessel_total_cranes = max(target_v_cranes, stay_based_cranes)

        if historical_crane_avg and float(historical_crane_avg) > 0:
            vessel_total_cranes = max(vessel_total_cranes, round(float(historical_crane_avg)))

        rec_cranes = max(1, math.ceil(vessel_total_cranes * block_share * 2.0))
        rec_cranes = min(rec_cranes, vessel_total_cranes)

        parts = bk.split("-", 1)
        terminal = parts[0] if len(parts) == 2 else "YARD"
        block = parts[1] if len(parts) == 2 else bk

        impact_score = round(share + data["hazardous"] * 2 + data["reefer"] + data["oog"], 2)
        travel_score = int((hash(bk) % 90) + 10)

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

    top_impact = berth_analysis[0]["impact_score"] if berth_analysis else 1
    conflict_table: list[dict] = []

    for row in berth_analysis:
        conflicts: list[str] = []
        for other in berth_analysis:
            if other["berth"] == row["berth"]:
                continue
            same_terminal = (row["terminal"] == other["terminal"])
            high_combined = (row["impact_score"] + other["impact_score"]) > top_impact * 1.2
            haz_adjacent = (row["hazardous"] > 0 or other["hazardous"] > 0) and same_terminal
            reef_adjacent = (row["reefer"] > 0 or other["reefer"] > 0) and same_terminal
            if same_terminal or high_combined or haz_adjacent or reef_adjacent:
                conflicts.append(other["berth"])

        reason = (
            f"High congestion — {row['cargo_concentration_pct']}% of units here."
            if row["congestion_risk"] == "High"
            else f"Moderate load — {row['cargo_concentration_pct']}% of units here."
            if row["congestion_risk"] == "Medium"
            else f"{row['cargo_concentration_pct']}% of units concentrated here."
        )
        if row["hazardous"] > 0:
            reason += f" {row['hazardous']} hazmat units require buffer zones."
        if row["reefer"] > 0:
            reason += f" {row['reefer']} reefer units need power allocation."

        conflict_table.append({
            "berth":         row["berth"],
            "block":         row["block"],
            "conflict_risk": row["congestion_risk"],
            "conflict_with": conflicts[:4],
            "impact_score":  row["impact_score"],
            "reason":        reason,
        })

    primary: dict = {}
    if berth_analysis:
        primary = dict(berth_analysis[0])
        primary["recommendation_reason"] = (
            f"{primary['cargo_concentration_pct']}% of cargo concentrated in this berth. "
            f"{primary['congestion_risk']} congestion expected."
        )

    return berth_analysis, primary, conflict_table


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard & Heatmap builders
# ─────────────────────────────────────────────────────────────────────────────

def get_yard_heatmap_data(
    vessel_id: str,
    unit_ids: list[str] = None,
    yard_id: str = None,
) -> dict:
    """
    Unified endpoint for all map/heatmap/terminal visualization data.
    """
    from db.queries import load_from_db

    df = load_from_db("current", yard_id=yard_id)

    if df.empty:
        df = load_from_db("history", yard_id=yard_id)

    if df.empty:
        return {
            "vessel": vessel_id,
            "yard_id": yard_id,
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

    v_id_upper = vessel_id.strip().upper()
    mask = pd.Series([False] * len(df), index=df.index)
    if "outbound_service" in df.columns:
        mask |= (df["outbound_service"].astype(str).str.strip().str.upper() == v_id_upper)
    if "actual_outbound_carrier_visit_id" in df.columns:
        mask |= (df["actual_outbound_carrier_visit_id"].astype(str).str.strip().str.upper() == v_id_upper)
    df = df[mask].copy()

    if df.empty:
        return {
            "vessel": vessel_id,
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

    for _, row in df.iterrows():
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

        b["unit_rows"].append(row.to_dict())

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
            "containers": [
                {
                    "unit_id": u.get("unit_id"),
                    "position": u.get("current_position") or u.get("ctr_to_position"),
                    "freight_kind": u.get("freight_kind"),
                    "outbound_service": u.get("outbound_service"),
                    "category": u.get("category_id"),
                    "hazardous": _is_yes(u.get("hazardous_flag")),
                    "reefer": _is_yes(u.get("reefer")),
                    "oog": _is_yes(u.get("oog_unit")),
                }
                for u in data["unit_rows"]
            ],
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
            "High" if share >= 40 or total >= 60
            else "Medium" if share >= 20 or total >= 30
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
        top_impact = berth_analysis[0]["impact_score"]
        for row in berth_analysis:
            conflicts: list[str] = []
            for other in berth_analysis:
                if other["berth"] == row["berth"]:
                    continue
                same_terminal = (row["terminal"] == other["terminal"])
                high_combined = (row["impact_score"] + other["impact_score"]) > top_impact * 1.2
                haz_adjacent = (row["hazardous"] > 0 or other["hazardous"] > 0) and same_terminal
                reef_adjacent = (row["reefer"] > 0 or other["reefer"] > 0) and same_terminal
                if same_terminal or high_combined or haz_adjacent or reef_adjacent:
                    conflicts.append(other["berth"])

            reason = (
                f"High congestion — {row['cargo_concentration_pct']}% of units here."
                if row["congestion_risk"] == "High"
                else f"Moderate load — {row['cargo_concentration_pct']}% of units here."
                if row["congestion_risk"] == "Medium"
                else f"{row['cargo_concentration_pct']}% of units concentrated here."
            )
            if row["hazardous"] > 0:
                reason += f" {row['hazardous']} hazmat units require buffer zones."
            if row["reefer"] > 0:
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


# ─────────────────────────────────────────────────────────────────────────────
# Main dashboard entry point
# ─────────────────────────────────────────────────────────────────────────────

def analyze_vessel_dashboard(
    df: pd.DataFrame,
    vessel_service: str,
    loaded_override: int = None,
    discharged_override: int = None,
    history_df: pd.DataFrame = None,
    optional_unit_ids: list[str] = None,
) -> dict:
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

    # ── Fetch crane counts from DB for all visits ────────────────────────────
    visit_crane_counts: dict = {}
    for visit_id in visit_groups:
        visit_crane_counts[str(visit_id)] = _fetch_assigned_crane_count(str(visit_id))

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
            from models.stay_model import _prepare_model_visit_data as _raw_prep
            baseline_prepared[vid] = _raw_prep(grp.copy())

    if baseline_prepared:
        historical_features_list = []
        for vid, vdf in baseline_prepared.items():
            f = create_features(vdf)
            if f:
                # Override move_span_hours with actual computed stay when available
                from models.stay_model import _compute_raw_visit_stay as _raw_stay
                raw_stay = _raw_stay(vdf)
                if raw_stay and raw_stay > 0:
                    f["move_span_hours"] = raw_stay
                historical_features_list.append(f)

        if historical_features_list:
            from config import settings as _settings
            for k in _settings.FEATURE_NAMES:
                vals = [f[k] for f in historical_features_list if k in f]
                if vals:
                    feature_template[k] = sum(vals) / len(vals)

            # historical_mph_avg: moves per hour across the full operational span
            # Use actual stay hours (not move_span_hours from features) as the denominator
            mph_rates = []
            for f in historical_features_list:
                span = f.get("move_span_hours", 0)
                moves = f.get("total_moves", 0)
                if span > 0 and moves > 0:
                    mph_rates.append(moves / span)
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

            from models.stay_model import predict_stay_duration_from_metrics
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
            "total_units":            details.get("total_units", 0),
            "restow_count":           details.get("restow_count", 0),
            "avg_weight_kg":          details.get("avg_weight_kg", 0.0),
            "freight_kind_breakdown": details.get("freight_kind_breakdown", {}),
            "port_of_discharge_top5": details.get("port_of_discharge_top5", {}),
            "assigned_cranes":        details.get("assigned_cranes", 0),
        }

    merged_stays = [v["stay_hours"] for v in merged_visits.values() if v.get("stay_hours", 0) > 0]
    merged_avg_hours = round(sum(merged_stays) / len(merged_stays), 2) if merged_stays else 0.0

    actual = {
        "visits":    merged_visits,
        "avg_hours": merged_avg_hours if merged_avg_hours > 0 else actual_raw.get("avg_hours"),
        "max_hours": max(merged_stays) if merged_stays else actual_raw.get("max_hours"),
        "min_hours": min(merged_stays) if merged_stays else actual_raw.get("min_hours"),
    }

    # ── Pick busiest visit ───────────────────────────────────────────────────
    visit_scores: list[tuple] = []
    for vid, vdf in visit_groups.items():
        if vdf is None or vdf.empty:
            continue
        score = (
            len(vdf) if is_current_mode
            else sum(
                1 for _, row in vdf.iterrows()
                if _extract_move_side(row)[0] in ("LOAD", "DISCHARGE")
            )
        )
        visit_scores.append((vid, score))

    if not visit_scores:
        return {"error": "No valid visit data found", "vessel": vessel_service}

    visit_scores.sort(key=lambda x: x[1], reverse=True)
    top_visit_id = visit_scores[0][0]
    visit_df = visit_groups[top_visit_id]

    if visit_df is None or visit_df.empty:
        return {"error": "Top visit has no usable rows", "vessel": vessel_service}

    # ── Count loads / discharges ─────────────────────────────────────────────
    total_loaded = total_discharged = 0
    for _, row in visit_df.iterrows():
        mt, _ = _extract_move_side(row)
        if mt == "LOAD":
            total_loaded += 1
        elif mt == "DISCHARGE":
            total_discharged += 1

    hazardous = int(visit_df["hazardous_flag"].apply(_is_yes).sum()) if "hazardous_flag" in visit_df.columns else 0
    reefer = int(visit_df["reefer"].apply(_is_yes).sum()) if "reefer" in visit_df.columns else 0
    oog = int(visit_df["oog_unit"].apply(_is_yes).sum()) if "oog_unit" in visit_df.columns else 0
    total_units = int(visit_df["unit_id"].nunique()) if "unit_id" in visit_df.columns else 0

    avg_hours = actual.get("avg_hours") or 0

    top_visit_stats_merged = actual.get("visits", {}).get(str(top_visit_id), {})
    restow_count = top_visit_stats_merged.get("restow_count", 0)

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