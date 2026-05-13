from __future__ import annotations

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
    is_vessel_pos,
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
    from_pos    = safe_get_pos(row, "crane_from", "ctr_from_position", "from_position")
    to_pos      = safe_get_pos(row, "crane_to",   "ctr_to_position",   "to_position")
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
        # Sort by most recent activity and return the latest row
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
    valid = (
        crane_df[crane_df["exclude"] != "Yes"]
        if "exclude" in crane_df.columns else crane_df
    )
    if valid.empty:
        return {**empty_stats, "_crane_move_count": total_moves}

    crane_count = int(valid["crane_id"].nunique())

    # Sum individual crane active windows (avoids inflating idle gaps between visits)
    total_crane_hours = 0.0
    for _, cgrp in valid.groupby("crane_id"):
        cmin = cgrp["crane_time"].min()
        cmax = cgrp["crane_time"].max()
        if pd.notna(cmin) and pd.notna(cmax):
            total_crane_hours += max((cmax - cmin).total_seconds() / 3600, 0.1)

    eff  = len(valid)
    mphc = (
        min((eff / total_crane_hours) / max(crane_count, 1), 999.0)
        if total_crane_hours > 0 else 0.0
    )

    restows = (
        len(valid[valid["crane_move_kind"].isin(["RESTOW", "SHIFT"])])
        if "crane_move_kind" in valid.columns else 0
    )
    crane_ids = valid["crane_id"].dropna().unique().tolist()

    return {
        "_crane_move_count":      total_moves,
        "_crane_effective_moves": eff,
        "_crane_count":           float(crane_count),
        "_crane_duration_hours":  float(total_crane_hours),
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
    stats    = _compute_crane_stats(crane_df, len(group))

    group = group.copy()
    for col, val in stats.items():
        group[col] = val

    if not crane_df.empty and "move_complete_time" in group.columns:
        if "unit_id" in crane_df.columns:
            unit_crane_time = (
                crane_df.dropna(subset=["crane_time"])
                .sort_values("crane_time")
                .drop_duplicates(subset=["unit_id"], keep="first")
                [["unit_id", "crane_time"]]
            )
            if not unit_crane_time.empty and "unit_id" in group.columns:
                merged = group.merge(unit_crane_time, on="unit_id", how="left")
                group["move_complete_time"] = group["move_complete_time"].fillna(
                    merged["crane_time"]
                )

    return group


# ─────────────────────────────────────────────────────────────────────────────
# Visit detail extraction
# ─────────────────────────────────────────────────────────────────────────────

def _visit_details(enriched_visits: dict) -> dict:
    out: dict = {}
    for visit_id, vdf in enriched_visits.items():
        if vdf is None or vdf.empty:
            continue

        time_col = None
        for tc in ("move_complete_time", "time_in", "crane_time"):
            if tc in vdf.columns and vdf[tc].notna().any():
                time_col = tc
                break
        if time_col is None:
            continue

        times = pd.to_datetime(vdf[time_col], errors="coerce").dropna()
        if times.empty:
            continue

        start = times.min()
        end   = times.max()

        loads = discharges = restow_count = 0
        for _, row in vdf.iterrows():
            mt, _ = _extract_move_side(row)
            if mt == "LOAD":
                loads += 1
            elif mt == "DISCHARGE":
                discharges += 1
            elif mt in ("SHIFT", "RESTOW"):
                restow_count += 1

        total_units = (
            int(vdf["unit_id"].nunique()) if "unit_id" in vdf.columns else len(vdf)
        )
        crane_mphc = (
            float(vdf["_crane_mphc"].iloc[0])
            if "_crane_mphc" in vdf.columns and not vdf["_crane_mphc"].isna().all()
            else 0.0
        )
        w_col = (
            "unit_weight_in_kg"    if "unit_weight_in_kg"    in vdf.columns
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
        pod_top5 = (
            vdf["port_of_discharge"].value_counts().head(5).to_dict()
            if "port_of_discharge" in vdf.columns else {}
        )

        def _col_val(col):
            if col in vdf.columns and not vdf[col].isna().all():
                return float(vdf[col].iloc[0])
            return 0.0

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
            "total_units":            total_units,
            "restow_count":           restow_count,
            "crane_mphc":             crane_mphc,
            "crane_count":            int(_col_val("_crane_count")),
            "crane_ids":              vdf["_crane_ids"].iloc[0] if "_crane_ids" in vdf.columns else "[]",
            "crane_duration_hours":   round(_col_val("_crane_duration_hours"), 2),
            "crane_exclude_ratio":    _col_val("_crane_exclude_ratio"),
            "avg_weight_kg":          avg_weight_kg,
            "freight_kind_breakdown": freight_breakdown,
            "port_of_discharge_top5": pod_top5,
        }
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Operational metrics prediction
# ─────────────────────────────────────────────────────────────────────────────

def _predict_operational_metrics(
    visit_df,
    crane_df,
    ml_stay_hours,
    loaded: int = 0,
    discharged: int = 0,
    crane_count_override: float = None,
    historical_crane_avg: float = None,
    historical_mph_avg: float = None,
):
    if visit_df.empty:
        return None

    total_ops = (loaded or 0) + (discharged or 0)
    if total_ops == 0:
        total_ops = len(visit_df)

    effective_stay_hours = (
        ml_stay_hours.get("avg_hours", 24.0)
        if isinstance(ml_stay_hours, dict)
        else (
            ml_stay_hours
            if isinstance(ml_stay_hours, (int, float)) and ml_stay_hours > 0
            else 24.0
        )
    )

    from config import settings as _s
    if historical_mph_avg and float(historical_mph_avg) > 0:
        target_mph = max(float(historical_mph_avg), 15.0)
    else:
        target_mph = float(_s.CRANE_MOVES_PER_HOUR_TARGET)

    required_mph = total_ops / max(effective_stay_hours, 1.0)

    if crane_count_override and int(crane_count_override) > 0:
        recommended_crane_count = int(crane_count_override)
    else:
        recommended_crane_count = max(math.ceil(required_mph / target_mph), 1)

    if not crane_count_override:
        if historical_crane_avg and float(historical_crane_avg) > 0:
            if total_ops > 100:
                recommended_crane_count = max(
                    recommended_crane_count, round(float(historical_crane_avg))
                )
        else:
            if total_ops > 300:
                recommended_crane_count = max(recommended_crane_count, 3)
            elif total_ops > 100:
                recommended_crane_count = max(recommended_crane_count, 2)

    recommended_crane_count = min(recommended_crane_count, 6)

    intensity  = total_ops / max(effective_stay_hours, 1)
    load_ratio = (loaded or 0) / max(total_ops, 1)

    if intensity > 80:
        strategy_label = "HIGH_DENSITY_FIRST"
        strategy_desc  = "Prioritize dense blocks with dual cycling to meet aggressive schedule."
    elif load_ratio > 0.7:
        strategy_label = "LOAD_DOMINANT"
        strategy_desc  = "Heavy load operation — prioritize yard pre-staging and crane allocation."
    elif load_ratio < 0.3 and (discharged or 0) > 100:
        strategy_label = "DISCHARGE_DOMINANT"
        strategy_desc  = "Heavy discharge — clear berth blocks sequentially, ITV on high alert."
    elif recommended_crane_count >= 3:
        strategy_label = "BLOCK_SEQUENTIAL"
        strategy_desc  = "Assign cranes sequentially along the berth to avoid overlap."
    else:
        strategy_label = "BALANCED_DUAL_CRANE"
        strategy_desc  = "Balanced load/discharge spread to minimise ITV waiting."

    crane_overlap_risk = (
        "High"   if recommended_crane_count > 4 and intensity > 60
        else "Medium" if recommended_crane_count > 2
        else "Low"
    )
    avg_travel_score = 35 + (intensity * 0.2)
    itv_needs        = math.ceil(recommended_crane_count * 4.5)
    op_impact        = min(
        100,
        int(
            (intensity * 0.4)
            + (recommended_crane_count * 5)
            + (avg_travel_score * 0.3)
        ),
    )

    return {
        "recommended_crane_count": recommended_crane_count,
        "strategy_label":          strategy_label,
        "strategy_description":    strategy_desc,
        "conflict_risk":           crane_overlap_risk,
        "load_discharge_ratio":    round(load_ratio, 3),
        "total_operations":        total_ops,
        "effective_mph_used":      round(target_mph, 2),
        "itv_impact": {
            "avg_travel_score":    round(avg_travel_score, 1),
            "itv_cycle_impact": (
                "High traffic on main corridors"
                if avg_travel_score > 50 else "Normal flow"
            ),
            "estimated_itv_needs": itv_needs,
        },
        "operational_impact_score": op_impact,
        "operational_rules_applied": [
            f"Target {target_mph:.1f} MPH per crane"
            + (" (historical average)" if historical_mph_avg and float(historical_mph_avg) > 0 and not crane_count_override else ""),
            f"Required MPH: {required_mph:.1f} → {recommended_crane_count} crane(s)",
            f"ITV ratio ~4.5:1 for {strategy_label}",
            "Conflict mitigation spacing applied",
        ],
    }


def _calculate_delay_analysis(visit_df, crane_df):
    causes = []
    if visit_df.empty:
        return causes
    if not crane_df.empty and "crane_time" in crane_df.columns:
        cdfc       = crane_df.sort_values("crane_time").copy()
        cdfc["gap"] = cdfc["crane_time"].diff().dt.total_seconds() / 60
        long_gaps   = cdfc[cdfc["gap"] > 30]
        if not long_gaps.empty:
            causes.append({
                "factor": "Crane Idle Time",
                "impact": "High",
                "reason": f"Detected {len(long_gaps)} idle periods exceeding 30 mins.",
            })
    if not crane_df.empty and "crane_move_kind" in crane_df.columns:
        restow = len(crane_df[crane_df["crane_move_kind"].isin(["RESTOW", "SHIFT"])])
        if restow > 20:
            causes.append({
                "factor": "High Restow Rate",
                "impact": "Medium",
                "reason": f"{restow} restows detected, delaying primary load/discharge.",
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
        "total_moves": 0, "load_moves": 0, "discharge_moves": 0,
        "units": set(), "hazardous": 0, "reefer": 0, "oog": 0,
    })

    for _, row in visit_df.iterrows():
        move_type, yard_pos = _extract_move_side(row)
        if yard_pos is None:
            continue
        if move_type not in ("LOAD", "DISCHARGE", "SHIFT", "RESTOW", "SNAPSHOT"):
            continue

        bk     = block_label(yard_pos) or "UNKNOWN"
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

    total_all      = sum(v["total_moves"] for v in berth_counts.values()) or 1
    sorted_berths  = sorted(berth_counts.items(), key=lambda x: x[1]["total_moves"], reverse=True)
    max_count      = sorted_berths[0][1]["total_moves"]

    berth_analysis: list[dict] = []
    for idx, (bk, data) in enumerate(sorted_berths[:5], start=1):
        total      = data["total_moves"]
        share      = round((total / total_all) * 100, 2)
        intensity  = round(total / max(max_count, 1), 4)

        risk = (
            "High"   if share >= 40 or total >= 60
            else "Medium" if share >= 20 or total >= 30
            else "Low"
        )

        total_ops_all  = max(total_loaded + total_discharged, total_all, 1)
        block_share    = total / max(total_all, 1)
        vol_min_cranes = 3 if total_ops_all > 300 else 2 if total_ops_all > 100 else 1
        target_v_cranes = max(vol_min_cranes, round(total_ops_all / 120))
        stay_based_cranes = max(1, round(total_ops_all / (max(eff_hours, 1.0) * 20)))
        vessel_total_cranes = max(target_v_cranes, stay_based_cranes)

        if historical_crane_avg and float(historical_crane_avg) > 0:
            vessel_total_cranes = max(vessel_total_cranes, round(float(historical_crane_avg)))

        rec_cranes = max(1, math.ceil(vessel_total_cranes * block_share * 2.0))
        rec_cranes = min(rec_cranes, vessel_total_cranes)

        parts    = bk.split("-", 1)
        terminal = parts[0] if len(parts) == 2 else "YARD"
        block    = parts[1] if len(parts) == 2 else bk

        impact_score  = round(share + data["hazardous"] * 2 + data["reefer"] + data["oog"], 2)
        travel_score  = int((hash(bk) % 90) + 10)

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
                "Short"    if travel_score < 30
                else "Moderate" if travel_score < 70
                else "Long"
            ),
            "corridor_congestion": (
                "High"     if intensity > 0.8
                else "Moderate" if intensity > 0.4
                else "Low"
            ),
            "mitigation": (
                "Deploy additional transport units"
                if travel_score >= 70 else "Standard operations"
            ),
        })

    top_impact     = berth_analysis[0]["impact_score"] if berth_analysis else 1
    conflict_table: list[dict] = []

    for row in berth_analysis:
        conflicts: list[str] = []
        for other in berth_analysis:
            if other["berth"] == row["berth"]:
                continue
            same_terminal  = (row["terminal"] == other["terminal"])
            high_combined  = (row["impact_score"] + other["impact_score"]) > top_impact * 1.2
            haz_adjacent   = (row["hazardous"] > 0 or other["hazardous"] > 0) and same_terminal
            reef_adjacent  = (row["reefer"]    > 0 or other["reefer"]    > 0) and same_terminal
            if same_terminal or high_combined or haz_adjacent or reef_adjacent:
                conflicts.append(other["berth"])

        reason = (
            f"High congestion — {row['cargo_concentration_pct']}% of moves here."
            if row["congestion_risk"] == "High"
            else f"Moderate load — {row['cargo_concentration_pct']}% of moves here."
            if row["congestion_risk"] == "Medium"
            else f"{row['cargo_concentration_pct']}% of moves concentrated here."
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

    # Attach recommendation reason to primary berth dict copy
    primary: dict = {}
    if berth_analysis:
        primary = dict(berth_analysis[0])
        primary["recommendation_reason"] = (
            f"{primary['cargo_concentration_pct']}% of cargo concentrated in this berth. "
            f"{primary['congestion_risk']} congestion expected."
        )

    return berth_analysis, primary, conflict_table

# ─────────────────────────────────────────────────────────────────────────────
# Public unified stay analysis entry point
# ─────────────────────────────────────────────────────────────────────────────

def get_unified_stay_analysis(
    vessel_id: str,
    loaded: int = None,
    discharged: int = None,
    crane_count: int = None,
) -> dict:
    """
    Single entry point for all three stay-time analysis modes:
      1. Vessel-only       — pass only vessel_id
      2. Workload-adjusted — pass loaded and/or discharged
      3. Crane-adjusted    — pass crane_count (can combine with mode 2)

    Tries current yard data first, falls back to history automatically.
    Returns the same structure as analyze_vessel_dashboard.
    """
    from db.queries import load_from_db

    df_curr = load_from_db("current")
    df_hist = load_from_db("history")

    result = analyze_vessel_dashboard(
        df_curr,
        vessel_id,
        loaded_override=loaded,
        discharged_override=discharged,
        crane_count_override=crane_count,
        history_df=df_hist,
    )

    if "error" in result:
        hist_result = analyze_vessel_dashboard(
            df_hist,
            vessel_id,
            loaded_override=loaded,
            discharged_override=discharged,
            crane_count_override=crane_count,
        )
        if "error" not in hist_result:
            return hist_result

    return result

# ─────────────────────────────────────────────────────────────────────────────
# Main dashboard entry point
# ─────────────────────────────────────────────────────────────────────────────

def analyze_vessel_dashboard(
    df: pd.DataFrame,
    vessel_service: str,
    loaded_override: int = None,
    discharged_override: int = None,
    crane_count_override: int = None,
    history_df: pd.DataFrame = None,
) -> dict:
    if df is None or df.empty:
        return {"error": "No data available", "vessel": vessel_service}

    if (
        "outbound_service" not in df.columns
        and "actual_outbound_carrier_visit_id" not in df.columns
    ):
        return {"error": "Missing required columns", "vessel": vessel_service}

    search_key = str(vessel_service).strip().upper()

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
            prefix   = search_key[:2]
            prefix_matches = sorted(
                [s for s in all_svcs if str(s).upper().startswith(prefix)]
            )[:5]
            suggestions = prefix_matches or sorted([str(s) for s in all_svcs])[:5]
        hint = (
            f" Available similar services: {', '.join(suggestions)}."
            if suggestions else ""
        )
        return {
            "error":       f"No data found for vessel '{vessel_service}'.{hint}",
            "vessel":      vessel_service,
            "suggestions": suggestions,
        }

    if "actual_outbound_carrier_visit_id" not in vessel_df.columns:
        vessel_df["actual_outbound_carrier_visit_id"] = vessel_service

    # ── Enrich and prepare visits ────────────────────────────────────────────
    enriched_visits: dict = {}
    prepared_visits: dict = {}

    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        group    = group.copy()
        enriched = _enrich_group(group, str(visit_id))
        enriched_visits[visit_id] = enriched
        prepared_visits[visit_id] = prepare_visit_data(enriched)

    # ── Compute actual stay ──────────────────────────────────────────────────
    actual_raw = compute_vessel_stay(prepared_visits)

    # ── Determine whether this is a current-mode (live yard) call ────────────
    # A visit has "history" data when time-based stay can be computed directly.
    is_current_mode = not bool(actual_raw.get("visits"))

    # ── Historical baseline: prefer passed history_df, fall back to df ───────
    # Normalise whichever source we have so the column is guaranteed present.
    def _filter_baseline(source_df: pd.DataFrame) -> pd.DataFrame:
        if source_df is None or source_df.empty:
            return pd.DataFrame()
        if "outbound_service" not in source_df.columns:
            return pd.DataFrame()
        return source_df[
            source_df["outbound_service"].astype(str).str.strip().str.upper() == search_key
        ].copy()

    baseline_vessel = _filter_baseline(history_df)
    if baseline_vessel.empty:
        baseline_vessel = _filter_baseline(df)
    if baseline_vessel.empty:
        baseline_vessel = vessel_df.copy()

    baseline_enriched: dict = {}
    baseline_prepared: dict = {}
    for vid, grp in baseline_vessel.groupby("actual_outbound_carrier_visit_id"):
        be = _enrich_group(grp.copy(), str(vid))
        baseline_enriched[vid] = be
        baseline_prepared[vid] = prepare_visit_data(be)

    # ── Fast-path: pull averages from vessel_visits summary ──────────────────
    historical_crane_avg = 0.0
    historical_mph_avg   = 0.0

    summary = _fetch_vessel_summary(search_key)
    if summary:
        historical_crane_avg = float(summary.get("avg_crane_count", 0.0) or 0.0)
        historical_mph_avg   = float(summary.get("avg_mphc",        0.0) or 0.0)

    # ── Fallback: compute averages from baseline enriched data ───────────────
    # Always build feature_template from baseline regardless of summary path,
    # so current-mode predictions can be patched with realistic feature values.
    feature_template: dict = {}

    if baseline_prepared:
        historical_features_list = []
        for vid, vdf in baseline_prepared.items():
            f = create_features(vdf)
            if f:
                historical_features_list.append(f)

        if historical_features_list:
            from config import settings as _settings
            for k in _settings.FEATURE_NAMES:
                vals = [f[k] for f in historical_features_list if k in f]
                if vals:
                    feature_template[k] = sum(vals) / len(vals)

    # Only recompute crane/mph averages from data when summary was missing
    if (historical_crane_avg == 0.0 or historical_mph_avg == 0.0) and baseline_enriched:
        total_cranes  = 0.0
        total_mph     = 0.0
        crane_v_count = 0
        mph_v_count   = 0

        for vid, vdf in baseline_enriched.items():
            cc = (
                float(vdf["_crane_count"].iloc[0])
                if "_crane_count" in vdf.columns and not vdf["_crane_count"].isna().all()
                else 0.0
            )
            if cc > 0:
                total_cranes += cc
                crane_v_count += 1

            mph = (
                float(vdf["_crane_mphc"].iloc[0])
                if "_crane_mphc" in vdf.columns and not vdf["_crane_mphc"].isna().all()
                else 0.0
            )
            if mph > 0:
                total_mph += mph
                mph_v_count += 1

        if historical_crane_avg == 0.0 and crane_v_count > 0:
            historical_crane_avg = total_cranes / crane_v_count
        if historical_mph_avg == 0.0 and mph_v_count > 0:
            historical_mph_avg = total_mph / mph_v_count

    # ── Synthesise stay for current mode ─────────────────────────────────────
    if not actual_raw:
        if is_current_mode:
            try:
                predicted_init = predict_vessel_stay_duration(
                    prepared_visits,
                    crane_count_override=historical_crane_avg or None,
                    mph_override=historical_mph_avg or None,
                    feature_template=feature_template,
                )
                pred_avg = (
                    predicted_init.get("avg_hours")
                    if isinstance(predicted_init, dict) else None
                )
            except Exception:
                pred_avg = None

            synthetic_visits: dict = {}
            for vid, vdf in enriched_visits.items():
                if vdf is None or vdf.empty:
                    continue
                n_units       = len(vdf)
                synthetic_stay = pred_avg if pred_avg else max(8.0, n_units / 25.0)
                synthetic_visits[str(vid)] = synthetic_stay

            if not synthetic_visits:
                return {"error": "No valid visit data found", "vessel": vessel_service}

            vals = list(synthetic_visits.values())
            actual_raw = {
                "visits":    synthetic_visits,
                "avg_hours": round(sum(vals) / len(vals), 2),
                "max_hours": round(max(vals), 2),
                "min_hours": round(min(vals), 2),
            }
        else:
            return {"error": "No valid visit data found", "vessel": vessel_service}

    # ── Predict stay duration ────────────────────────────────────────────────
    try:
        if (
            loaded_override is not None
            or discharged_override is not None
            or crane_count_override is not None
        ):
            total_loaded     = loaded_override     if loaded_override     is not None else 0
            total_discharged = discharged_override if discharged_override is not None else 0

            from models.stay_model import predict_stay_duration_from_metrics
            p_res  = predict_stay_duration_from_metrics(
                total_loaded, total_discharged,
                crane_count_override=crane_count_override,
                historical_crane_avg=historical_crane_avg,
                historical_mph_avg=historical_mph_avg,
            )
            p_stay = (
                p_res.get("predicted", {}).get("avg_hours")
                if isinstance(p_res, dict) else p_res
            )
            predicted = {"avg_hours": p_stay, "visits": 1, "source": "metric_override"}
        else:
            predicted = predict_vessel_stay_duration(
                prepared_visits,
                crane_count_override=historical_crane_avg or None,
                mph_override=historical_mph_avg or None,
                feature_template=feature_template,
            )
    except Exception:
        predicted = None

    # ── Build merged visit details ───────────────────────────────────────────
    visit_details  = _visit_details(enriched_visits)
    merged_visits: dict = {}
    for vid, stay in actual_raw.get("visits", {}).items():
        details = visit_details.get(str(vid), {})
        merged_visits[str(vid)] = {
            "stay_hours":             round(stay, 2),
            "start_time":             details.get("start_time"),
            "end_time":               details.get("end_time"),
            "loaded_containers":      details.get("loaded_containers", 0),
            "discharged_containers":  details.get("discharged_containers", 0),
            "move_start":             details.get("move_start"),
            "move_end":               details.get("move_end"),
            "total_units":            details.get("total_units", 0),
            "restow_count":           details.get("restow_count", 0),
            "crane_mphc":             details.get("crane_mphc", 0.0),
            "avg_weight_kg":          details.get("avg_weight_kg", 0.0),
            "freight_kind_breakdown": details.get("freight_kind_breakdown", {}),
            "port_of_discharge_top5": details.get("port_of_discharge_top5", {}),
            "crane_exclude_ratio":    details.get("crane_exclude_ratio", 0.0),
        }

    actual = {
        "visits":    merged_visits,
        "avg_hours": actual_raw.get("avg_hours"),
        "max_hours": actual_raw.get("max_hours"),
        "min_hours": actual_raw.get("min_hours"),
    }

    # ── Pick busiest visit ───────────────────────────────────────────────────
    visit_scores: list[tuple] = []
    for vid, vdf in enriched_visits.items():
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
    visit_df     = enriched_visits[top_visit_id]

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

    crane_df_top = _fetch_crane_for_visit(str(top_visit_id))
    crane_ids: list[str] = []
    if not crane_df_top.empty:
        crane_ids = crane_df_top["crane_id"].dropna().unique().tolist()
        if total_loaded == 0:
            total_loaded = int(crane_df_top[
                crane_df_top.apply(
                    lambda r: (
                        not is_vessel_pos(str(r.get("crane_from", "")))
                        and is_vessel_pos(str(r.get("crane_to", "")))
                    ),
                    axis=1,
                )
            ]["unit_id"].nunique())
        if total_discharged == 0:
            total_discharged = int(crane_df_top[
                crane_df_top.apply(
                    lambda r: (
                        is_vessel_pos(str(r.get("crane_from", "")))
                        and not is_vessel_pos(str(r.get("crane_to", "")))
                    ),
                    axis=1,
                )
            ]["unit_id"].nunique())

    hazardous   = int(visit_df["hazardous_flag"].apply(_is_yes).sum()) if "hazardous_flag" in visit_df.columns else 0
    reefer      = int(visit_df["reefer"].apply(_is_yes).sum())          if "reefer"         in visit_df.columns else 0
    oog         = int(visit_df["oog_unit"].apply(_is_yes).sum())        if "oog_unit"       in visit_df.columns else 0
    total_units = int(visit_df["unit_id"].nunique())                    if "unit_id"        in visit_df.columns else 0

    avg_hours = actual.get("avg_hours") or 0

    berth_analysis, berth_rec, berth_conflicts = _build_berth_tables(
        visit_df=visit_df,
        total_loaded=total_loaded,
        total_discharged=total_discharged,
        avg_hours=avg_hours,
        historical_crane_avg=historical_crane_avg,
    )

    from config import settings
    top_visit_stats_merged = actual.get("visits", {}).get(str(top_visit_id), {})
    exclude_ratio = top_visit_stats_merged.get("crane_exclude_ratio", 0.0)
    restow_count  = top_visit_stats_merged.get("restow_count", 0)

    risks: list[str] = []
    if total_loaded > settings.RISK_HIGH_LOAD_THRESHOLD:
        risks.append("High loading volume — potential crane congestion.")
    if hazardous > settings.RISK_HAZARDOUS_THRESHOLD:
        risks.append("Hazardous cargo present — requires safety buffer.")
    if reefer > settings.RISK_REEFER_THRESHOLD:
        risks.append("High reefer concentration — ensure power point allocation.")
    if avg_hours > settings.RISK_EXTENDED_STAY_HOURS:
        risks.append("Extended vessel stay — possible inefficiency.")
    if exclude_ratio > 0.05:
        risks.append(
            f"High anomaly rate in crane movements ({exclude_ratio * 100:.1f}% excluded)."
        )
    if restow_count > 20:
        risks.append(
            f"High restow count ({restow_count}) indicates suboptimal stowage planning."
        )
    if not risks:
        risks.append("Operations appear stable.")

    steps: list[str] = []
    if berth_rec:
        steps.append(
            f"Prioritise berth {berth_rec['berth']} — "
            f"{berth_rec.get('recommendation_reason', '')}"
        )
    else:
        steps.append("Allocate cranes based on cargo concentration.")
    if crane_ids:
        steps.append(
            f"Assign {len(crane_ids)} cranes: {', '.join(crane_ids[:4])} confirmed operational."
        )
    steps.append("Separate hazardous and reefer flows.")

    predicted_avg_hours = (
        predicted.get("avg_hours")
        if isinstance(predicted, dict)
        else actual.get("avg_hours", 0)
    )

    if loaded_override is not None:
        total_loaded = loaded_override
    if discharged_override is not None:
        total_discharged = discharged_override

    op_preds = _predict_operational_metrics(
        visit_df,
        crane_df_top,
        predicted_avg_hours,
        loaded=total_loaded,
        discharged=total_discharged,
        crane_count_override=crane_count_override,
        historical_crane_avg=historical_crane_avg,
        historical_mph_avg=historical_mph_avg,
    )
    delay_analysis = _calculate_delay_analysis(visit_df, crane_df_top) if actual else None

    # ── Per-visit crane assignment summary ───────────────────────────────────
    crane_assignment: list[dict] = []
    for vid, vdf in enriched_visits.items():
        if vdf is None or vdf.empty:
            continue

        def _cv(col, _vdf=vdf):
            if col in _vdf.columns and not _vdf[col].isna().all():
                return float(_vdf[col].iloc[0])
            return 0.0

        v_details    = visit_details.get(str(vid), {})
        entry_loaded = v_details.get("loaded_containers", 0)
        entry_disc   = v_details.get("discharged_containers", 0)
        if is_current_mode:
            if loaded_override is not None:
                entry_loaded = loaded_override
            if discharged_override is not None:
                entry_disc = discharged_override

        crane_assignment.append({
            "visit_id":       str(vid),
            "vessel_service": vessel_service,
            "crane_count":    int(_cv("_crane_count")),
            "crane_ids":      vdf["_crane_ids"].iloc[0] if "_crane_ids" in vdf.columns else "[]",
            "crane_mphc":     round(_cv("_crane_mphc"), 2),
            "duration_hours": round(_cv("_crane_duration_hours"), 2),
            "loaded":         entry_loaded,
            "discharged":     entry_disc,
            "total_units":    v_details.get("total_units", 0),
        })
    crane_assignment.sort(key=lambda x: x["total_units"], reverse=True)

    final_berth_analysis = berth_analysis
    final_berth_rec      = berth_rec
    final_berth_conflict = berth_conflicts

    if not final_berth_analysis and op_preds and "berth_analysis" in op_preds:
        final_berth_analysis = op_preds["berth_analysis"]
        if final_berth_analysis:
            final_berth_rec = dict(final_berth_analysis[0])

    return {
        "mode":                    "vessel",
        "operational_predictions": op_preds,
        "delay_analysis":          delay_analysis,
        "vessel":                  vessel_service,
        "actual":                  actual,
        "predicted":               predicted,
        "risks":                   risks,
        "execution_plan":          steps,
        "berth_analysis":          final_berth_analysis,
        "berth_impact_table":      final_berth_analysis,
        "berth_recommendation":    final_berth_rec,
        "berth_conflict_table":    final_berth_conflict,
        "berth_conflicts":         final_berth_conflict,
        "crane_assignment":        crane_assignment,
        "top_visit_stats": {
            "loaded":                 total_loaded,
            "discharged":             total_discharged,
            "hazardous":              hazardous,
            "reefer":                 reefer,
            "oog":                    oog,
            "total_units":            total_units,
            "crane_count":            len(crane_ids),
            "crane_ids":              crane_ids,
            "crane_mphc":             top_visit_stats_merged.get("crane_mphc", 0.0),
            "avg_weight_kg":          top_visit_stats_merged.get("avg_weight_kg", 0.0),
            "freight_kind_breakdown": top_visit_stats_merged.get("freight_kind_breakdown", {}),
            "port_of_discharge_top5": top_visit_stats_merged.get("port_of_discharge_top5", {}),
        },
    }