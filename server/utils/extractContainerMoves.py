from __future__ import annotations
from collections import defaultdict
import pandas as pd
from utils.position_parser import classify_move, safe_get_pos

# normalize column names
def _normalize_column_name(name: str) -> str:
    return str(name).strip().lower().replace(" ", "_")

# get unit id
def _get_unit_id(row) -> str | None:
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

# get from position
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

# get to position
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

# extract container moves
def extract_container_moves(df: pd.DataFrame) -> dict[str, int]:
    # initialize move counts
    move_counts: dict[str, int] = defaultdict(int)

    # check if df is valid
    if df is None or df.empty:
        return dict(move_counts)

    # return if df is not a dataframe
    if not isinstance(df, pd.DataFrame):
        return dict(move_counts)

    # iterate over rows
    for _, row in df.iterrows():
        # get unit id
        unit_id = _get_unit_id(row)
        if unit_id is None or str(unit_id).strip() == "":
            continue
        
        # get from and to positions
        from_pos = _get_from_position(row)
        to_pos = _get_to_position(row)

        # classify move type
        move_type = classify_move(from_pos, to_pos)
        if move_type == "UNKNOWN":
            continue

        # increment move count for unit id
        move_counts[str(unit_id).strip()] += 1

    # return move counts
    return dict(move_counts)
