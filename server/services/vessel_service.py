import re
from collections import defaultdict

from utils.data_loader import get_data
from utils.stay_utils import compute_vessel_stay, prepare_visit_data
from models.stay_model import predict_vessel


# =========================================================
# REGEX
# =========================================================
FULL_BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d+)')


def extract_block(pos: str):
    match = FULL_BLOCK_REGEX.search(str(pos))
    if not match:
        return None

    full = match.group(1)
    return "G" + full[1]   # G22606 → G2


def is_yes(val):
    return str(val).strip().upper() == "YES"


def starts_with(series, prefix):
    return series.astype(str).str.strip().str.upper().str.startswith(prefix)


# =========================================================
# 🔥 VISIT DETAILS (FULL DATA)
# =========================================================
def get_visit_details(vessel_df):

    visits_output = {}

    grouped = vessel_df.groupby("Actual Outbound Carrier visit ID")

    for visit_id, group in grouped:

        visit_df = prepare_visit_data(group)

        if visit_df.empty:
            continue

        # -----------------------------
        # TIME
        # -----------------------------
        start_time = visit_df["event_time"].min()
        end_time = visit_df["event_time"].max()
        stay_hours = (end_time - start_time).total_seconds() / 3600

        # -----------------------------
        # LOAD / DISCHARGE
        # -----------------------------
        loaded_df = visit_df[
            starts_with(visit_df["Ctr From Position"], "Y-") &
            starts_with(visit_df["Ctr To Position"], "V-")
        ]

        discharged_df = visit_df[
            starts_with(visit_df["Ctr From Position"], "V-") &
            starts_with(visit_df["Ctr To Position"], "Y-")
        ]

        loaded = len(loaded_df)
        discharged = len(discharged_df)

        # -----------------------------
        # MOVE WINDOW
        # -----------------------------
        move_start = visit_df["Move Complete Time"].min()
        move_end = visit_df["Move Complete Time"].max()

        visits_output[str(visit_id)] = {
            "start_time": str(start_time),
            "end_time": str(end_time),
            "stay_hours": round(stay_hours, 2),
            "loaded_containers": int(loaded),
            "discharged_containers": int(discharged),
            "move_start": str(move_start),
            "move_end": str(move_end)
        }

    return visits_output


# =========================================================
# 🔥 MERGE WITH ACTUAL VISITS (NO DUPLICATE)
# =========================================================
def merge_visit_data(actual_visits, visit_details):

    merged = {}

    for visit_id, stay in actual_visits.items():

        details = visit_details.get(visit_id, {})

        merged[visit_id] = {
            "stay_hours": round(stay, 2),

            "start_time": details.get("start_time"),
            "end_time": details.get("end_time"),

            "loaded_containers": details.get("loaded_containers", 0),
            "discharged_containers": details.get("discharged_containers", 0),

            "move_start": details.get("move_start"),
            "move_end": details.get("move_end")
        }

    return merged


# =========================================================
# MAIN SERVICE
# =========================================================

def analyze_vessel_dashboard(vessel_service: str):

    df = get_data()

    vessel_df = df[
        df["Outbound Service"].astype(str).str.strip() == str(vessel_service)
    ].copy()

    if vessel_df.empty:
        return {"error": f"No vessel data for {vessel_service}"}

    # -----------------------------
    # ACTUAL + PREDICTED
    # -----------------------------
    actual_raw = compute_vessel_stay(df, vessel_service)
    predicted = predict_vessel(df, vessel_service)

    # -----------------------------
    # VISIT DETAILS + MERGE
    # -----------------------------
    visit_details = get_visit_details(vessel_df)

    merged_visits = merge_visit_data(
        actual_raw.get("visits", {}),
        visit_details
    )

    actual = {
        "visits": merged_visits,
        "avg_hours": actual_raw.get("avg_hours"),
    }

    # -----------------------------
    # PICK TOP VISIT (MAX LOAD)
    # -----------------------------
    visit_scores = []

    for visit_id, group in vessel_df.groupby("Actual Outbound Carrier visit ID"):

        loaded = group[
            starts_with(group["Ctr From Position"], "Y-") &
            starts_with(group["Ctr To Position"], "V-")
        ]

        visit_scores.append((visit_id, len(loaded)))

    visit_scores.sort(key=lambda x: x[1], reverse=True)
    top_visit_id = visit_scores[0][0]

    visit_df = vessel_df[
        vessel_df["Actual Outbound Carrier visit ID"] == top_visit_id
    ].copy()

    visit_df = prepare_visit_data(visit_df)

    # -----------------------------
    # LOAD / DISCHARGE (TOP VISIT)
    # -----------------------------
    loaded_df = visit_df[
        starts_with(visit_df["Ctr From Position"], "Y-") &
        starts_with(visit_df["Ctr To Position"], "V-")
    ]

    discharged_df = visit_df[
        starts_with(visit_df["Ctr From Position"], "V-") &
        starts_with(visit_df["Ctr To Position"], "Y-")
    ]

    total_loaded = len(loaded_df)
    total_discharged = len(discharged_df)

    # -----------------------------
    # FLAGS
    # -----------------------------
    hazardous = visit_df["Hazardous Flag"].apply(is_yes).sum()
    reefer = visit_df["Reefer"].apply(is_yes).sum()
    oog = visit_df["OOG Unit"].apply(is_yes).sum()

    # -----------------------------
    # BLOCK AGGREGATION
    # -----------------------------
    block_counts = defaultdict(int)

    for pos in loaded_df["Ctr From Position"]:
        block = extract_block(pos)
        if block:
            block_counts[block] += 1

    total_blocks = sum(block_counts.values()) or 1

    # -----------------------------
    # BERTH ANALYSIS
    # -----------------------------
    berth_analysis = []

    sorted_blocks = sorted(block_counts.items(), key=lambda x: x[1], reverse=True)

    for block, count in sorted_blocks:

        percentage = (count / total_blocks) * 100

        berth_analysis.append({
            "berth": f"PEB-{block}",
            "block": block,
            "cargo_concentration": f"{percentage:.1f}%",
            "total_travel_distance": "Low" if percentage > 40 else "Medium" if percentage > 20 else "High",
            "congestion_risk": "High" if percentage > 40 else "Medium" if percentage > 20 else "Low"
        })

    # -----------------------------
    # RISKS
    # -----------------------------
    risks = []

    if hazardous > 20:
        risks.append("High number of hazardous containers detected — safety protocols required.")

    if reefer > 30:
        risks.append("High reefer load — ensure power points.")

    if oog > 5:
        risks.append("OOG cargo present — special handling needed.")

    if total_loaded > 200:
        risks.append("High loading volume — potential crane congestion.")

    if not risks:
        risks.append("No significant operational risks identified.")

    # -----------------------------
    # EXECUTION PLAN
    # -----------------------------
    steps = []

    if sorted_blocks:
        main_block = sorted_blocks[0][0]
        steps.append(f"Prioritize loading from block {main_block} for faster turnaround.")

    steps.append("Allocate cranes based on cargo concentration.")
    steps.append("Separate hazardous and reefer flows.")
    steps.append("Monitor congestion and adjust yard routing.")

    # -----------------------------
    # FINAL RESPONSE
    # -----------------------------
    return {
        "vessel": vessel_service,
        "visit_id": str(top_visit_id),

        "actual": actual,
        "predicted": predicted,

        "summary": {
            "loaded": int(total_loaded),
            "discharged": int(total_discharged),
            "hazardous": int(hazardous),
            "reefer": int(reefer),
            "oog": int(oog)
        },

        "risks": risks,
        "execution_plan": steps,
        "berth_analysis": berth_analysis
    }