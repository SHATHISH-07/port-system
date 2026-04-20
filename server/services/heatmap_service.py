import pandas as pd
import re
from utils.data_loader import get_data

def get_vessel_heatmap(vessel_service: str):
    """
    Extracts spatial heatmap data for a given vessel service.
    Takes the visit with the highest container count.
    """
    df = get_data()

    # Filter for vessel
    vessel_df = df[df["Outbound Service"].astype(str).str.strip() == str(vessel_service)].copy()
    if vessel_df.empty:
        return {"error": f"No data found for vessel '{vessel_service}'"}

    # Find the visit with the most containers
    visit_counts = vessel_df["Actual Outbound Carrier visit ID"].value_counts()
    if visit_counts.empty:
        return {"error": "No valid visits found"}
    
    top_visit_id = visit_counts.index[0]
    visit_df = vessel_df[vessel_df["Actual Outbound Carrier visit ID"] == top_visit_id].copy()

    # Initialize stats
    blocks = {}
    total_containers = len(visit_df)
    
    # Flags mapping
    # Hazardous Flag = YES
    # Reefer = YES
    # OOG Unit = YES
    
    def is_flagged(val):
        return str(val).strip().upper() == "YES"

    # Regex to capture G1, G10, G25 etc.
    # Format typically: Y-PEB-G32343C1
    block_regex = re.compile(r'Y-[A-Z0-9]+-(G\d+)')

    for _, row in visit_df.iterrows():
        pos = str(row.get("Ctr From Position", ""))
        
        match = block_regex.search(pos)
        if match:
            block_id = match.group(1) # e.g. "G3"
            
            if block_id not in blocks:
                blocks[block_id] = {
                    "count": 0,
                    "hazardous": 0,
                    "reefer": 0,
                    "oog": 0
                }
                
            blocks[block_id]["count"] += 1
            
            if is_flagged(row.get("Hazardous Flag")):
                blocks[block_id]["hazardous"] += 1
                
            if is_flagged(row.get("Reefer")):
                blocks[block_id]["reefer"] += 1
                
            if is_flagged(row.get("OOG Unit")):
                blocks[block_id]["oog"] += 1

    if not blocks:
        return {"error": "No valid yard positions found for this visit."}

    # Identify recommended berth based on highest container density
    recommended_block = max(blocks.keys(), key=lambda b: blocks[b]["count"])

    # Prepare response
    total_haz = sum(b["hazardous"] for b in blocks.values())
    total_ref = sum(b["reefer"] for b in blocks.values())
    total_oog = sum(b["oog"] for b in blocks.values())

    response = {
        "vessel": vessel_service,
        "visit_id": str(top_visit_id),
        "recommended_berth": f"PEB - {recommended_block}",
        "max_block": recommended_block,
        "summary": {
            "total_containers": total_containers,
            "hazardous": total_haz,
            "reefer": total_ref,
            "oog": total_oog
        },
        "blocks": blocks
    }

    return response
