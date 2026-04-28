import re
from collections import defaultdict
from utils.data_loader import get_data

# Position and block regex
POSITION_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d)(\d{2})(\d{2})(C\d)')
BLOCK_REGEX = re.compile(r'Y-[A-Z0-9]+-(G\d)')

# Check if value is YES
def is_yes(val):
    return str(val).strip().upper() == "YES"


# Get all blocks from the dataframe
def get_all_blocks(df):
    blocks = set()

    # Get all blocks from the dataframe
    for pos in df["Ctr From Position"].dropna():
        pos = str(pos)

        if not pos.startswith("Y-"):
            continue

        match = BLOCK_REGEX.search(pos)
        if match:
            blocks.add(match.group(1))

    return sorted(blocks)
    
# Build layout for the blocks
def build_layout(blocks):
    layout = {}

    if not blocks:
        return layout

    cols = int(len(blocks) ** 0.5) + 1

    # Build layout for the blocks
    for i, block in enumerate(blocks):
        x = i % cols
        y = i // cols
        layout[block] = {"x": x, "y": y}

    return layout

# Get vessel heatmap
def get_vessel_heatmap(vessel_service: str):

    df = get_data()

    # Filter by vessel service
    vessel_df = df[
        df["Outbound Service"].astype(str).str.strip() == str(vessel_service)
    ].copy()

    if vessel_df.empty:
        return {"error": f"No data for vessel {vessel_service}"}
    
    # Get top visit ID
    visit_counts = vessel_df["Actual Outbound Carrier visit ID"].value_counts()
    top_visit_id = visit_counts.index[0]

    # Get top visit data
    visit_df = vessel_df[
        vessel_df["Actual Outbound Carrier visit ID"] == top_visit_id
    ].copy()

    # Filter by yard-to-vessel moves
    visit_df = visit_df[
        visit_df["Ctr From Position"].astype(str).str.startswith("Y-") &
        visit_df["Ctr To Position"].astype(str).str.startswith("V-")
    ]
    
    # Check if there are any yard-to-vessel moves
    if visit_df.empty:
        return {
            "vessel": vessel_service,
            "visit_id": str(top_visit_id),
            "layout": {},
            "blocks": {},
            "summary": {"hazardous": 0, "reefer": 0, "oog": 0},
            "error": "No yard-to-vessel moves"
        }

    # Initialize blocks
    blocks = defaultdict(lambda: {
        "count": 0,
        "hazardous": 0,
        "reefer": 0,
        "oog": 0,
        "cells": {}
    })

    # Process each yard-to-vessel move
    for _, row in visit_df.iterrows():

        pos = str(row.get("Ctr From Position", ""))
        unit = str(row.get("Unit ID"))

        match = POSITION_REGEX.search(pos)
        if not match:
            continue
        
        # Extract block, row, bay, tier
        block = match.group(1)
        row_id = int(match.group(2))
        bay = int(match.group(3))
        tier = match.group(4)
        
        # Create key for row-bay combination
        key = f"{row_id}-{bay}"
        
        # Initialize cell if not exists
        if key not in blocks[block]["cells"]:
            blocks[block]["cells"][key] = {
                "containers": set(),
                "tiers": defaultdict(int)
            }

        blocks[block]["cells"][key]["containers"].add(unit)
        blocks[block]["cells"][key]["tiers"][tier] += 1
        
        # Update special container counts
        if is_yes(row.get("Hazardous Flag")):
            blocks[block]["hazardous"] += 1

        if is_yes(row.get("Reefer")):
            blocks[block]["reefer"] += 1

        if is_yes(row.get("OOG Unit")):
            blocks[block]["oog"] += 1
    
    # Calculate max count
    max_count = 1
    
    # Process each block
    for block in blocks:
        
        total_set = set()
        formatted_cells = []

        # Format cells and calculate statistics
        for key, val in blocks[block]["cells"].items():
            r, b = key.split("-")

            count = len(val["containers"])
            total_set.update(val["containers"])
            
            # Format cells and calculate statistics
            formatted_cells.append({
                "row": int(r),
                "bay": int(b),
                "count": count,
                "tiers": dict(val["tiers"])
            })
        
        # Set the count and cells
        blocks[block]["count"] = len(total_set)
        blocks[block]["cells"] = formatted_cells
        
        max_count = max(max_count, blocks[block]["count"])
        
    # Check if there are any valid container positions
    if not blocks:
        return {
            "vessel": vessel_service,
            "visit_id": str(top_visit_id),
            "layout": {},
            "blocks": {},
            "summary": {"hazardous": 0, "reefer": 0, "oog": 0},
            "error": "No valid container positions found"
        }

    # Calculate intensity and concentration
    for block in blocks:
        
        # Calculate intensity
        intensity = blocks[block]["count"] / max_count
        blocks[block]["intensity"] = round(intensity, 4)
        
        # Set the intensity level
        if intensity >= 0.7:
            level = "High"
        elif intensity >= 0.4:
            level = "Medium"
        else:
            level = "Low"

        blocks[block]["concentration"] = level

    # Get all blocks
    all_blocks = get_all_blocks(df)
    # Build layout
    layout = build_layout(all_blocks)
    # Get max block
    max_block = max(blocks.keys(), key=lambda b: blocks[b]["count"])

    # Calculate total hazardous, reefer, and OOG containers
    total_haz = sum(b["hazardous"] for b in blocks.values())
    total_ref = sum(b["reefer"] for b in blocks.values())
    total_oog = sum(b["oog"] for b in blocks.values())

    # Return the heatmap data
    return {
        "vessel": vessel_service,
        "visit_id": str(top_visit_id),

        "recommended_berth": f"PEB-{max_block}",
        "max_block": max_block,

        "summary": {
            "hazardous": total_haz,
            "reefer": total_ref,
            "oog": total_oog
        },

        "layout": layout,
        "blocks": dict(blocks)
    }