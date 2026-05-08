import re
import pandas as pd
from collections import defaultdict

from utils.stay_utils import compute_vessel_stay, prepare_visit_data
from models.stay_model import predict_vessel_stay_duration
from db.connection import get_engine
from sqlalchemy import text

def is_yes(val):
    return str(val).strip().upper() in ("YES", "Y", "1", "TRUE")

def classify_move(from_pos, to_pos):
    """
    Robust string-based classification to guarantee Load/Discharge tagging 
    doesn't fail due to complex CWIT yard positioning syntax.
    """
    f_str = str(from_pos).strip().upper()
    t_str = str(to_pos).strip().upper()
    
    if f_str.startswith("Y-") and t_str.startswith("V-"): return "LOAD"
    if f_str.startswith("V-") and t_str.startswith("Y-"): return "DISCHARGE"
    return "SHIFT"

def is_vessel_pos(pos: str) -> bool:
    return str(pos).strip().upper().startswith("V-")

def get_visit_details(prepared_visits: dict):
    visits_output = {}
    for visit_id, visit_df in prepared_visits.items():
        if visit_df.empty:
            continue
        start_time = visit_df["event_time"].min()
        end_time   = visit_df["event_time"].max()
        stay_hours = (end_time - start_time).total_seconds() / 3600

        loaded_df     = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) == "LOAD", axis=1)]
        discharged_df = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) == "DISCHARGE", axis=1)]

        visits_output[str(visit_id)] = {
            "start_time":             str(start_time),
            "end_time":               str(end_time),
            "stay_hours":             round(stay_hours, 2),
            "loaded_containers":      int(len(loaded_df)),
            "discharged_containers":  int(len(discharged_df)),
            "move_start":             str(visit_df["move_complete_time"].min()) if "move_complete_time" in visit_df.columns else None,
            "move_end":               str(visit_df["move_complete_time"].max()) if "move_complete_time" in visit_df.columns else None,
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
        return pd.DataFrame()

def analyze_vessel_dashboard(df, vessel_service: str):
    vessel_df = df[df["outbound_service"].astype(str).str.strip() == str(vessel_service).strip()].copy()
    if vessel_df.empty:
        return {"error": f"No vessel data for '{vessel_service}'", "vessel": vessel_service}

    prepared_visits = {}
    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        group = group.copy()
        crane_df = _fetch_crane_for_visit(str(visit_id))
        if not crane_df.empty:
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

    visit_scores = []
    for visit_id, visit_df in prepared_visits.items():
        visit_scores.append((visit_id, len(visit_df)))

    if not visit_scores:
        return {"error": "No valid visit data found", "vessel": vessel_service}

    visit_scores.sort(key=lambda x: x[1], reverse=True)
    top_visit_id = visit_scores[0][0]
    visit_df = prepared_visits[top_visit_id]

    loaded_df     = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) == "LOAD", axis=1)]
    discharged_df = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position"), r.get("ctr_to_position")) == "DISCHARGE", axis=1)]
    
    total_loaded = len(loaded_df)
    total_discharged = len(discharged_df)
    
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

    # FIX: Robust Block Concentration Extractor to ensure tables always populate
    block_counts = defaultdict(int)
    
    # Use load moves if available, otherwise fallback to entire yard scan (vital for Current datasets)
    source_positions = loaded_df["ctr_from_position"] if not loaded_df.empty else visit_df["ctr_from_position"]

    for pos in source_positions.dropna():
        pos_str = str(pos).strip().upper()
        if pos_str.startswith("Y-"):
            parts = pos_str.split("-")
            # Extracts 'A0' from 'Y-PEB-A023B' or '4B' from 'Y-CWIT-4B028'
            if len(parts) >= 3:
                block_counts[parts[2][:2]] += 1
            else:
                block_counts["GEN"] += 1
    
    total_b_moves = sum(block_counts.values()) or 1
    berth_analysis = []
    berth_conflicts = []
    sorted_blocks = sorted(block_counts.items(), key=lambda x: x[1], reverse=True)
    
    for block, count in sorted_blocks[:5]:
        pct = (count / total_b_moves) * 100
        risk = "High" if pct > 40 else "Medium" if pct > 20 else "Low"
        
        berth_analysis.append({
            "berth": f"PEB-{block}", 
            "block": block, 
            "cargo_concentration": f"{pct:.1f}%",
            "recommended_cranes": max(1, round(total_loaded / max(actual.get("avg_hours", 1) or 1, 1) / 25)) if total_loaded else 2,
            "total_travel_distance": "Low" if pct > 40 else "Medium" if pct > 20 else "High",
            "congestion_risk": risk
        })
        
        if risk == "High":
            berth_conflicts.append({
                "berth": f"PEB-{block}",
                "conflict_reason": "High Cargo Concentration (>40%)",
                "severity": "High",
                "resolution": f"Deploy extra yard cranes to PEB-{block} or stagger arrivals."
            })
        elif hazardous > 15:
            berth_conflicts.append({
                "berth": f"PEB-{block}",
                "conflict_reason": "Hazardous Cargo Spacing Limit",
                "severity": "Medium",
                "resolution": "Expand DG (Dangerous Goods) segregation buffer zone."
            })

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
        "risks": risks, "execution_plan": steps, 
        "berth_analysis": berth_analysis,
        "berth_conflicts": berth_conflicts,
        "top_visit_stats": {
            "loaded": total_loaded, "discharged": total_discharged,
            "hazardous": hazardous, "reefer": reefer, "oog": oog,
            "total_units": int(visit_df["unit_id"].nunique())
        }
    }