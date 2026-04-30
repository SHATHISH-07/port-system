import re
from collections import defaultdict

from utils.stay_utils import compute_vessel_stay, prepare_visit_data
from models.stay_model import predict_vessel

from utils.extractContainerMoves import extract_container_moves
from utils.classifyWeight import classify_weight

# Regex for extracting block from container position
FULL_BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d+)')

# Function to extract block from container position
def extract_block(pos: str):
    match = FULL_BLOCK_REGEX.search(str(pos))
    if not match:
        return None

    full = match.group(1)
    return "G" + full[1]

# Function to check if value is yes
def is_yes(val):
    return str(val).strip().upper() == "YES"

# Function to check if value starts with prefix
def starts_with(series, prefix):
    return series.astype(str).str.strip().str.upper().str.startswith(prefix)

# Function to get visit details
def get_visit_details(prepared_visits: dict):

    visits_output = {}
    # Iterate through each group
    for visit_id, visit_df in prepared_visits.items():

        if visit_df.empty:
            continue
        # Calculate stay hours
        start_time = visit_df["event_time"].min()
        end_time = visit_df["event_time"].max()
        stay_hours = (end_time - start_time).total_seconds() / 3600
        
        # Get loaded and discharged containers
        loaded_df = visit_df[
            starts_with(visit_df["Ctr From Position"], "Y-") &
            starts_with(visit_df["Ctr To Position"], "V-")
        ]

        discharged_df = visit_df[
            starts_with(visit_df["Ctr From Position"], "V-") &
            starts_with(visit_df["Ctr To Position"], "Y-")
        ]

        # Store visit details
        visits_output[str(visit_id)] = {
            "start_time": str(start_time),
            "end_time": str(end_time),
            "stay_hours": round(stay_hours, 2),
            "loaded_containers": int(len(loaded_df)),
            "discharged_containers": int(len(discharged_df)),
            "move_start": str(visit_df["Move Complete Time"].min()),
            "move_end": str(visit_df["Move Complete Time"].max())
        }

    return visits_output

# Function to merge visit data
def merge_visit_data(actual_visits, visit_details):

    merged = {}
    # Iterate through each visit
    for visit_id, stay in actual_visits.items():
        # Get visit details
        details = visit_details.get(visit_id, {})
        # Store visit details
        merged[visit_id] = {
            "stay_hours": round(stay, 2),
            "start_time": details.get("start_time"),
            "end_time": details.get("end_time"),
            "loaded_containers": details.get("loaded_containers", 0),
            "discharged_containers": details.get("discharged_containers", 0),
            "move_start": details.get("move_start"),
            "move_end": details.get("move_end")
        }
    # Return merged visit data
    return merged

