from __future__ import annotations
import logging
from collections import defaultdict
import pandas as pd
from utils.position_parser import (
    block_label,
    parse_position,
)
from services.vessel_service import _extract_move_side, _is_yes

logger = logging.getLogger("port_system")

# find all blocks in the dataframe
def _all_blocks(df: pd.DataFrame) -> list[str]:
    blocks: set[str] = set()
    # check each column for block information
    for col in ("ctr_from_position", "ctr_to_position", "from_position", "to_position"):
        if col not in df.columns:
            continue
        # iterate over each position string in the column
        for pos_str in df[col].dropna():
            p = parse_position(pos_str)
            if p and p["is_yard"]:
                lbl = block_label(p)
                if lbl:
                    blocks.add(lbl)
    return sorted(blocks)

# build layout from blocks
def _build_layout(blocks: list[str]) -> dict:
    if not blocks:
        return {}
    layout = {}
    for b in blocks:
        parts = b.split("-")
        block_part = parts[-1] if parts else b
        prefix = block_part[0] if block_part else "A"
        y = max(0, ord(prefix.upper()) - 65)
        x = abs(hash(b)) % 10
        layout[b] = {"x": x, "y": y}
    return layout

# get vessel heatmap
def get_vessel_heatmap(df: pd.DataFrame, vessel_service: str) -> dict:
    # check dataframe is not empty
    if df is None or df.empty:
        return {"error": f"No data for vessel {vessel_service}", "vessel": vessel_service}
    # check required columns are present
    required = {"outbound_service", "actual_outbound_carrier_visit_id"}
    if not required.issubset(df.columns):
        return {"error": "Missing required columns", "vessel": vessel_service}
    # get vessel data
    vessel_df = df[
        df["outbound_service"].astype(str).str.strip() == str(vessel_service).strip()
    ].copy()
    # check vessel data is not empty
    if vessel_df.empty:
        return {"error": f"No data for vessel {vessel_service}", "vessel": vessel_service}
    # pick busiest visit by LOAD count
    visit_scores: dict = {}
    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        score = sum(
            1 for _, row in group.iterrows()
            if _extract_move_side(row)[0] == "LOAD"
        )
        visit_scores[visit_id] = score
    # check if there are any visits
    if not visit_scores:
        top_visit_id = vessel_df["actual_outbound_carrier_visit_id"].iloc[0]
    else:
        top_visit_id = max(visit_scores, key=visit_scores.get)
    # get visit data
    visit_df = vessel_df[
        vessel_df["actual_outbound_carrier_visit_id"] == top_visit_id
    ].copy()
    # aggregate by block
    blocks_data: dict = defaultdict(lambda: {
        "count": 0, "hazardous": 0, "reefer": 0, "oog": 0, "load_moves": 0, "discharge_moves": 0, "cells": {},
    })
    summary = {"hazardous": 0, "reefer": 0, "oog": 0}
    # iterate over each row in the visit data
    for _, row in visit_df.iterrows():
        row = dict(row)
        move_type, yard_pos = _extract_move_side(row)
        # check if the position is valid
        if yard_pos is None or not yard_pos.get("is_yard"):
            continue
        # process each unit
        unit    = str(row.get("unit_id", ""))
        bk      = block_label(yard_pos) or "UNKNOWN"
        cell_key = f"{yard_pos.get('row','0')}-{yard_pos.get('bay','0')}-{yard_pos.get('tier','1')}"
        # add unit to block data
        b_data = blocks_data[bk]
        if cell_key not in b_data["cells"]:
            b_data["cells"][cell_key] = {
                "containers": set(),
                "tiers":      defaultdict(int),
                "block":      yard_pos.get("block"),
                "terminal":   yard_pos.get("terminal"),
            }
        b_data["cells"][cell_key]["containers"].add(unit)
        b_data["cells"][cell_key]["tiers"][yard_pos.get("tier", "1")] += 1
        
        if move_type == "LOAD":
            b_data["load_moves"] += 1
        elif move_type == "DISCHARGE":
            b_data["discharge_moves"] += 1
            
        # update hazardous, reefer, and oog counts
        if _is_yes(row.get("hazardous_flag")):
            b_data["hazardous"] += 1; summary["hazardous"] += 1
        if _is_yes(row.get("reefer")):
            b_data["reefer"] += 1;    summary["reefer"]    += 1
        if _is_yes(row.get("oog_unit")):
            b_data["oog"] += 1;       summary["oog"]       += 1

    # check if there are any blocks
    if not blocks_data:
        return {
            "error":  "No yard positions found for this visit",
            "vessel": vessel_service,
        }
    
    max_count = 1
    final_blocks: dict = {}
    # process each block
    for bk, info in blocks_data.items():
        total_containers: set = set()
        cells_list: list[dict] = []
        for ck, val in info["cells"].items():
            r, b, t = ck.split("-")
            cnt = len(val["containers"])
            total_containers.update(val["containers"])
            cells_list.append({
                "row": r, "bay": b, "tier": t,
                "count": cnt, "tiers": dict(val["tiers"]),
            })
        info["count"] = len(total_containers)
        info["cells"] = cells_list
        max_count = max(max_count, info["count"])
        final_blocks[bk] = dict(info)
    
    # calculate intensity and concentration for each block
    for b in final_blocks.values():
        intensity = b["count"] / max_count
        b["intensity"]      = round(intensity, 4)
        b["concentration"]  = "High" if intensity >= 0.7 else "Medium" if intensity >= 0.4 else "Low"
    # get all blocks
    all_blocks = _all_blocks(df)
    # build layout
    layout     = _build_layout(all_blocks)
    max_block  = max(final_blocks, key=lambda k: final_blocks[k]["count"])

    return {
        "vessel":             str(vessel_service),
        "visit_id":           str(top_visit_id),
        "recommended_berth":  max_block,
        "berth_recommendation_reason": f"Highest container volume ({final_blocks[max_block]['count']} units).",
        "max_block":          max_block,
        "summary":            summary,
        "cargo_summary":      summary,
        "layout":             layout,
        "blocks":             final_blocks,
    }