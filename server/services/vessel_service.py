import re
import pandas as pd
from collections import defaultdict

from utils.stay_utils import compute_vessel_stay, prepare_visit_data
from models.stay_model import predict_vessel_stay_duration

from utils.extractContainerMoves import extract_container_moves
from utils.classifyWeight import classify_weight
from db.connection import get_engine
from sqlalchemy import text

# Regex for extracting block from container position
FULL_BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\\d+)')

def extract_block(pos: str):
    match = FULL_BLOCK_REGEX.search(str(pos))
    if not match:
        return None
    full = match.group(1)
    return "G" + full[1]

def is_yes(val):
    return str(val).strip().upper() in ("YES", "Y", "1", "TRUE")

def starts_with(series, prefix):
    return series.astype(str).str.strip().str.upper().str.startswith(prefix.upper())

# A position is a vessel slot if it starts with "V-"
def is_vessel_pos(pos):
    return str(pos).strip().upper().startswith("V-")

def classify_move(from_pos, to_pos):
    """
    LOAD  : container moves FROM yard/any TO vessel (V-)
    DISCHARGE: container moves FROM vessel (V-) TO yard/any
    """
    f_vessel = is_vessel_pos(from_pos)
    t_vessel  = is_vessel_pos(to_pos)
    if t_vessel and not f_vessel:
        return "LOAD"
    if f_vessel and not t_vessel:
        return "DISCHARGE"
    return "SHIFT"


