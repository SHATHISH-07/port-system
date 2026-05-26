from __future__ import annotations
import logging
import pandas as pd

logger = logging.getLogger("port_system")

def _first_existing_value(row: dict, candidates: list[str]) -> any:
    """
    Executes _first_existing_value logic and processing.
    """
    for col in candidates:
        if col in row and pd.notna(row.get(col)) and str(row.get(col)).strip() != "":
            return row.get(col)
    return None

# Block helpers
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