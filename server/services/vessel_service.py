import re
import pandas as pd
from collections import defaultdict

from utils.stay_utils import compute_vessel_stay, prepare_visit_data
from models.stay_model import predict_vessel_stay_duration

from utils.extractContainerMoves import extract_container_moves
from utils.classifyWeight import classify_weight
from utils.position_parser import parse_position, is_vessel_pos, is_yard_pos
from db.connection import get_engine
from sqlalchemy import text

def is_yes(val):
    return str(val).strip().upper() in ("YES", "Y", "1", "TRUE")

def classify_move(from_pos, to_pos):
    """
    Categorize move as LOAD, DISCHARGE, or SHIFT.
    LOAD: Yard -> Vessel
    DISCHARGE: Vessel -> Yard
    """
    f_p = parse_position(from_pos)
    t_p = parse_position(to_pos)
    
    if f_p and t_p:
        if f_p["is_yard"] and t_p["is_vessel"]: return "LOAD"
        if f_p["is_vessel"] and t_p["is_yard"]: return "DISCHARGE"
    return "SHIFT"

def get_visit_details(prepared_visits: dict):
    visits_output = {}
    for visit_id, visit_df in prepared_visits.items():
        if visit_df.empty:
            continue
        start_time = visit_df["event_time"].min()
        end_time   = visit_df["event_time"].max()
        stay_hours = (end_time - start_time).total_seconds() / 3600

        loaded_df    = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) == "LOAD", axis=1)]
        discharged_df = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) == "DISCHARGE", axis=1)]

        visits_output[str(visit_id)] = {
            "start_time":             str(start_time),
            "end_time":               str(end_time),
            "stay_hours":             round(stay_hours, 2),
            "loaded_containers":      int(len(loaded_df)),
            "discharged_containers":  int(len(discharged_df)),
            "move_start":             str(visit_df["move_complete_time"].min()),
            "move_end":               str(visit_df["move_complete_time"].max()),
        }
    return visits_output

def merge_visit_data(actual_visits, visit_details):
    merged = {}
    for visit_id, stay in actual_visits.items():
        details = visit_details.get(visit_id, {})
        merged[visit_id] = {
            "stay_hours":             round(stay, 2),
            "start_time":             details.get("start_time"),
            "end_time":               details.get("end_time"),
            "loaded_containers":      details.get("loaded_containers", 0),
            "discharged_containers":  details.get("discharged_containers", 0),
            "move_start":             details.get("move_start"),
            "move_end":               details.get("move_end"),
        }
    return merged

