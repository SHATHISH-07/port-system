"""
utils/move_utils.py
-------------------
Container move counting utilities.
"""
from __future__ import annotations

from collections import defaultdict

import pandas as pd

from utils.position_parser import classify_move, safe_get_pos


def _normalize_column_name(name: str) -> str:
    return str(name).strip().lower().replace(" ", "_")


def _get_unit_id(row) -> str | None:
    """Read unit id from any common column name."""
    return safe_get_pos(
        row,
        "unit_id",
        "Unit ID",
        "unit",
        "Unit",
        "unit_nbr",
        "Unit Nbr",
        "unit_number",
        "Unit Number",
    )


def _get_from_position(row) -> str | None:
    return safe_get_pos(
        row,
        "ctr_from_position",
        "Ctr From Position",
        "from_position",
        "From Position",
        "crane_from",
        "Crane From",
        "crane_from_position",
        "Crane From Position",
    )


def _get_to_position(row) -> str | None:
    return safe_get_pos(
        row,
        "ctr_to_position",
        "Ctr To Position",
        "to_position",
        "To Position",
        "crane_to",
        "Crane To",
        "crane_to_position",
        "Crane To Position",
    )


def extract_container_moves(df: pd.DataFrame) -> dict[str, int]:
    """Return the count of valid operational moves per unit id.

    Supports both:
    - lowercase / snake_case columns
    - Title Case columns from the generated CSVs
    - crane-style files using Unit Nbr / From Position / To Position
    """
    move_counts: dict[str, int] = defaultdict(int)

    if df is None or df.empty:
        return dict(move_counts)

    # Optional normalization helper in case callers pass odd column naming.
    # We do not mutate the original dataframe.
    if not isinstance(df, pd.DataFrame):
        return dict(move_counts)

    for _, row in df.iterrows():
        unit_id = _get_unit_id(row)
        if unit_id is None or str(unit_id).strip() == "":
            continue

        from_pos = _get_from_position(row)
        to_pos = _get_to_position(row)

        move_type = classify_move(from_pos, to_pos)
        if move_type == "UNKNOWN":
            continue

        move_counts[str(unit_id).strip()] += 1

    return dict(move_counts)
