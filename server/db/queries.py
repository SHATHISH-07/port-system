from __future__ import annotations

import logging
import re

import pandas as pd
from sqlalchemy import text

from db.connection import get_engine
from utils.datetime_utils import parse_datetime

logger = logging.getLogger("port_system")


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_datetime_columns(df: pd.DataFrame) -> pd.DataFrame:
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
    row = conn.execute(
        text("""
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = :tbl
              AND column_name = :col
        """),
        {"tbl": table, "col": column},
    ).fetchone()
    return row is not None


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text("""
            SELECT 1
            FROM pg_class
            WHERE relname = :t
              AND relkind IN ('r', 'p')
        """),
        {"t": table},
    ).fetchone()
    return row is not None


def _safe_lower(value: str | None) -> str:
    return (value or "").lower().strip()


_VALID_YARD = re.compile(r"^[a-z0-9_]{1,30}$")


def _add_index(conn, table: str, index_name: str, columns: str) -> None:
    try:
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({columns});"))
    except Exception as exc:
        logger.debug("Index creation skipped [%s]: %s", index_name, exc)


# ─────────────────────────────────────────────────────────────────────────────
# ensure_yard_tables
# ─────────────────────────────────────────────────────────────────────────────

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
            conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto";'))
        except Exception as exc:
            logger.debug("[DB] pgcrypto extension ensure skipped: %s", exc)

        # ══════════════════════════════════════════════════════════════════════
        # NEW 3-TABLE SCHEMA
        # ══════════════════════════════════════════════════════════════════════

        # ── vessel_visits ────────────────────────────────────────────────────
        vv_tbl = f"{yard_id}_vessel_visits"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {vv_tbl} (
                id                               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                vessel_visit_id                  TEXT        UNIQUE NOT NULL,
                outbound_service                 TEXT,
                total_containers                 INTEGER     DEFAULT 0,
                total_loaded                     INTEGER     DEFAULT 0,
                total_discharged                 INTEGER     DEFAULT 0,
                avg_crane_count                  FLOAT       DEFAULT 0,
                avg_mphc                         FLOAT       DEFAULT 0,
                stay_hours                       FLOAT,
                first_move_time                  TIMESTAMP,
                last_move_time                   TIMESTAMP,
                vessel_arrival                   TIMESTAMP,
                vessel_departure                 TIMESTAMP,
                yard_id                          TEXT,
                ingestion_id                     TEXT,
                created_at                       TIMESTAMP   NOT NULL DEFAULT NOW(),
                updated_at                       TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # ── container_operations ─────────────────────────────────────────────
        co_tbl = f"{yard_id}_container_operations"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {co_tbl} (
                id                               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                unit_id                          TEXT        NOT NULL,
                unit_visit_gkey                  TEXT,
                outbound_service                 TEXT,
                actual_outbound_carrier_visit_id TEXT        NOT NULL,
                inbound_service                  TEXT,
                actual_inbound_carrier_visit_id  TEXT,
                facility_id                      TEXT,
                yard_id                          TEXT,
                complex_id                       TEXT,
                category_id                      TEXT,
                freight_kind                     TEXT,
                arrival_mode                     TEXT,
                visit_state                      TEXT,
                transit_state                    TEXT,
                time_in                          TIMESTAMP   DEFAULT '2020-01-01',
                time_out                         TIMESTAMP,
                move_complete_time               TIMESTAMP,
                equipment_class                  TEXT,
                container_length                 TEXT,
                equipment_type                   TEXT,
                unit_weight_in_kg                FLOAT,
                verified_gross_mass_kg           FLOAT,
                reefer                           TEXT,
                oog_unit                         TEXT,
                hazardous_flag                   TEXT,
                hazard_un_numbers                TEXT,
                imdg_code                        TEXT,
                port_of_discharge                TEXT,
                destination                      TEXT,
                ctr_from_position                TEXT,
                ctr_to_position                  TEXT,
                current_position                 TEXT,
                stow_code_1                      TEXT,
                stow_code_2                      TEXT,
                stow_code_3                      TEXT,
                record_type                      TEXT        DEFAULT 'history',
                ingestion_id                     TEXT,
                created_at                       TIMESTAMP   NOT NULL DEFAULT NOW(),
                updated_at                       TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))
        # Migration: ensure record_type exists and backfill NULL rows
        try:
            conn.execute(text(f"ALTER TABLE {co_tbl} ADD COLUMN IF NOT EXISTS record_type TEXT DEFAULT 'history'"))
        except Exception:
            pass
        try:
            conn.execute(text(f"UPDATE {co_tbl} SET record_type = 'history' WHERE record_type IS NULL"))
        except Exception:
            pass

        # Partial unique index: only enforced for current records (upsert target)
        try:
            conn.execute(text(f"""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_{yard_id}_co_unit_yard_current
                ON {co_tbl} (unit_id, yard_id)
                WHERE record_type = 'current';
            """))
        except Exception:
            pass

        # ── crane_operations ─────────────────────────────────────────────────
        cro_tbl = f"{yard_id}_crane_operations"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {cro_tbl} (
                id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                crane_id       TEXT,
                unit_id        TEXT,
                carrier_visit  TEXT        NOT NULL,
                event_type     TEXT,
                move_kind      TEXT,
                line_op        TEXT,
                unit_category  TEXT,
                exclude        TEXT,
                time_completed TIMESTAMP,
                from_position  TEXT,
                to_position    TEXT,
                yard_id        TEXT,
                ingestion_id   TEXT,
                created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # ── New-schema indexes ───────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
# Support schemas
# ─────────────────────────────────────────────────────────────────────────────

def init_simplified_schema(engine) -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto";'))
        except Exception:
            pass

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ingestion_logs (
                id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
                filename         TEXT,
                file_hash        TEXT,
                dataset_type     TEXT,
                status           TEXT,
                records_total    INTEGER,
                records_accepted INTEGER,
                records_rejected INTEGER,
                uploaded_by      INTEGER,
                completed_at     TIMESTAMP,
                error_summary    TEXT,
                created_at       TIMESTAMP DEFAULT NOW()
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rejection_logs (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                ingestion_id TEXT,
                row_data     TEXT,
                reason       TEXT,
                created_at   TIMESTAMP DEFAULT NOW()
            );
        """))

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
                conn.execute(text(
                    f"ALTER TABLE ingestion_logs ADD COLUMN IF NOT EXISTS {col} {col_type}"
                ))
            except Exception:
                pass

    try:
        with engine.connect() as conn2:
            # Discover yards from both legacy and new tables
            res = conn2.execute(text("""
                SELECT replace(relname, '_container_operations', '') AS yard_prefix
                FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_container_operations'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
                  AND relname != ''
                ORDER BY relname
            """)).fetchall()

        for r in res:
            yid = r[0]
            if yid:
                ensure_yard_tables(engine, yid)
    except Exception:
        pass


def init_auth_schema(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'user',
                is_active     BOOLEAN DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT NOW()
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS operational_requests (
                id              SERIAL PRIMARY KEY,
                type            TEXT NOT NULL,
                status          TEXT DEFAULT 'pending',
                payload         TEXT,
                created_at      TIMESTAMP DEFAULT NOW(),
                created_by_user TEXT
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id        SERIAL PRIMARY KEY,
                action    TEXT NOT NULL,
                details   TEXT,
                username  TEXT,
                user_id   INTEGER,
                timestamp TIMESTAMP DEFAULT NOW()
            );
        """))
        try:
            conn.execute(text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id INTEGER"))
        except Exception:
            pass


def init_training_metadata_schema(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS training_metadata (
                id                      SERIAL PRIMARY KEY,
                dataset_size            INTEGER,
                last_trained_timestamp  TIMESTAMP,
                data_source             TEXT,
                training_type           TEXT,
                status                  TEXT,
                notes                   TEXT,
                created_at              TIMESTAMP DEFAULT NOW(),
                updated_at              TIMESTAMP DEFAULT NOW()
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS feature_configs (
                id            SERIAL PRIMARY KEY,
                name          TEXT UNIQUE,
                description   TEXT,
                feature_names JSONB,
                created_at    TIMESTAMP DEFAULT NOW(),
                updated_at    TIMESTAMP DEFAULT NOW()
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS model_versions (
                id                SERIAL PRIMARY KEY,
                model_name        TEXT,
                version           TEXT UNIQUE,
                artifact_path     TEXT,
                feature_config_id INTEGER REFERENCES feature_configs(id),
                dataset_size      INTEGER,
                metrics           JSONB,
                status            TEXT DEFAULT 'active',
                promoted_at       TIMESTAMP,
                trained_at        TIMESTAMP,
                notes             TEXT,
                created_at        TIMESTAMP DEFAULT NOW(),
                updated_at        TIMESTAMP DEFAULT NOW()
            );
        """))
        # ── Migrations: add columns that may be missing from older deployments ──
        migration_cols = [
            ("model_versions", "tags",         "JSONB    DEFAULT '[]'::JSONB"),
            ("model_versions", "model_binary", "BYTEA"),
            ("model_versions", "promoted_at",  "TIMESTAMP"),
        ]
        for table, col, col_def in migration_cols:
            try:
                conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_def}"
                ))
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Load helpers
# ─────────────────────────────────────────────────────────────────────────────

def load_from_db(
    dataset_type: str,
    vessel_id: str = None,
    full_load: bool = False,
    yard_id: str = None,
    days: int = None,
    crane_id: str = None,
    columns: list[str] = None,
) -> pd.DataFrame:
    from config import settings

    engine = get_engine()
    dataset_type = (dataset_type or "").strip().lower()

    # ── Try new unified tables first ─────────────────────────────────────────
    new_suffix_map = {
        "history":       "container_operations",
        "current":       "container_operations",
        "crane":         "crane_operations",
        "vessel_visits": "vessel_visits",
    }
    new_suffix = new_suffix_map.get(dataset_type)

    if new_suffix:
        new_tables = _discover_tables(engine, new_suffix, yard_id)
        if new_tables:
            if dataset_type == "history":
                return _load_container_ops(engine, new_tables, vessel_id, full_load, settings, record_type="history")
            if dataset_type == "current":
                return _load_current_from_ops(engine, new_tables, vessel_id, settings)
            if dataset_type == "crane":
                return _load_crane_ops(engine, new_tables, vessel_id, full_load, settings, days=days, crane_id=crane_id, columns=columns)
            if dataset_type == "vessel_visits":
                return _load_vessel_visits(engine, new_tables, vessel_id, settings)

    # No legacy fallback — unified tables only
    return pd.DataFrame()


def _discover_tables(engine, suffix: str, yard_id: str | None = None) -> list[str]:
    """Find per-yard tables matching a suffix pattern."""
    with engine.connect() as probe:
        if yard_id:
            tbl_name = f"{yard_id.lower().strip()}_{suffix}"
            if _table_exists(probe, tbl_name):
                return [tbl_name]
            return []
        rows = probe.execute(text(f"""
            SELECT relname
            FROM pg_class
            WHERE relkind IN ('r', 'p')
              AND relname LIKE '%_{suffix}'
              AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            ORDER BY relname
        """)).fetchall()
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

            # FIX: push record_type filter to DB; DISTINCT ON deduplicates per unit
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


