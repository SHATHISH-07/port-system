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
        "dispatch_time",
        "arrival_time",
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


_VALID_YARD = re.compile(r"^[a-z0-9_-]{1,30}$")


def _add_index(conn, table: str, index_name: str, columns: str) -> None:
    """
    Adds an index to the specified table if it doesn't already exist.
    """
    try:
        conn.execute(text(settings.QUERY_CREATE_INDEX.format(index_name=index_name, table=table, columns=columns)))
    except Exception as exc:
        logger.debug("Index creation skipped [%s]: %s", index_name, exc)



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

        # Phase 1: Create Global Tables
        conn.execute(text(settings.QUERY_CREATE_GLOBAL_CONTAINERS))
        conn.execute(text(settings.QUERY_CREATE_GLOBAL_CRANES))
        conn.execute(text(settings.QUERY_CREATE_GLOBAL_ITVS))
        conn.execute(text(settings.QUERY_CREATE_CONTAINERS_CURRENT_INDEX))

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

        # Migrate containers table: add columns that may be missing on older DBs
        for col, col_type in [
            ("actual_inbound_carrier_visit_id", "TEXT"),
            ("unit_visit_gkey", "TEXT"),
        ]:
            try:
                conn.execute(text(settings.QUERY_ALTER_ADD_COLUMN.format(table="containers", col=col, col_type=col_type)))
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
    Queries the global tables directly without blindly joining all three.
    """

    engine = get_engine()
    dataset_type = (dataset_type or "").strip().lower()

    if dataset_type == "crane":
        df = _load_crane_ops_global(
            engine, vessel_id, full_load, settings,
            yard_id=yard_id, days=days, crane_id=crane_id, columns=columns,
        )
        if not df.empty:
            if "exclude" in df.columns:
                df = df[df["exclude"].astype(str).str.strip() != "Yes"].copy()
            if "time_completed" in df.columns:
                df["time_completed"] = pd.to_datetime(
                    df["time_completed"], errors="coerce"
                )
            sort_cols = [c for c in ["crane_id", "visit_id", "time_completed"] if c in df.columns]
            if sort_cols:
                df = df.sort_values(sort_cols).reset_index(drop=True)
            # Backward compatibility mapping for service layers expecting 'carrier_visit'
            if "visit_id" in df.columns and "carrier_visit" not in df.columns:
                df["carrier_visit"] = df["visit_id"]
        return df

    if dataset_type == "history":
        return _load_container_ops_global(engine, vessel_id, full_load, settings, yard_id=yard_id)
        
    if dataset_type == "current":
        return _load_current_from_ops_global(engine, vessel_id, settings, yard_id=yard_id)
        
    if dataset_type == "itv":
        df = _load_itv_ops_global(
            engine, vessel_id, full_load, settings,
            yard_id=yard_id, days=days, columns=columns,
        )
        if not df.empty:
            if "arrival_time" in df.columns:
                df["arrival_time"] = pd.to_datetime(
                    df["arrival_time"], errors="coerce"
                )
            sort_cols = [c for c in ["itv_id", "visit_id", "arrival_time"] if c in df.columns]
            if sort_cols:
                df = df.sort_values(sort_cols).reset_index(drop=True)
            # Backward compatibility mapping for service layers expecting 'carrier_visit'
            if "visit_id" in df.columns and "carrier_visit" not in df.columns:
                df["carrier_visit"] = df["visit_id"]
        return df
        


    return pd.DataFrame()





def _load_container_ops_global(
    engine, vessel_id: str | None,
    full_load: bool, settings, yard_id: str = None
) -> pd.DataFrame:
    """Load from new global containers table."""
    try:
        filters: list[str] = []
        params: dict = {}

        if vessel_id:
            filters.append(
                "(visit_id = :v_id OR outbound_service = :v_id)"
            )
            params["v_id"] = vessel_id
        elif not full_load and settings.HISTORY_LOAD_WINDOW_DAYS > 0:
            filters.append(
                f"time_in >= NOW() - INTERVAL '{settings.HISTORY_LOAD_WINDOW_DAYS} days'"
            )

        if yard_id:
            filters.append("yard_id ILIKE :yard_id")
            params["yard_id"] = f"{yard_id}%"

        q = "SELECT * FROM containers"
        if filters:
            q += " WHERE " + " AND ".join(filters)
        q += " ORDER BY time_in DESC NULLS LAST"

        with engine.connect() as conn:
            df = pd.read_sql_query(text(q), conn, params=params)
            
        if df.empty:
            return pd.DataFrame()
            
        for col in settings.EXPECTED_HEADERS.get("history", []):
            if col not in df.columns:
                df[col] = None
                
        # Backward compatibility aliases
        if "actual_outbound_carrier_visit_id" in df.columns:
            df["actual_outbound_carrier_visit_id"] = df["actual_outbound_carrier_visit_id"].fillna(df.get("visit_id"))
        else:
            df["actual_outbound_carrier_visit_id"] = df["visit_id"]
                
        return _parse_datetime_columns(df).copy()
    except Exception as e:
        logger.warning("Failed to load from global containers: %s", e)
        return pd.DataFrame()


def _load_current_from_ops_global(
    engine, vessel_id: str | None, settings, yard_id: str = None
) -> pd.DataFrame:
    """
    Runtime current extraction utilizing partial index on global containers table:
    WHERE time_out IS NULL
    """
    try:
        filters: list[str] = ["time_out IS NULL"]
        params: dict = {}

        if vessel_id:
            filters.append(
                "(visit_id = :v_id OR outbound_service = :v_id)"
            )
            params["v_id"] = vessel_id
            
        if yard_id:
            filters.append("yard_id ILIKE :yard_id")
            params["yard_id"] = f"{yard_id}%"

        where_sql = "WHERE " + " AND ".join(filters)
        q = f"""
            SELECT DISTINCT ON (unit_id) *
            FROM containers
            {where_sql}
            ORDER BY unit_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        """

        with engine.connect() as conn:
            df = pd.read_sql_query(text(q), conn, params=params)
            
        if df.empty:
            return pd.DataFrame()

        for col in settings.EXPECTED_HEADERS.get("current", []):
            if col not in df.columns:
                df[col] = None
                
        # Backward compatibility aliases
        if "actual_outbound_carrier_visit_id" in df.columns:
            df["actual_outbound_carrier_visit_id"] = df["actual_outbound_carrier_visit_id"].fillna(df.get("visit_id"))
        else:
            df["actual_outbound_carrier_visit_id"] = df["visit_id"]
                
        return df.copy()
    except Exception as e:
        logger.warning("Failed to load current from global containers: %s", e)
        return pd.DataFrame()


def _load_crane_ops_global(
    engine, vessel_id: str | None,
    full_load: bool, settings,
    yard_id: str = None,
    days: int = None,
    crane_id: str = None,
    columns: list[str] = None,
) -> pd.DataFrame:
    """Load from new global cranes table."""
    try:
        filters: list[str] = []
        params: dict = {}

        if vessel_id:
            if isinstance(vessel_id, (list, tuple)):
                filters.append("visit_id = ANY(:v_ids)")
                params["v_ids"] = list(vessel_id)
            else:
                filters.append("visit_id = :v_id")
                params["v_id"] = vessel_id

        if yard_id:
            filters.append("yard_id ILIKE :yard_id")
            params["yard_id"] = f"{yard_id}%"

        if days and days > 0:
            cutoff = pd.Timestamp.now() - pd.Timedelta(days=days)
            filters.append("time_completed >= :cutoff")
            params["cutoff"] = cutoff

        if crane_id:
            filters.append("crane_id = :crane_id")
            params["crane_id"] = crane_id

        col_select = ", ".join(columns) if columns else "*"
        q = f"SELECT {col_select} FROM cranes"
        if filters:
            q += " WHERE " + " AND ".join(filters)
        q += " ORDER BY time_completed DESC NULLS LAST"

        with engine.connect() as conn:
            df = pd.read_sql_query(text(q), conn, params=params)
            
        if df.empty:
            return pd.DataFrame()

        for col in settings.EXPECTED_HEADERS.get("crane", []):
            if col not in df.columns:
                df[col] = None
                
        # Backward compatibility aliases
        if "visit_id" in df.columns:
            df["carrier_visit"] = df["visit_id"]
                
        return _parse_datetime_columns(df).copy()
    except Exception as e:
        logger.warning("Failed to load from global cranes: %s", e)
        return pd.DataFrame()


def _load_itv_ops_global(
    engine, vessel_id: str | None,
    full_load: bool, settings,
    yard_id: str = None,
    days: int = None,
    columns: list[str] = None,
) -> pd.DataFrame:
    """Load from new global itvs table."""
    try:
        filters: list[str] = []
        params: dict = {}

        if vessel_id:
            if isinstance(vessel_id, (list, tuple)):
                filters.append("visit_id = ANY(:v_ids)")
                params["v_ids"] = list(vessel_id)
            else:
                filters.append("visit_id = :v_id")
                params["v_id"] = vessel_id

        if yard_id:
            filters.append("yard_id = :yard_id")
            params["yard_id"] = yard_id

        if days and days > 0:
            cutoff = pd.Timestamp.now() - pd.Timedelta(days=days)
            filters.append("arrival_time >= :cutoff")
            params["cutoff"] = cutoff

        col_select = ", ".join(columns) if columns else "*"
        q = f"SELECT {col_select} FROM itvs"
        if filters:
            q += " WHERE " + " AND ".join(filters)
        q += " ORDER BY arrival_time DESC NULLS LAST"

        with engine.connect() as conn:
            df = pd.read_sql_query(text(q), conn, params=params)
            
        if df.empty:
            return pd.DataFrame()

        for col in settings.EXPECTED_HEADERS.get("itv", []):
            if col not in df.columns:
                df[col] = None
                
        # Backward compatibility aliases
        if "carrier_visit" not in df.columns:
            df["carrier_visit"] = df["visit_id"]
                
        return _parse_datetime_columns(df).copy()
    except Exception as e:
        logger.warning("Failed to load from global itvs: %s", e)
        return pd.DataFrame()

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
