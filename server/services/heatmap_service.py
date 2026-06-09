from __future__ import annotations
import logging
import pandas as pd

logger = logging.getLogger("port_system")

def _first_existing_value(row: dict, candidates: list[str]) -> any:
    """
    Returns the first non-empty value found in the row for a given list of candidate columns.
    """
    for col in candidates:
        if col in row and pd.notna(row.get(col)) and str(row.get(col)).strip() != "":
            return row.get(col)
    return None

# Block helpers
from services.xml_layout_service import xml_layout_service

def _deterministic_layout(blocks: list[str]) -> dict:
    """
    Build a layout using the XML service if they are AECY blocks (they start with numbers or DMY/WB etc).
    Fallback to simple grid for PEB/CWIT to not break existing components.
    """
    # Always try XML layout first
    from config import settings
    try:
        return xml_layout_service.get_normalized_layout(blocks, xml_path=settings.TERMINAL_XML_PATH)
    except Exception:
        pass  # Fall through to grid layout
        
    layout: dict = {}
    # Sort alphabetically to ensure stable positions
    sorted_blocks = sorted(blocks)
    
    COLS = 3
    for idx, b in enumerate(sorted_blocks):
        x = idx % COLS
        y = idx // COLS
        layout[b] = {"x": x, "y": y}

    return layout

def calculate_dynamic_proximity(df: pd.DataFrame, block_col: str = "yard_block", weight_col: str = "weight_band") -> dict:
    """
    Dynamically calculates proximity (CLOSE, MID, FAR) for yard blocks.
    It identifies the block with the highest density (especially HEAVY containers)
    as the focal point (max_block), then uses the deterministic grid layout to compute Manhattan distances.
    """
    proximity_map = {}
    if df.empty or block_col not in df.columns:
        return proximity_map

    unique_blocks = df[block_col].dropna().unique().tolist()
    if "UNKNOWN" in unique_blocks:
        unique_blocks.remove("UNKNOWN")

    if not unique_blocks:
        return proximity_map

    # Score blocks by volume and weight (heavy counts double)
    block_scores = {}
    has_weight = weight_col in df.columns
    for blk, grp in df[df[block_col] != "UNKNOWN"].groupby(block_col):
        count = len(grp)
        heavy = (grp[weight_col] == "HEAVY").sum() if has_weight else 0
        block_scores[blk] = count + (heavy * 2)

    max_block = max(block_scores, key=block_scores.get) if block_scores else unique_blocks[0]
    layout = _deterministic_layout(unique_blocks)
    max_pos = layout.get(max_block, {"x": 0, "y": 0})

    distances = {}
    for blk in unique_blocks:
        pos = layout.get(blk, {"x": 0, "y": 0})
        distances[blk] = abs(pos["x"] - max_pos["x"]) + abs(pos["y"] - max_pos["y"])

    if distances:
        min_dist = min(distances.values())
        for blk, dist in distances.items():
            if dist == min_dist:
                proximity_map[blk] = "CLOSE"
            elif dist <= min_dist + 1:
                proximity_map[blk] = "MID"
            else:
                proximity_map[blk] = "FAR"

    return proximity_map