import logging
import re
from pathlib import Path
from typing import List, Optional

import json
import pandas as pd
from sqlalchemy import bindparam, text

from db.connection import get_engine

logger = logging.getLogger("port_system")

# Directory where active yard JSON/CSV files are stored
_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "source"

# In-memory cache to avoid re-reading the files on every call
_active_yard_cache: dict[str, pd.DataFrame] = {}

def _load_active_yard_df(yard_id: Optional[str] = None) -> pd.DataFrame:
    """
    Load the active yard container data from the JSON files on disk.
    These files are the authoritative source for current container positions.
    Returns a normalised DataFrame with lowercase column names.
    """
    cache_key = (yard_id or "ALL").upper()
    if cache_key in _active_yard_cache:
        return _active_yard_cache[cache_key]

    dfs: list[pd.DataFrame] = []
    patterns = [f"{yard_id}_active_yard_containers.csv"] if yard_id else ["*_active_yard_containers.csv"]

    for pattern in patterns:
        for csv_path in _DATA_DIR.glob(pattern):
            try:
                df = pd.read_csv(csv_path, dtype=str)
                if not df.empty:
                    dfs.append(df)
            except Exception as e:
                logger.debug("Failed to load active yard file %s: %s", csv_path, e)

    if not dfs:
        _active_yard_cache[cache_key] = pd.DataFrame()
        return _active_yard_cache[cache_key]

    combined = pd.concat(dfs, ignore_index=True)
    # Normalise column names to match what the rest of the system expects
    col_map = {
        "Unit ID": "unit_id",
        "Unit Visit Gkey": "unit_visit_gkey",
        "Actual Outbound Carrier visit ID": "actual_outbound_carrier_visit_id",
        "Outbound Service": "outbound_service",
        "Current Yard Block": "current_yard_block",
        "Current Slot Position": "current_position",
        "Move Complete Time": "move_complete_time",
    }
    combined = combined.rename(columns=col_map)
    if "unit_id" in combined.columns:
        combined["unit_id"] = combined["unit_id"].astype(str).str.strip().str.upper()

    _active_yard_cache[cache_key] = combined
    return combined

def _normalize_column_name(name: str) -> str:
    """
    Normalizes a column name by lowercasing, stripping, and replacing special characters.
    """
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return re.sub(r"_+", "_", name).strip("_")

def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalizes all column names in a DataFrame.
    """
    if df.empty:
        return df
    df = df.copy()
    df.columns = [_normalize_column_name(c) for c in df.columns]
    return df

def lookup_containers_by_ids(container_ids: List[str], yard_id: Optional[str] = None) -> pd.DataFrame:
    """
    Look up full current container records for a list of container IDs.

    Strategy:
      1. Check the active yard JSON files first (authoritative current positions).
      2. For containers found in active yard, query DB for full metadata and
         override current_position with the active yard position.
      3. For containers NOT in active yard, fall back to DB DISTINCT ON query
         preferring IN_YARD records.
    """
    if not container_ids:
        return pd.DataFrame()

    unique_ids = list(dict.fromkeys([str(cid).strip().upper() for cid in container_ids if str(cid).strip()]))
    if not unique_ids:
        return pd.DataFrame()

    unique_set = set(unique_ids)

    # ── Step 1: Check active yard files for current positions ─────────────
    active_df = _load_active_yard_df(yard_id)
    active_matches = pd.DataFrame()
    active_position_map: dict[str, str] = {}  # unit_id -> current_position from active yard

    if not active_df.empty and "unit_id" in active_df.columns:
        active_matches = active_df[active_df["unit_id"].isin(unique_set)].copy()
        if not active_matches.empty:
            # De-duplicate (keep first — they're already sorted by most recent)
            active_matches = active_matches.drop_duplicates(subset=["unit_id"], keep="first")
            active_dict = active_matches.set_index("unit_id").to_dict("index")

    # ── Step 2: Query DB for full metadata ────────────────────────────────
    engine = get_engine()

    try:
        q = text("""
            SELECT DISTINCT ON (unit_id) *
            FROM containers
            WHERE unit_id = ANY(:ids)
            ORDER BY unit_id,
                     CASE WHEN visit_state = '3DEPARTED' THEN 1 ELSE 0 END,
                     time_in DESC NULLS LAST,
                     updated_at DESC NULLS LAST,
                     created_at DESC NULLS LAST
        """)
        with engine.connect() as conn:
            df = pd.read_sql_query(q, conn, params={"ids": unique_ids})
    except Exception as first_err:
        logger.debug("ANY() lookup failed on containers: %s", first_err)
        try:
            q_fallback = text("""
                SELECT DISTINCT ON (unit_id) *
                FROM containers
                WHERE unit_id IN :ids
                ORDER BY unit_id,
                         CASE WHEN visit_state = '3DEPARTED' THEN 1 ELSE 0 END,
                         time_in DESC NULLS LAST,
                         updated_at DESC NULLS LAST,
                         created_at DESC NULLS LAST
            """).bindparams(bindparam("ids", expanding=True))
            with engine.connect() as conn:
                df = pd.read_sql_query(q_fallback, conn, params={"ids": tuple(unique_ids)})
        except Exception as second_err:
            logger.warning("Failed to lookup containers: %s", second_err)
            df = pd.DataFrame()

    if df.empty:
        if not active_matches.empty:
            return active_matches.reset_index(drop=True)
        return pd.DataFrame()
    df = _normalize_dataframe_columns(df)

    # Dedup: prefer IN_YARD, then latest
    if "unit_id" in df.columns:
        df["unit_id"] = df["unit_id"].astype(str).str.strip().str.upper()
        df["_departed_rank"] = df["visit_state"].apply(
            lambda v: 1 if str(v).strip() == "3DEPARTED" else 0
        )
        sort_cols = ["_departed_rank"]
        if "time_in" in df.columns:
            df["time_in"] = pd.to_datetime(df["time_in"], errors="coerce")
            sort_cols.append("time_in")
        if "updated_at" in df.columns:
            df["updated_at"] = pd.to_datetime(df["updated_at"], errors="coerce")
            sort_cols.append("updated_at")
        elif "created_at" in df.columns:
            df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
            sort_cols.append("created_at")

        ascending = [True] + [False] * (len(sort_cols) - 1)
        df = df.sort_values(sort_cols, ascending=ascending)
        df = df.drop_duplicates(subset=["unit_id"], keep="first")
        df = df.drop(columns=["_departed_rank"], errors="ignore")

    # ── Step 3: Override positions with active yard truth ──────────────────
    if not active_matches.empty:
        override_cols = ["current_position", "actual_outbound_carrier_visit_id", "outbound_service", "visit_id"]
        for col in override_cols:
            if col in active_matches.columns:
                if col not in df.columns:
                    df[col] = None
                df[col] = df.apply(
                    lambda row: active_dict.get(row["unit_id"], {}).get(col, row[col]),
                    axis=1,
                )
        
        # Also force visit_state to IN_YARD for containers found in active yard
        df.loc[df["unit_id"].isin(active_dict.keys()), "visit_state"] = "IN_YARD"

    return df.reset_index(drop=True)