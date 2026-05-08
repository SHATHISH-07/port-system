import pandas as pd
from collections import defaultdict
from utils.position_parser import parse_position

def is_yes(val):
    return str(val).strip().upper() in ("YES", "Y", "TRUE", "1")

def get_all_blocks(df):
    """Scan all unique block names in the yard from positions."""
    blocks = set()
    for col in ["ctr_from_position", "ctr_to_position"]:
        if col in df.columns:
            for pos_str in df[col].dropna():
                p = parse_position(pos_str)
                if p and p["is_yard"]:
                    blocks.add(p["block"])
    return sorted(list(blocks))

def build_layout(blocks):
    """Build a simple grid layout for blocks."""
    layout = {}
    if not blocks:
        return layout
    cols = int(len(blocks) ** 0.5) + 1
    for i, block in enumerate(blocks):
        layout[block] = {"x": i % cols, "y": i // cols}
    return layout

def get_vessel_heatmap(df, vessel_service: str):
    """
    Generate heatmap data for a vessel service.
    Filters by outbound_service, groups by visit, and analyzes the busiest visit.
    """
    vessel_df = df[df["outbound_service"].astype(str).str.strip() == str(vessel_service).strip()].copy()
    if vessel_df.empty:
        return {"error": f"No data for vessel {vessel_service}", "vessel": vessel_service}

    # Identify the busiest visit (most yard-to-vessel moves)
    visit_scores = {}
    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        score = 0
        for _, row in group.iterrows():
            f_p = parse_position(row.get("ctr_from_position"))
            t_p = parse_position(row.get("ctr_to_position"))
            if f_p and t_p and f_p["is_yard"] and t_p["is_vessel"]:
                score += 1
        visit_scores[visit_id] = score

    if not visit_scores:
        top_visit_id = vessel_df["actual_outbound_carrier_visit_id"].iloc[0]
    else:
        top_visit_id = max(visit_scores, key=visit_scores.get)

    visit_df = vessel_df[vessel_df["actual_outbound_carrier_visit_id"] == top_visit_id].copy()

    # Initialize heatmap data structures
    blocks_data = defaultdict(lambda: {
        "count": 0, "hazardous": 0, "reefer": 0, "oog": 0, "cells": {}
    })
    
    summary = {"hazardous": 0, "reefer": 0, "oog": 0}

    # Process moves
    for _, row in visit_df.iterrows():
        f_p = parse_position(row.get("ctr_from_position"))
        t_p = parse_position(row.get("ctr_to_position"))
        
        # PRIMARY: Yard -> Vessel (Loads)
        is_load = f_p and t_p and f_p["is_yard"] and t_p["is_vessel"]
        # FALLBACK: If both are yard, but it's a vessel row, treat From as source
        is_fallback = not is_load and f_p and f_p["is_yard"]
        
        if not (is_load or is_fallback):
            continue
            
        unit = str(row.get("unit_id"))
        block = f_p["block"]
        cell_key = f"{f_p['row']}-{f_p['bay']}"
        
        b_data = blocks_data[block]
        if cell_key not in b_data["cells"]:
            b_data["cells"][cell_key] = {"containers": set(), "tiers": defaultdict(int)}
            
        b_data["cells"][cell_key]["containers"].add(unit)
        b_data["cells"][cell_key]["tiers"][f_p["tier"]] += 1
        
        if is_yes(row.get("hazardous_flag")):
            b_data["hazardous"] += 1
            summary["hazardous"] += 1
        if is_yes(row.get("reefer")):
            b_data["reefer"] += 1
            summary["reefer"] += 1
        if is_yes(row.get("oog_unit")):
            b_data["oog"] += 1
            summary["oog"] += 1

    # Format output
    max_count = 1
    final_blocks = {}
    for block, b_info in blocks_data.items():
        total_set = set()
        cells_list = []
        for key, val in b_info["cells"].items():
            r, b = key.split("-")
            cnt = len(val["containers"])
            total_set.update(val["containers"])
            cells_list.append({"row": r, "bay": b, "count": cnt, "tiers": dict(val["tiers"])})
        
        b_info["count"] = len(total_set)
        b_info["cells"] = cells_list
        max_count = max(max_count, b_info["count"])
        final_blocks[block] = dict(b_info)

    if not final_blocks:
        return {"error": "No yard positions found for this visit", "vessel": vessel_service}

    for b in final_blocks.values():
        intensity = b["count"] / max_count
        b["intensity"] = round(intensity, 4)
        b["concentration"] = "High" if intensity >= 0.7 else "Medium" if intensity >= 0.4 else "Low"

    all_blocks = get_all_blocks(df)
    layout = build_layout(all_blocks)
    
    max_block = max(final_blocks.keys(), key=lambda k: final_blocks[k]["count"])

    return {
        "vessel": str(vessel_service),
        "visit_id": str(top_visit_id),
        "recommended_berth": f"PEB-{max_block}",
        "max_block": max_block,
        "summary": summary,
        "layout": layout,
        "blocks": final_blocks
    }