# Function to analyze vessel dashboard
def analyze_vessel_dashboard(df, vessel_service: str):
    # Filter data for vessel service
    vessel_df = df[
        df["Outbound Service"].astype(str).str.strip() == str(vessel_service)
    ].copy()
    # Check if vessel data is empty
    if vessel_df.empty:
        return {"error": f"No vessel data for {vessel_service}"}

    # Prepare visit data exactly once to avoid redundant computations
    prepared_visits = {}
    for visit_id, group in vessel_df.groupby("Actual Outbound Carrier visit ID"):
        prepared_visits[visit_id] = prepare_visit_data(group)

    # Compute vessel stay
    actual_raw = compute_vessel_stay(prepared_visits)
    # Predict vessel
    predicted = predict_vessel(prepared_visits)

    # Get visit details
    visit_details = get_visit_details(prepared_visits)
    # Merge visit data
    merged_visits = merge_visit_data(
        actual_raw.get("visits", {}),
        visit_details
    )
    # Create actual data
    actual = {
        "visits": merged_visits,
        "avg_hours": actual_raw.get("avg_hours"),
    }
    # Get visit scores
    visit_scores = []
    # Group by visit ID
    for visit_id, group in vessel_df.groupby("Actual Outbound Carrier visit ID"):
        # Get loaded containers
        loaded = group[
            starts_with(group["Ctr From Position"], "Y-") &
            starts_with(group["Ctr To Position"], "V-")
        ]
        # Append visit ID and loaded containers
        visit_scores.append((visit_id, len(loaded)))
    # Sort visit scores
    visit_scores.sort(key=lambda x: x[1], reverse=True)
    # Get top visit ID
    top_visit_id = visit_scores[0][0]
    
    # Use precomputed prepared visit data
    visit_df = prepared_visits.get(top_visit_id)
    if visit_df is None or visit_df.empty:
        # Fallback if somehow not prepared
        visit_df = vessel_df[
            vessel_df["Actual Outbound Carrier visit ID"] == top_visit_id
        ].copy()
        visit_df = prepare_visit_data(visit_df)
    
    # Get loaded containers
    loaded_df = visit_df[
        starts_with(visit_df["Ctr From Position"], "Y-") &
        starts_with(visit_df["Ctr To Position"], "V-")
    ]

    # Get discharged containers
    discharged_df = visit_df[
        starts_with(visit_df["Ctr From Position"], "V-") &
        starts_with(visit_df["Ctr To Position"], "Y-")
    ]
    # Get total loaded and discharged containers
    total_loaded = len(loaded_df)
    total_discharged = len(discharged_df)
    
    # Get hazardous, reefer, and OOG containers
    hazardous = visit_df["Hazardous Flag"].apply(is_yes).sum()
    reefer = visit_df["Reefer"].apply(is_yes).sum()
    oog = visit_df["OOG Unit"].apply(is_yes).sum()

    # Get block counts
    block_counts = defaultdict(int)
    # Iterate through each position
    for pos in loaded_df["Ctr From Position"]:
        # Extract block
        block = extract_block(pos)
        if block:
            block_counts[block] += 1
    # Get total blocks
    total_blocks = sum(block_counts.values()) or 1
    # Create berth analysis
    berth_analysis = []
    # Sort blocks
    sorted_blocks = sorted(block_counts.items(), key=lambda x: x[1], reverse=True)

    for block, count in sorted_blocks:
        percentage = (count / total_blocks) * 100
        # Append block analysis
        berth_analysis.append({
            "berth": f"PEB-{block}",
            "block": block,
            "cargo_concentration": f"{percentage:.1f}%",
            "total_travel_distance": "Low" if percentage > 40 else "Medium" if percentage > 20 else "High",
            "congestion_risk": "High" if percentage > 40 else "Medium" if percentage > 20 else "Low"
        })
    # Classify weight
    visit_df["weight_class"] = visit_df["Verified Gross Mass (Kg)"].apply(classify_weight)
    # Get weight distribution
    weight_dist = visit_df["weight_class"].value_counts().to_dict()
    # Get port of discharge
    pod_group = visit_df["Port of Discharge"].value_counts().to_dict()
    
    # Get move counts
    move_counts = extract_container_moves(visit_df)
    # Get total units
    total_units = visit_df["Unit ID"].nunique()
    # Get average moves
    avg_moves = sum(move_counts.values()) / max(total_units, 1)

    reshuffle_risk = "High" if avg_moves > 2 else "Medium" if avg_moves > 1.5 else "Low"

    # Create yard strategy
    yard_strategy = {
        "weight_distribution": weight_dist,
        "top_discharge_ports": dict(list(pod_group.items())[:5]),
        "avg_moves_per_container": round(avg_moves, 2),
        "reshuffle_risk": reshuffle_risk
    }

    risks = []
    # Check for high loading volume
    if total_loaded > 250:
        risks.append("High loading volume — potential crane congestion.")

    # Check for hazardous cargo
    if hazardous > 10:
        risks.append("Hazardous cargo present — requires safety buffer handling.")

    # Check for reefer concentration
    if reefer > 20:
        risks.append("High reefer concentration — ensure power point allocation.")

    # Check for load-heavy imbalance
    if total_discharged > 0:
        ratio = total_loaded / max(total_discharged, 1)
        if ratio > 3:
            risks.append("Load-heavy imbalance — yard congestion likely.")

    # Check for extended vessel stay
    if actual["avg_hours"] > 40:
        risks.append("Extended vessel stay — possible inefficiency.")

    # Check for low crane productivity
    moves_per_hour = total_loaded / max(actual["avg_hours"], 1)
    if moves_per_hour < 20:
        risks.append("Low crane productivity detected.")

    # If no risks, add stable
    if not risks:
        risks.append("Operations appear stable.")

    steps = []
    # Add steps based on risks
    if sorted_blocks:
        steps.append(f"Prioritize loading from block {sorted_blocks[0][0]}.")
    # Add steps based on weight distribution
    if weight_dist.get("Heavy", 0) > weight_dist.get("Light", 0):
        steps.append("Position heavy containers closer to berth.")
    # Add steps based on port of discharge
    if len(pod_group) > 1:
        steps.append("Group containers by discharge port.")
    # Add steps based on reshuffle risk
    if reshuffle_risk == "High":
        steps.append("High reshuffle risk — pre-consolidate yard stacks.")
    # Add steps based on crane productivity
    steps.append("Allocate cranes based on cargo concentration.")
    # Add steps based on hazardous and reefer cargo
    steps.append("Separate hazardous and reefer flows.")

    # Return response
    return {
        "mode": "vessel",
        "vessel": vessel_service,
        "actual": actual,
        "predicted": predicted,
        "risks": risks,
        "execution_plan": steps,
        "berth_analysis": berth_analysis,
        "yard_strategy": yard_strategy
    }