def get_visit_details(prepared_visits: dict):
    visits_output = {}
    for visit_id, visit_df in prepared_visits.items():
        if visit_df.empty:
            continue
        start_time = visit_df["event_time"].min()
        end_time   = visit_df["event_time"].max()
        stay_hours = (end_time - start_time).total_seconds() / 3600

        loaded_df    = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position",""), r.get("ctr_to_position","")) == "LOAD", axis=1)]
        discharged_df = visit_df[visit_df.apply(lambda r: classify_move(r.get("ctr_from_position",""), r.get("ctr_to_position","")) == "DISCHARGE", axis=1)]

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
                SELECT unit_id,
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
    # ── Filter for this vessel service ──────────────────────────────────────
    vessel_df = df[
        df["outbound_service"].astype(str).str.strip() == str(vessel_service).strip()
    ].copy()

    if vessel_df.empty:
        return {"error": f"No vessel data for '{vessel_service}'. Check the vessel service ID."}

    # ── Prepare visit data, merging crane timestamps where available ─────────
    prepared_visits = {}
    engine = get_engine()

    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        group = group.copy()

        crane_df = _fetch_crane_for_visit(str(visit_id))
        if not crane_df.empty:
            # Fill missing move_complete_time from crane's time_completed
            group = group.merge(crane_df[["unit_id", "crane_time"]], on="unit_id", how="left")
            group["move_complete_time"] = group["move_complete_time"].fillna(group["crane_time"])
            group.drop(columns=["crane_time"], inplace=True, errors="ignore")

        prepared_visits[visit_id] = prepare_visit_data(group)

    # ── Compute actual stay times ────────────────────────────────────────────
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

    # ── Pick the busiest visit for detailed analysis ─────────────────────────
    visit_scores = []
    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        # count containers that touch a vessel slot (LOAD or DISCHARGE)
        score = group.apply(
            lambda r: classify_move(r.get("ctr_from_position",""), r.get("ctr_to_position","")) in ("LOAD","DISCHARGE"),
            axis=1
        ).sum()
        visit_scores.append((visit_id, score))

    if not visit_scores:
        return {"error": "No visit data found"}

    visit_scores.sort(key=lambda x: x[1], reverse=True)
    top_visit_id = visit_scores[0][0]

    visit_df = prepared_visits.get(top_visit_id)
    if visit_df is None or visit_df.empty:
        visit_df = vessel_df[vessel_df["actual_outbound_carrier_visit_id"] == top_visit_id].copy()
        visit_df = prepare_visit_data(visit_df)

    # ── Load / Discharge counts ──────────────────────────────────────────────
    loaded_mask     = visit_df.apply(lambda r: classify_move(r.get("ctr_from_position",""), r.get("ctr_to_position","")) == "LOAD",      axis=1)
    discharged_mask = visit_df.apply(lambda r: classify_move(r.get("ctr_from_position",""), r.get("ctr_to_position","")) == "DISCHARGE", axis=1)
    loaded_df     = visit_df[loaded_mask]
    discharged_df = visit_df[discharged_mask]
    total_loaded     = len(loaded_df)
    total_discharged = len(discharged_df)

    # Also pull crane summary for this visit
    crane_df_top = _fetch_crane_for_visit(str(top_visit_id))
    crane_loads       = 0
    crane_discharges  = 0
    crane_ids         = []
    if not crane_df_top.empty:
        crane_loads      = (crane_df_top["crane_move_kind"].astype(str).str.upper().str.contains("LOAD|DISCHARGE") == False).sum()
        crane_loads      = crane_df_top[crane_df_top["crane_from"].astype(str).str.upper().str.startswith("V-") == False]["unit_id"].nunique()
        crane_discharges = crane_df_top[crane_df_top["crane_from"].astype(str).str.upper().str.startswith("V-")]["unit_id"].nunique()
        crane_ids        = crane_df_top["crane_id"].dropna().unique().tolist() if "crane_id" in crane_df_top.columns else []

    # Use crane counts to supplement container counts when container data is sparse
    if total_loaded == 0 and crane_loads > 0:
        total_loaded = crane_loads
    if total_discharged == 0 and crane_discharges > 0:
        total_discharged = crane_discharges

    # ── Hazardous / Reefer / OOG flags ──────────────────────────────────────
    hazardous = int(visit_df["hazardous_flag"].apply(is_yes).sum()) if "hazardous_flag" in visit_df.columns else 0
    reefer    = int(visit_df["reefer"].apply(is_yes).sum())         if "reefer"         in visit_df.columns else 0
    oog       = int(visit_df["oog_unit"].apply(is_yes).sum())       if "oog_unit"       in visit_df.columns else 0

    # ── Block / Berth analysis ───────────────────────────────────────────────
    block_counts = defaultdict(int)
    for pos in loaded_df["ctr_from_position"]:
        block = extract_block(str(pos))
        if block:
            block_counts[block] += 1

    # If we got nothing from positions (e.g., numeric slot IDs), count by prefix groups
    if not block_counts:
        for pos in vessel_df["ctr_from_position"].dropna():
            p = str(pos).strip()
            if p.startswith("Y-"):
                # e.g. Y-PEB-3A32285C1 → block group "PEB"
                parts = p.split("-")
                block = parts[1] if len(parts) > 1 else "YARD"
                block_counts[block] += 1
            elif not p.startswith("V-") and p:
                block_counts["YARD"] += 1

    total_blocks   = sum(block_counts.values()) or 1
    sorted_blocks  = sorted(block_counts.items(), key=lambda x: x[1], reverse=True)
    berth_analysis = []
    for block, count in sorted_blocks[:5]:
        pct = (count / total_blocks) * 100
        berth_analysis.append({
            "berth":               f"PEB-{block}",
            "block":               block,
            "cargo_concentration": f"{pct:.1f}%",
            "recommended_cranes":  max(1, round(total_loaded / max(actual.get("avg_hours", 1) or 1, 1) / 25)),
            "total_travel_distance": "Low" if pct > 40 else "Medium" if pct > 20 else "High",
            "congestion_risk":     "High" if pct > 40 else "Medium" if pct > 20 else "Low",
        })

    # ── Yard strategy ────────────────────────────────────────────────────────
    if "verified_gross_mass_kg" in visit_df.columns:
        visit_df["weight_class"] = visit_df["verified_gross_mass_kg"].apply(classify_weight)
        weight_dist = visit_df["weight_class"].value_counts().to_dict()
    else:
        weight_dist = {}

    pod_group = visit_df["port_of_discharge"].value_counts().to_dict() if "port_of_discharge" in visit_df.columns else {}

    total_units = visit_df["unit_id"].nunique()
    move_counts = extract_container_moves(visit_df) if hasattr(visit_df, '__len__') and len(visit_df) > 0 else {}
    avg_moves   = sum(move_counts.values()) / max(total_units, 1)
    reshuffle_risk = "High" if avg_moves > 2 else "Medium" if avg_moves > 1.5 else "Low"

    yard_strategy = {
        "weight_distribution":    weight_dist,
        "top_discharge_ports":    dict(list(pod_group.items())[:5]),
        "avg_moves_per_container": round(avg_moves, 2),
        "reshuffle_risk":         reshuffle_risk,
    }

    # ── Risk assessment ──────────────────────────────────────────────────────
    avg_hours = actual.get("avg_hours") or 0
    risks = []
    if total_loaded > 250:
        risks.append("High loading volume — potential crane congestion.")
    if hazardous > 10:
        risks.append("Hazardous cargo present — requires safety buffer handling.")
    if reefer > 20:
        risks.append("High reefer concentration — ensure power point allocation.")
    if total_discharged > 0:
        ratio = total_loaded / max(total_discharged, 1)
        if ratio > 3:
            risks.append("Load-heavy imbalance — yard congestion likely.")
    if avg_hours > 40:
        risks.append("Extended vessel stay — possible inefficiency.")
    moves_per_hour = total_loaded / max(avg_hours, 1)
    if moves_per_hour < 20 and avg_hours > 0:
        risks.append("Low crane productivity detected.")
    if not risks:
        risks.append("Operations appear stable.")

    # ── Execution plan ───────────────────────────────────────────────────────
    steps = []
    if sorted_blocks:
        steps.append(f"Prioritize loading from block {sorted_blocks[0][0]}.")
    if weight_dist.get("Heavy", 0) > weight_dist.get("Light", 0):
        steps.append("Position heavy containers closer to berth.")
    if len(pod_group) > 1:
        steps.append("Group containers by discharge port.")
    if reshuffle_risk == "High":
        steps.append("High reshuffle risk — pre-consolidate yard stacks.")
    if crane_ids:
        steps.append(f"Assign cranes: {', '.join(crane_ids[:4])} confirmed operational.")
    steps.append("Allocate cranes based on cargo concentration.")
    steps.append("Separate hazardous and reefer flows.")

    return {
        "mode":       "vessel",
        "vessel":     vessel_service,
        "actual":     actual,
        "predicted":  predicted,
        "risks":      risks,
        "execution_plan": steps,
        "berth_analysis": berth_analysis,
        "yard_strategy":  yard_strategy,
        "top_visit_stats": {
            "loaded":      total_loaded,
            "discharged":  total_discharged,
            "hazardous":   hazardous,
            "reefer":      reefer,
            "oog":         oog,
            "total_units": int(total_units),
        },
    }