def _fetch_crane_for_visit(visit_id: str) -> pd.DataFrame:
    """Fetch crane movement data for a carrier visit ID."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            df = pd.read_sql_query(text("""
                SELECT unit_id, crane_id,
                       time_completed AS crane_time,
                       from_position  AS crane_from,
                       to_position    AS crane_to,
                       move_kind      AS crane_move_kind
                FROM crane_movements
                WHERE carrier_visit = :v_id
            """), conn, params={"v_id": str(visit_id)})
        if not df.empty:
            df["crane_time"] = pd.to_datetime(df["crane_time"], errors="coerce")
        return df
    except Exception as e:
        print(f"[crane fetch] {visit_id}: {e}")
        return pd.DataFrame()

def analyze_vessel_dashboard(df, vessel_service: str):
    """
    Comprehensive vessel analysis.
    Filters by outbound_service, groups by actual_outbound_carrier_visit_id.
    """
    vessel_df = df[df["outbound_service"].astype(str).str.strip() == str(vessel_service).strip()].copy()
    if vessel_df.empty:
        return {"error": f"No vessel data for '{vessel_service}'", "vessel": vessel_service}

    prepared_visits = {}
    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        group = group.copy()
        crane_df = _fetch_crane_for_visit(str(visit_id))
        if not crane_df.empty:
            # Enrich container data with crane timestamps
            group = group.merge(crane_df[["unit_id", "crane_time"]], on="unit_id", how="left")
            group["move_complete_time"] = group["move_complete_time"].fillna(group["crane_time"])
            group.drop(columns=["crane_time"], inplace=True)
        prepared_visits[visit_id] = prepare_visit_data(group)

    actual_raw  = compute_vessel_stay(prepared_visits)
    predicted   = predict_vessel_stay_duration(prepared_visits)
    visit_details = get_visit_details(prepared_visits)
    merged_visits = merge_visit_data(actual_raw.get("visits", {}), visit_details)

    actual = {
        "visits":    merged_visits,
        "avg_hours": actual_raw.get("avg_hours"),
        "max_hours": actual_raw.get("max_hours"),
        "min_hours": actual_raw.get("min_hours"),
    }

    # Busiest Visit Analysis
    visit_scores = []
    for visit_id, visit_df in prepared_visits.items():
        score = visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) != "SHIFT", axis=1).sum()
        visit_scores.append((visit_id, score))

    if not visit_scores:
        return {"error": "No valid visit data found", "vessel": vessel_service}

    visit_scores.sort(key=lambda x: x[1], reverse=True)
    top_visit_id = visit_scores[0][0]
    visit_df = prepared_visits[top_visit_id]

    # Metrics for Top Visit
    loaded_df     = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) == "LOAD", axis=1)]
    discharged_df = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) == "DISCHARGE", axis=1)]
    
    total_loaded = len(loaded_df)
    total_discharged = len(discharged_df)
    
    # Supplement with crane data if container moves are sparse
    crane_df_top = _fetch_crane_for_visit(str(top_visit_id))
    crane_ids = []
    if not crane_df_top.empty:
        c_loads = crane_df_top[crane_df_top.apply(lambda r: not is_vessel_pos(r["crane_from"]) and is_vessel_pos(r["crane_to"]), axis=1)]["unit_id"].nunique()
        c_discharges = crane_df_top[crane_df_top.apply(lambda r: is_vessel_pos(r["crane_from"]) and not is_vessel_pos(r["crane_to"]), axis=1)]["unit_id"].nunique()
        if total_loaded == 0: total_loaded = c_loads
        if total_discharged == 0: total_discharged = c_discharges
        crane_ids = crane_df_top["crane_id"].dropna().unique().tolist()

    hazardous = int(visit_df["hazardous_flag"].apply(is_yes).sum()) if "hazardous_flag" in visit_df.columns else 0
    reefer    = int(visit_df["reefer"].apply(is_yes).sum()) if "reefer" in visit_df.columns else 0
    oog       = int(visit_df["oog_unit"].apply(is_yes).sum()) if "oog_unit" in visit_df.columns else 0

    # Block Concentration Analysis
    block_counts = defaultdict(int)
    for pos in loaded_df["ctr_from_position"]:
        p = parse_position(pos)
        if p: block_counts[p["block"]] += 1
    
    total_b_moves = sum(block_counts.values()) or 1
    berth_analysis = []
    sorted_blocks = sorted(block_counts.items(), key=lambda x: x[1], reverse=True)
    for block, count in sorted_blocks[:5]:
        pct = (count / total_b_moves) * 100
        berth_analysis.append({
            "berth": f"PEB-{block}", "block": block, "cargo_concentration": f"{pct:.1f}%",
            "recommended_cranes": max(1, round(total_loaded / max(actual.get("avg_hours", 1) or 1, 1) / 25)),
            "total_travel_distance": "Low" if pct > 40 else "Medium" if pct > 20 else "High",
            "congestion_risk": "High" if pct > 40 else "Medium" if pct > 20 else "Low"
        })

    # Strategy & Risks
    avg_hours = actual.get("avg_hours") or 0
    risks = []
    if total_loaded > 250: risks.append("High loading volume — potential crane congestion.")
    if hazardous > 10: risks.append("Hazardous cargo present — requires safety buffer.")
    if reefer > 20: risks.append("High reefer concentration — ensure power point allocation.")
    if avg_hours > 40: risks.append("Extended vessel stay — possible inefficiency.")
    if not risks: risks.append("Operations appear stable.")

    steps = [f"Prioritize loading from block {sorted_blocks[0][0]}." if sorted_blocks else "Allocate cranes based on cargo concentration."]
    if crane_ids: steps.append(f"Assign cranes: {', '.join(crane_ids[:4])} confirmed operational.")
    steps.append("Separate hazardous and reefer flows.")

    return {
        "mode": "vessel", "vessel": vessel_service, "actual": actual, "predicted": predicted,
        "risks": risks, "execution_plan": steps, "berth_analysis": berth_analysis,
        "top_visit_stats": {
            "loaded": total_loaded, "discharged": total_discharged,
            "hazardous": hazardous, "reefer": reefer, "oog": oog,
            "total_units": int(visit_df["unit_id"].nunique())
        }
    }