import logging
import re
from typing import List, Optional

import pandas as pd
from sqlalchemy import bindparam, text

from db.connection import get_engine
from db.queries import _discover_tables

logger = logging.getLogger("port_system")


def _normalize_column_name(name: str) -> str:
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return re.sub(r"_+", "_", name).strip("_")


def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df.columns = [_normalize_column_name(c) for c in df.columns]
    return df


def lookup_containers_by_ids(container_ids: List[str], yard_id: Optional[str] = None) -> pd.DataFrame:
    """
    Look up full current container records from container_operations tables.
    """
    if not container_ids:
        return pd.DataFrame()

    engine = get_engine()
    tables = _discover_tables(engine, "container_operations", yard_id)

    if not tables:
        logger.warning("No container_operations tables found for yard_id=%s", yard_id)
        return pd.DataFrame()

    unique_ids = list(dict.fromkeys([str(cid).strip() for cid in container_ids if str(cid).strip()]))
    if not unique_ids:
        return pd.DataFrame()

    collected = []

    for tbl in tables:
        try:
            q = text(f"""
                SELECT DISTINCT ON (unit_id) *
                FROM {tbl}
                WHERE unit_id = ANY(:ids)
                ORDER BY unit_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
            """)

            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(q, conn, params={"ids": unique_ids})

            if not df_tbl.empty:
                collected.append(df_tbl)
        except Exception as first_err:
            logger.debug("ANY() lookup failed on %s: %s", tbl, first_err)

            try:
                q_fallback = text(f"""
                    SELECT DISTINCT ON (unit_id) *
                    FROM {tbl}
                    WHERE unit_id IN :ids
                    ORDER BY unit_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                """).bindparams(bindparam("ids", expanding=True))

                with engine.connect() as conn:
                    df_tbl = pd.read_sql_query(q_fallback, conn, params={"ids": tuple(unique_ids)})

                if not df_tbl.empty:
                    collected.append(df_tbl)
            except Exception as second_err:
                logger.warning("Failed to lookup containers in %s: %s", tbl, second_err)

    if not collected:
        return pd.DataFrame()

    df = pd.concat(collected, ignore_index=True)
    df = _normalize_dataframe_columns(df)

    if "updated_at" in df.columns:
        df["updated_at"] = pd.to_datetime(df["updated_at"], errors="coerce")
        df = df.sort_values("updated_at", ascending=False)
    elif "created_at" in df.columns:
        df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
        df = df.sort_values("created_at", ascending=False)

    if "unit_id" in df.columns:
        df = df.drop_duplicates(subset=["unit_id"], keep="first")

    return df.reset_index(drop=True)