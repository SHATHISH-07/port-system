from __future__ import annotations
import re
import logging
from collections import defaultdict
import pandas as pd
from utils.position_parser import (
    block_label,
    parse_position,
)
from services.vessel_service import _extract_move_side, _is_yes

logger = logging.getLogger("port_system")


# ─────────────────────────────────────────────────────────────────────────────
# Block helpers
# ─────────────────────────────────────────────────────────────────────────────

def _all_blocks(df: pd.DataFrame) -> list[str]:
    """Collect every unique block label present in any position column."""
    blocks: set[str] = set()
    for col in ("ctr_from_position", "ctr_to_position", "from_position", "to_position"):
        if col not in df.columns:
            continue
        for pos_str in df[col].dropna():
            p = parse_position(pos_str)
            if p and p["is_yard"]:
                lbl = block_label(p)
                if lbl:
                    blocks.add(lbl)
    return sorted(blocks)


def _deterministic_layout(blocks: list[str]) -> dict:
    """
    Build a stable (x, y) grid layout from block labels using the parsed
    position metadata rather than Python's hash().

    Layout rules (same across all process restarts):
    Returns a strict 3-column wrapping grid for blocks to ensure 
    organized visualization without horizontal overflow.
    """
    layout: dict = {}
    if not blocks:
        return layout

    # Sort alphabetically to ensure stable positions
    sorted_blocks = sorted(blocks)
    
    COLS = 3
    for idx, b in enumerate(sorted_blocks):
        x = idx % COLS
        y = idx // COLS
        layout[b] = {"x": x, "y": y}

    return layout


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def get_vessel_heatmap(df: pd.DataFrame, vessel_id: str) -> dict:
    if df is None or df.empty:
        return {"error": f"No data for vessel {vessel_id}", "vessel": vessel_id}

    required = {"outbound_service", "actual_outbound_carrier_visit_id"}
    if not required.issubset(df.columns):
        return {"error": "Missing required columns", "vessel": vessel_id}

    # Normalize searching
    vessel_id_str = str(vessel_id).strip().upper()
    
    # Try multiple common columns for vessel/service identification
    vessel_df = pd.DataFrame()
    for col in ["outbound_service", "inbound_service", "vessel_id"]:
        if col in df.columns:
            matches = df[df[col].astype(str).str.strip().str.upper() == vessel_id_str]
            if not matches.empty:
                vessel_df = matches
                break

    if vessel_df.empty:
        return {"error": f"No data for vessel {vessel_id}", "vessel": vessel_id}

    # Pick busiest visit by LOAD count
    visit_scores: dict = {}
    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        score = sum(
            1 for _, row in group.iterrows()
            if _extract_move_side(row)[0] == "LOAD"
        )
        visit_scores[visit_id] = score

    top_visit_id = (
        max(visit_scores, key=visit_scores.get)
        if visit_scores
        else vessel_df["actual_outbound_carrier_visit_id"].iloc[0]
    )

    visit_df = vessel_df[
        vessel_df["actual_outbound_carrier_visit_id"] == top_visit_id
    ].copy()

    # Aggregate by block
    blocks_data: dict = defaultdict(lambda: {
        "count": 0, "hazardous": 0, "reefer": 0, "oog": 0,
        "load_moves": 0, "discharge_moves": 0, "cells": {},
    })
    summary = {"hazardous": 0, "reefer": 0, "oog": 0}

    for _, row in visit_df.iterrows():
        row = dict(row)
        move_type, yard_pos = _extract_move_side(row)
        if yard_pos is None or not yard_pos.get("is_yard"):
            continue

        unit     = str(row.get("unit_id", ""))
        bk       = block_label(yard_pos) or "UNKNOWN"
        cell_key = (
            f"{yard_pos.get('row','0')}-"
            f"{yard_pos.get('bay','0')}-"
            f"{yard_pos.get('tier','1')}"
        )

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

        if _is_yes(row.get("hazardous_flag")):
            b_data["hazardous"] += 1
            summary["hazardous"] += 1
        if _is_yes(row.get("reefer")):
            b_data["reefer"] += 1
            summary["reefer"] += 1
        if _is_yes(row.get("oog_unit")):
            b_data["oog"] += 1
            summary["oog"] += 1

    if not blocks_data:
        return {"error": "No yard positions found for this visit", "vessel": vessel_id}

    max_count    = 1
    final_blocks: dict = {}

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

    for b in final_blocks.values():
        intensity          = b["count"] / max_count
        b["intensity"]     = round(intensity, 4)
        b["concentration"] = (
            "High"   if intensity >= 0.7
            else "Medium" if intensity >= 0.4
            else "Low"
        )

    # Only include blocks that actually contain containers for this vessel/visit
    relevant_blocks = list(final_blocks.keys())
    layout          = _deterministic_layout(relevant_blocks)

    max_block = max(final_blocks, key=lambda k: final_blocks[k]["count"])

    return {
        "vessel":             vessel_id_str,
        "visit_id":           str(top_visit_id),
        "recommended_berth":  max_block,
        "berth_recommendation_reason": (
            f"Highest container volume ({final_blocks[max_block]['count']} units)."
        ),
        "max_block":     max_block,
        "summary":       summary,
        "cargo_summary": summary,
        "layout":        layout,
        "blocks":        final_blocks,
    }