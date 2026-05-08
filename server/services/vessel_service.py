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
    # fetch crane data for a visit
    try:
        engine = get_engine()
        with engine.connect() as conn:
            # Get all the crane movements for the visit
            df = pd.read_sql_query(
                text("""
                    SELECT
                        unit_id,
                        crane_id,
                        time_completed      AS crane_time,
                        from_position       AS crane_from,
                        to_position         AS crane_to,
                        move_kind           AS crane_move_kind
                    FROM crane_movements
                    WHERE carrier_visit = :v
                """),
                conn,
                params={"v": str(visit_id)},
            )
        # convert crane_time to datetime
        if not df.empty:
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
        }
    return out

# Berth analysis
def _build_berth_tables(
    visit_df: pd.DataFrame,
    total_loaded: int,
    total_discharged: int,
    avg_hours: float,
) -> tuple[list, dict, list]:
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

        rec_cranes = max(1, round(
            max(total_loaded, total_discharged, total) / max(avg_hours or 1, 1) / 20
        ))

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
    return berth_analysis, primary, conflict_table

# Main dashboard entry point
def analyze_vessel_dashboard(df: pd.DataFrame, vessel_service: str) -> dict:
    # check for empty data
    if df is None or df.empty:
        return {"error": "No data available", "vessel": vessel_service}
    
    # check for required columns
    required = {"outbound_service", "actual_outbound_carrier_visit_id"}
    if not required.issubset(df.columns):
        return {"error": "Missing required columns", "vessel": vessel_service}
    # filter for the vessel
    vessel_df = df[
        df["outbound_service"].astype(str).str.strip() == str(vessel_service).strip()
    ].copy()
    # check if vessel data is empty
    if vessel_df.empty:
        return {"error": f"No data for '{vessel_service}'", "vessel": vessel_service}
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
    if not actual_raw:
        return {"error": "No valid visit data found", "vessel": vessel_service}
    
    # predict stay
    try:
        predicted = predict_vessel_stay_duration(prepared_visits)
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
        }

    actual = {
        "visits":    merged_visits,
        "avg_hours": actual_raw.get("avg_hours"),
        "max_hours": actual_raw.get("max_hours"),
        "min_hours": actual_raw.get("min_hours"),
    }

    # pick busiest visit
    visit_scores: list[tuple] = []
    for vid, vdf in enriched_visits.items():
        if vdf is None or vdf.empty:
            continue
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

    # get risks
    risks: list[str] = []
    if total_loaded > 250:
        risks.append("High loading volume — potential crane congestion.")
    if hazardous > 10:
        risks.append("Hazardous cargo present — requires safety buffer.")
    if reefer > 20:
        risks.append("High reefer concentration — ensure power point allocation.")
    if avg_hours > 40:
        risks.append("Extended vessel stay — possible inefficiency.")
    if not risks:
        risks.append("Operations appear stable.")

    # get execution plan
    steps: list[str] = []
    if berth_rec:
        steps.append(
            f"Prioritise berth {berth_rec['berth']} — highest cargo concentration."
        )
    else:
        steps.append("Allocate cranes based on cargo concentration.")
    if crane_ids:
        steps.append(
            f"Assign cranes: {', '.join(crane_ids[:4])} confirmed operational."
        )
    steps.append("Separate hazardous and reefer flows.")

    return {
        "mode":               "vessel",
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
        "top_visit_stats": {
            "loaded":      total_loaded,
            "discharged":  total_discharged,
            "hazardous":   hazardous,
            "reefer":      reefer,
            "oog":         oog,
            "total_units": total_units,
        },
    }