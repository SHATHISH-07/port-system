from __future__ import annotations
import logging
import re
import pandas as pd
from sqlalchemy import text
from db.connection import get_engine
from utils.datetime_utils import parse_datetime
from config import settings

logger = logging.getLogger("port_system")

def _parse_datetime_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Parses configured date/time columns into standard pandas datetime formats.
    """
    for col in [
        "move_complete_time",
        "time_in",
        "time_out",
        "created_at",
        "updated_at",
        "time_completed",
    ]:
        if col in df.columns:
            df[col] = parse_datetime(df[col], col)
    return df


def _column_exists(conn, table: str, column: str) -> bool:
    """
    Checks if a specific column exists in the database table.
    """
    row = conn.execute(
        text(settings.QUERY_COLUMN_EXISTS),
        {"tbl": table, "col": column},
    ).fetchone()
    return row is not None


def _table_exists(conn, table: str) -> bool:
    """
    Checks if a given table exists in the database.
    """
    row = conn.execute(
        text(settings.QUERY_TABLE_EXISTS),
        {"t": table},
    ).fetchone()
    return row is not None


def _safe_lower(value: str | None) -> str:
    """
    Safely converts a string to lowercase and strips whitespace, handling None.
    """
    return (value or "").lower().strip()


_VALID_YARD = re.compile(r"^[a-z0-9_]{1,30}$")


def _add_index(conn, table: str, index_name: str, columns: str) -> None:
    """
    Adds an index to the specified table if it doesn't already exist.
    """
    try:
        conn.execute(text(settings.QUERY_CREATE_INDEX.format(index_name=index_name, table=table, columns=columns)))
    except Exception as exc:
        logger.debug("Index creation skipped [%s]: %s", index_name, exc)

def ensure_yard_tables(engine, yard_id: str) -> None:
    """
    Per-yard unified 3-table layout:
      vessel_visits       -> per-visit summaries and move completion metrics
      container_operations -> unified movement history and cargo metadata
      crane_operations     -> crane events, assignments, and positions

    Legacy tables (history_core/cargo/position, current_containers,
    crane_core/position/meta) are also maintained for backward compatibility.
    """
    yard_id = _safe_lower(yard_id)
    if not yard_id or not _VALID_YARD.match(yard_id):
        logger.warning("[DB] Invalid yard_id '%s' — skipping table creation", yard_id)
        return

    with engine.begin() as conn:
        try:
            conn.execute(text(settings.QUERY_ENSURE_PGCRYPTO))
        except Exception as exc:
            logger.debug("[DB] pgcrypto extension ensure skipped: %s", exc)

        vv_tbl = f"{yard_id}_vessel_visits"
        conn.execute(text(settings.QUERY_CREATE_VESSEL_VISITS.format(vv_tbl=vv_tbl)))

        co_tbl = f"{yard_id}_container_operations"
        conn.execute(text(settings.QUERY_CREATE_CONTAINER_OPERATIONS.format(co_tbl=co_tbl)))
        try:
            conn.execute(text(settings.QUERY_ADD_RECORD_TYPE_COL.format(co_tbl=co_tbl)))
        except Exception:
            pass
        try:
            conn.execute(text(settings.QUERY_BACKFILL_RECORD_TYPE.format(co_tbl=co_tbl)))
        except Exception:
            pass

        try:
            conn.execute(text(settings.QUERY_CREATE_CO_UNIQUE_INDEX.format(yard_id=yard_id, co_tbl=co_tbl)))
        except Exception:
            pass

        cro_tbl = f"{yard_id}_crane_operations"
        conn.execute(text(settings.QUERY_CREATE_CRANE_OPERATIONS.format(cro_tbl=cro_tbl)))

        new_idx_defs = [
            (vv_tbl,  f"idx_{yard_id}_vv_visit",    "vessel_visit_id"),
            (vv_tbl,  f"idx_{yard_id}_vv_service",  "outbound_service"),
            (co_tbl,  f"idx_{yard_id}_co_visit",    "actual_outbound_carrier_visit_id"),
            (co_tbl,  f"idx_{yard_id}_co_unit",     "unit_id"),
            (co_tbl,  f"idx_{yard_id}_co_service",  "outbound_service"),
            (co_tbl,  f"idx_{yard_id}_co_time",     "time_in DESC"),
            (co_tbl,  f"idx_{yard_id}_co_rectype",  "record_type"),
            (co_tbl,  f"idx_{yard_id}_co_timeout",  "time_out"),
            (cro_tbl, f"idx_{yard_id}_cro_visit",   "carrier_visit"),
            (cro_tbl, f"idx_{yard_id}_cro_crane",   "crane_id, time_completed DESC"),
            (cro_tbl, f"idx_{yard_id}_cro_unit",    "unit_id"),
            (cro_tbl, f"idx_{yard_id}_cro_time",    "time_completed DESC"),
        ]
        for tbl, idx_name, cols in new_idx_defs:
            _add_index(conn, tbl, idx_name, cols)

def init_simplified_schema(engine) -> None:
    """
    Initializes global tables for ingestion management, rejection tracking, 
    and iterates through all yards to ensure their respective schema components exist.
    """
    with engine.begin() as conn:
        try:
            conn.execute(text(settings.QUERY_ENSURE_PGCRYPTO))
        except Exception:
            pass

        conn.execute(text(settings.QUERY_CREATE_INGESTION_LOGS))

        conn.execute(text(settings.QUERY_CREATE_REJECTION_LOGS))

        for col, col_type in [
            ("file_hash", "TEXT"),
            ("records_total", "INTEGER"),
            ("records_accepted", "INTEGER"),
            ("records_rejected", "INTEGER"),
            ("uploaded_by", "INTEGER"),
            ("completed_at", "TIMESTAMP"),
            ("error_summary", "TEXT"),
        ]:
            try:
                conn.execute(text(settings.QUERY_ALTER_ADD_COLUMN.format(table="ingestion_logs", col=col, col_type=col_type)))
            except Exception:
                pass

    try:
        with engine.connect() as conn2:
        
            res = conn2.execute(text(settings.QUERY_DISCOVER_YARDS)).fetchall()

        for r in res:
            yid = r[0]
            if yid:
                ensure_yard_tables(engine, yid)
    except Exception:
        pass


def init_auth_schema(engine) -> None:
    """
    Initializes the database schema for authentication, user management, and audit logging.
    """
    with engine.begin() as conn:
        conn.execute(text(settings.QUERY_CREATE_USERS))
        conn.execute(text(settings.QUERY_CREATE_OP_REQUESTS))
        conn.execute(text(settings.QUERY_CREATE_AUDIT_LOGS))
        try:
            conn.execute(text(settings.QUERY_ALTER_ADD_COLUMN.format(table="audit_logs", col="user_id", col_type="INTEGER")))
        except Exception:
            pass


def init_training_metadata_schema(engine) -> None:
    """
    Initializes the database schema for AI model training metadata, features, and model versions.
    """
    with engine.begin() as conn:
        conn.execute(text(settings.QUERY_CREATE_TRAINING_METADATA))
        conn.execute(text(settings.QUERY_CREATE_FEATURE_CONFIGS))
        conn.execute(text(settings.QUERY_CREATE_MODEL_VERSIONS))
  
        migration_cols = [
            ("model_versions", "tags",         "JSONB    DEFAULT '[]'::JSONB"),
            ("model_versions", "model_binary", "BYTEA"),
            ("model_versions", "promoted_at",  "TIMESTAMP"),
        ]
        for table, col, col_def in migration_cols:
            try:
                conn.execute(text(settings.QUERY_ALTER_ADD_COLUMN.format(table=table, col=col, col_type=col_def)))
            except Exception:
                pass

def _resolve_terminal(yard_id: str | None) -> str:
    """
    Resolves the provided yard ID into a primary terminal identifier (e.g. PEB or CWIT).
    """
    if yard_id:
        y = str(yard_id).upper()
        if "PEB" in y:
            return "PEB"
        if "CWIT" in y:
            return "CWIT"
    return "CWIT"


def load_from_db(
    dataset_type: str,
    vessel_id: str = None,
    full_load: bool = False,
    yard_id: str = None,
    days: int = None,
    crane_id: str = None,
    columns: list[str] = None,
) -> pd.DataFrame:
    """
    Main entry point for loading operational data (crane, current, history) into a DataFrame.
    Automatically discovers and queries the relevant tables based on dataset_type.
    """

    engine = get_engine()
    dataset_type = (dataset_type or "").strip().lower()

    if dataset_type == "crane":
        crane_tables = _discover_tables(engine, "crane_operations", yard_id)
        if crane_tables:
            df = _load_crane_ops(
                engine, crane_tables, vessel_id, full_load, settings,
                days=days, crane_id=crane_id, columns=columns,
            )
            if not df.empty:
                if "exclude" in df.columns:
                    df = df[df["exclude"].astype(str).str.strip() != "Yes"].copy()
                if "time_completed" in df.columns:
                    df["time_completed"] = pd.to_datetime(
                        df["time_completed"], errors="coerce"
                    )
                sort_cols = [c for c in ["crane_id", "carrier_visit", "time_completed"] if c in df.columns]
                if sort_cols:
                    df = df.sort_values(sort_cols).reset_index(drop=True)
            return df
        return pd.DataFrame()

    new_suffix_map = {
        "history":       "container_operations",
        "current":       "container_operations",
        "vessel_visits": "vessel_visits",
        "crane":         "crane_operations",
    }
    new_suffix = new_suffix_map.get(dataset_type)

    if new_suffix:
        new_tables = _discover_tables(engine, new_suffix, yard_id)
        if new_tables:
            if dataset_type == "history":
                return _load_container_ops(engine, new_tables, vessel_id, full_load, settings, record_type="history")
            if dataset_type == "current":
                return _load_current_from_ops(engine, new_tables, vessel_id, settings)
            if dataset_type == "vessel_visits":
                return _load_vessel_visits(engine, new_tables, vessel_id, settings)
            if dataset_type == "crane":
                return _load_crane_ops(engine, new_tables, vessel_id, full_load, settings)

    return pd.DataFrame()


def _discover_tables(engine, suffix: str, yard_id: str | None = None) -> list[str]:
    """Find per-yard tables matching a suffix pattern."""
    with engine.connect() as probe:
        if yard_id:
            tbl_name = f"{yard_id.lower().strip()}_{suffix}"
            if _table_exists(probe, tbl_name):
                return [tbl_name]
            return []
        rows = probe.execute(text(settings.QUERY_DISCOVER_TABLES.format(suffix=suffix))).fetchall()
        return [r[0] for r in rows]


def _load_container_ops(
    engine, tables: list[str], vessel_id: str | None,
    full_load: bool, settings, record_type: str = None,
) -> pd.DataFrame:
    """Load from new unified container_operations tables."""
    dfs: list[pd.DataFrame] = []
    for tbl in tables:
        try:
            filters: list[str] = []
            params: dict = {}

            if vessel_id:
                filters.append(
                    "(actual_outbound_carrier_visit_id = :v_id OR outbound_service = :v_id)"
                )
                params["v_id"] = vessel_id
            elif not full_load and settings.HISTORY_LOAD_WINDOW_DAYS > 0:
                filters.append(
                    f"time_in >= NOW() - INTERVAL '{settings.HISTORY_LOAD_WINDOW_DAYS} days'"
                )

            if record_type:
                filters.append("record_type = :rt")
                params["rt"] = record_type

            q = f"SELECT * FROM {tbl}"
            if filters:
                q += " WHERE " + " AND ".join(filters)
            q += " ORDER BY time_in DESC NULLS LAST"

            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(text(q), conn, params=params)
                if not df_tbl.empty:
                    dfs.append(df_tbl)
        except Exception as e:
            logger.warning("Failed to load from %s: %s", tbl, e)

    if not dfs:
        return pd.DataFrame()

    df = pd.concat(dfs, ignore_index=True)
    for col in settings.EXPECTED_HEADERS.get("history", []):
        if col not in df.columns:
            df[col] = None
    return _parse_datetime_columns(df).copy()


def _load_current_from_ops(
    engine, tables: list[str], vessel_id: str | None, settings,
) -> pd.DataFrame:
    """
    Runtime current-yard extraction: latest yard-side record per unit
    where time_out IS NULL (container has not departed).
    """
    dfs: list[pd.DataFrame] = []
    for tbl in tables:
        try:
            filters: list[str] = ["(time_out IS NULL OR record_type = 'current')"]# FIX: primary yard-presence signal
            params: dict = {}

            if vessel_id:
                filters.append(
                    "(actual_outbound_carrier_visit_id = :v_id OR outbound_service = :v_id)"
                )
                params["v_id"] = vessel_id

            where_sql = "WHERE " + " AND ".join(filters)

            q = f"""
                SELECT DISTINCT ON (unit_id) *
                FROM {tbl}
                {where_sql}
                ORDER BY unit_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
            """

            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(text(q), conn, params=params)
                if not df_tbl.empty:
                    dfs.append(df_tbl)
        except Exception as e:
            logger.warning("Failed to load current from %s: %s", tbl, e)

    if not dfs:
        return pd.DataFrame()

    df = pd.concat(dfs, ignore_index=True)
    for col in settings.EXPECTED_HEADERS.get("current", []):
        if col not in df.columns:
            df[col] = None
    return df.copy()

def _load_crane_ops(
    engine, tables: list[str], vessel_id: str | None,
    full_load: bool, settings,
    days: int = None,
    crane_id: str = None,
    columns: list[str] = None,
) -> pd.DataFrame:
    """Load from new unified crane_operations tables."""
    dfs: list[pd.DataFrame] = []
    for tbl in tables:
        try:
            filters: list[str] = []
            params: dict = {}

            if vessel_id:
                if isinstance(vessel_id, (list, tuple)):
                    filters.append("carrier_visit IN :v_ids")
                    params["v_ids"] = tuple(vessel_id)
                else:
                    filters.append("carrier_visit = :v_id")
                    params["v_id"] = vessel_id

            if days and days > 0:
                cutoff = pd.Timestamp.now() - pd.Timedelta(days=days)
                filters.append("time_completed >= :cutoff")
                params["cutoff"] = cutoff

            if crane_id:
                filters.append("crane_id = :crane_id")
                params["crane_id"] = crane_id

            col_select = ", ".join(columns) if columns else "*"
            q = f"SELECT {col_select} FROM {tbl}"
            if filters:
                q += " WHERE " + " AND ".join(filters)
            q += " ORDER BY time_completed DESC NULLS LAST"

            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(text(q), conn, params=params)
                if not df_tbl.empty:
                    dfs.append(df_tbl)
        except Exception as e:
            logger.warning("Failed to load from %s: %s", tbl, e)

    if not dfs:
        return pd.DataFrame()

    df = pd.concat(dfs, ignore_index=True)
    for col in settings.EXPECTED_HEADERS.get("crane", []):
        if col not in df.columns:
            df[col] = None
    return _parse_datetime_columns(df).copy()


def _load_vessel_visits(
    engine, tables: list[str], vessel_id: str | None, settings,
) -> pd.DataFrame:
    """Load from vessel_visits summary tables."""
    dfs: list[pd.DataFrame] = []
    for tbl in tables:
        try:
            filters: list[str] = []
            params: dict = {}

            if vessel_id:
                filters.append(
                    "(vessel_visit_id = :v_id OR outbound_service = :v_id)"
                )
                params["v_id"] = vessel_id

            q = f"SELECT * FROM {tbl}"
            if filters:
                q += " WHERE " + " AND ".join(filters)
            q += " ORDER BY updated_at DESC NULLS LAST"

            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(text(q), conn, params=params)
                if not df_tbl.empty:
                    dfs.append(df_tbl)
        except Exception as e:
            logger.warning("Failed to load vessel visits from %s: %s", tbl, e)

    if not dfs:
        return pd.DataFrame()
    return pd.concat(dfs, ignore_index=True)


def get_vessel_schedule(engine, vessel_id: str) -> list[str]:
    """Fetch the exact chronological route sequence from the vessel_schedules table."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(settings.QUERY_SELECT_VESSEL_SCHEDULES),
                {"v_id": vessel_id}
            ).fetchall()
            return [r[0] for r in rows]
    except Exception as e:
        logger.error("Failed to load vessel schedule for %s: %s", vessel_id, e)
        return []

def update_vessel_schedule(engine, vessel_id: str, port_rotation: list[str]) -> None:
    """Save a manually applied port sequence to the master vessel_schedules table."""
    try:
        with engine.begin() as conn:
            conn.execute(
                text(settings.QUERY_DELETE_VESSEL_SCHEDULES),
                {"v_id": vessel_id}
            )
            for i, port in enumerate(port_rotation, start=1):
                conn.execute(
                    text(settings.QUERY_INSERT_VESSEL_SCHEDULES),
                    {"v_id": vessel_id, "port": port.upper().strip(), "seq": i}
                )
    except Exception as e:
        logger.error("Failed to save vessel schedule for %s: %s", vessel_id, e)
