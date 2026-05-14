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
    Per-yard layout:
      history -> core / cargo / position
      crane   -> core / position / meta
      current -> one position-only table
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

        # ── history core ────────────────────────────────────────────────────
        core_tbl = f"{yard_id}_history_containers_core"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {core_tbl} (
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
                time_in                          TIMESTAMP   NOT NULL DEFAULT '2020-01-01',
                time_out                         TIMESTAMP,
                move_complete_time               TIMESTAMP,
                ingestion_id                     TEXT,
                created_at                       TIMESTAMP   NOT NULL DEFAULT NOW(),
                updated_at                       TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # ── history cargo ───────────────────────────────────────────────────
        cargo_tbl = f"{yard_id}_history_containers_cargo"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {cargo_tbl} (
                id                               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                unit_id                          TEXT        NOT NULL,
                actual_outbound_carrier_visit_id TEXT        NOT NULL,
                yard_id                          TEXT,
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
                ingestion_id                     TEXT,
                created_at                       TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # ── history position ────────────────────────────────────────────────
        pos_tbl = f"{yard_id}_history_containers_position"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {pos_tbl} (
                id                               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                unit_id                          TEXT        NOT NULL,
                actual_outbound_carrier_visit_id TEXT        NOT NULL,
                yard_id                          TEXT,
                ctr_from_position                TEXT,
                ctr_to_position                  TEXT,
                current_position                 TEXT,
                stow_code_1                      TEXT,
                stow_code_2                      TEXT,
                stow_code_3                      TEXT,
                ingestion_id                     TEXT,
                created_at                       TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # ── current containers (position-only snapshot) ─────────────────────
        curr_tbl = f"{yard_id}_current_containers"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {curr_tbl} (
                id                               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                unit_id                          TEXT        UNIQUE NOT NULL,
                outbound_service                 TEXT,
                actual_outbound_carrier_visit_id TEXT,
                unit_visit_gkey                  TEXT,
                category_id                      TEXT,
                equipment_class                  TEXT,
                container_length                 TEXT,
                equipment_type                   TEXT,
                freight_kind                     TEXT,
                unit_weight_in_kg                FLOAT,
                verified_gross_mass_kg           FLOAT,
                reefer                           TEXT,
                oog_unit                         TEXT,
                hazardous_flag                   TEXT,
                hazard_un_numbers                TEXT,
                imdg_code                        TEXT,
                port_of_discharge                TEXT,
                destination                      TEXT,
                inbound_service                  TEXT,
                actual_inbound_carrier_visit_id  TEXT,
                arrival_mode                     TEXT,
                ctr_from_position                TEXT,
                ctr_to_position                  TEXT,
                current_position                 TEXT,
                stow_code_1                      TEXT,
                stow_code_2                      TEXT,
                stow_code_3                      TEXT,
                visit_state                      TEXT,
                transit_state                    TEXT,
                yard_id                          TEXT,
                complex_id                       TEXT,
                facility_id                      TEXT,
                is_active                        BOOLEAN     DEFAULT TRUE,
                ingestion_id                     TEXT,
                created_at                       TIMESTAMP   NOT NULL DEFAULT NOW(),
                updated_at                       TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # Drop old time columns if the table already existed from the previous design
        for old_col in ("time_in", "time_out", "move_complete_time", "time_completed"):
            try:
                conn.execute(text(f"ALTER TABLE {curr_tbl} DROP COLUMN IF EXISTS {old_col};"))
            except Exception as exc:
                logger.debug("[DB] Could not drop old current column %s: %s", old_col, exc)

        # ── crane core ──────────────────────────────────────────────────────
        crane_core_tbl = f"{yard_id}_crane_movements_core"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {crane_core_tbl} (
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
                yard_id        TEXT,
                ingestion_id   TEXT,
                created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # ── crane position ─────────────────────────────────────────────────
        crane_pos_tbl = f"{yard_id}_crane_movements_position"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {crane_pos_tbl} (
                id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                unit_id       TEXT,
                carrier_visit TEXT        NOT NULL,
                from_position TEXT,
                to_position   TEXT,
                yard_id       TEXT,
                ingestion_id  TEXT,
                created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # ── crane meta ──────────────────────────────────────────────────────
        crane_meta_tbl = f"{yard_id}_crane_movements_meta"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {crane_meta_tbl} (
                id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                unit_id       TEXT,
                carrier_visit TEXT        NOT NULL,
                yard_id       TEXT,
                ingestion_id  TEXT,
                created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
            );
        """))

        # ── Indexes ──────────────────────────────────────────────────────────
        idx_defs = [
            (core_tbl,  f"idx_{yard_id}_hcore_visit",   "actual_outbound_carrier_visit_id"),
            (core_tbl,  f"idx_{yard_id}_hcore_unit",    "unit_id"),
            (core_tbl,  f"idx_{yard_id}_hcore_service", "outbound_service"),
            (core_tbl,  f"idx_{yard_id}_hcore_time",    "time_in DESC"),
            (cargo_tbl, f"idx_{yard_id}_hcargo_unit",   "unit_id"),
            (cargo_tbl, f"idx_{yard_id}_hcargo_visit",  "actual_outbound_carrier_visit_id"),
            (pos_tbl,   f"idx_{yard_id}_hpos_unit",     "unit_id"),
            (pos_tbl,   f"idx_{yard_id}_hpos_visit",    "actual_outbound_carrier_visit_id"),
            (curr_tbl,  f"idx_{yard_id}_cc_unit",       "unit_id"),
            (curr_tbl,  f"idx_{yard_id}_cc_visit",      "actual_outbound_carrier_visit_id"),
            (curr_tbl,  f"idx_{yard_id}_cc_updated",    "updated_at DESC"),
            (crane_core_tbl, f"idx_{yard_id}_cmcore_visit", "carrier_visit"),
            (crane_core_tbl, f"idx_{yard_id}_cmcore_crane", "crane_id, time_completed DESC"),
            (crane_core_tbl, f"idx_{yard_id}_cmcore_unit",  "unit_id"),
            (crane_pos_tbl,  f"idx_{yard_id}_cmpos_visit",   "carrier_visit"),
            (crane_pos_tbl,  f"idx_{yard_id}_cmpos_unit",    "unit_id"),
            (crane_meta_tbl, f"idx_{yard_id}_cmeta_visit",   "carrier_visit"),
            (crane_meta_tbl, f"idx_{yard_id}_cmeta_unit",    "unit_id"),
        ]
        for tbl, idx_name, cols in idx_defs:
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
            res = conn2.execute(text("""
                SELECT relname
                FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_current_containers'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()

        for r in res:
            yid = r[0].replace("_current_containers", "")
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


# ─────────────────────────────────────────────────────────────────────────────
# Load helpers
# ─────────────────────────────────────────────────────────────────────────────

def load_from_db(
    dataset_type: str,
    vessel_id: str = None,
    full_load: bool = False,
    yard_id: str = None,
) -> pd.DataFrame:
    from config import settings

    engine = get_engine()
    dataset_type = (dataset_type or "").strip().lower()

    with engine.connect() as probe:
        if yard_id:
            y_pref = f"{yard_id.lower().strip()}_"
            if dataset_type == "history":
                table_list = [f"{y_pref}history_containers_core"]
            elif dataset_type == "current":
                table_list = [f"{y_pref}current_containers"]
            elif dataset_type == "crane":
                table_list = [f"{y_pref}crane_movements_core"]
            else:
                table_list = []
        else:
            suffix_map = {
                "history": "history_containers_core",
                "current": "current_containers",
                "crane": "crane_movements_core",
            }
            suffix = suffix_map.get(dataset_type, "history_containers_core")
            rows = probe.execute(text(f"""
                SELECT relname
                FROM pg_class
                WHERE relkind IN ('r', 'p')
                  AND relname LIKE '%_{suffix}'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
                ORDER BY relname
            """)).fetchall()
            table_list = [r[0] for r in rows]

    if not table_list:
        return pd.DataFrame()

    if dataset_type == "history":
        return _load_history_joined(engine, table_list, vessel_id, full_load, settings)
    if dataset_type == "crane":
        return _load_crane_joined(engine, table_list, vessel_id, full_load, settings)

    # current
    dfs: list[pd.DataFrame] = []
    for tbl in table_list:
        try:
            filters: list[str] = []
            params: dict = {}

            if vessel_id:
                filters.append(
                    "(actual_outbound_carrier_visit_id = :v_id OR outbound_service = :v_id)"
                )
                params["v_id"] = vessel_id

            q = f"SELECT * FROM {tbl}"
            if filters:
                q += " WHERE " + " AND ".join(filters)

            # position-only current snapshot; no time-based sort required
            q += " ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST"

            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(text(q), conn, params=params)
                if not df_tbl.empty:
                    dfs.append(df_tbl)
        except Exception as e:
            logger.warning("Failed to load from %s: %s", tbl, e)

    if not dfs:
        return pd.DataFrame()

    df = pd.concat(dfs, ignore_index=True)

    for col in settings.EXPECTED_HEADERS.get("current", []):
        if col not in df.columns:
            df[col] = None

    return df.copy()


def _load_history_joined(engine, core_tables: list[str], vessel_id: str | None, full_load: bool, settings) -> pd.DataFrame:
    dfs: list[pd.DataFrame] = []

    for core_tbl in core_tables:
        prefix = core_tbl.replace("_history_containers_core", "")
        cargo_tbl = f"{prefix}_history_containers_cargo"
        pos_tbl = f"{prefix}_history_containers_position"

        with engine.connect() as probe:
            cargo_ok = _table_exists(probe, cargo_tbl)
            pos_ok = _table_exists(probe, pos_tbl)

        if not cargo_ok or not pos_ok:
            _load_single_table(engine, core_tbl, vessel_id, full_load, settings, dfs)
            continue

        try:
            where_clauses: list[str] = []
            params: dict = {}

            if vessel_id:
                where_clauses.append("c.actual_outbound_carrier_visit_id = :v_id")
                params["v_id"] = vessel_id
            elif not full_load and settings.HISTORY_LOAD_WINDOW_DAYS > 0:
                where_clauses.append(
                    f"c.time_in >= NOW() - INTERVAL '{settings.HISTORY_LOAD_WINDOW_DAYS} days'"
                )

            where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

            q = f"""
                SELECT
                    c.unit_id,
                    c.unit_visit_gkey,
                    c.outbound_service,
                    c.actual_outbound_carrier_visit_id,
                    c.inbound_service,
                    c.actual_inbound_carrier_visit_id,
                    c.facility_id,
                    c.yard_id,
                    c.complex_id,
                    c.category_id,
                    c.freight_kind,
                    c.arrival_mode,
                    c.visit_state,
                    c.transit_state,
                    c.time_in,
                    c.time_out,
                    c.move_complete_time,
                    c.ingestion_id,
                    c.created_at,
                    c.updated_at,
                    cg.equipment_class,
                    cg.container_length,
                    cg.equipment_type,
                    cg.unit_weight_in_kg,
                    cg.verified_gross_mass_kg,
                    cg.reefer,
                    cg.oog_unit,
                    cg.hazardous_flag,
                    cg.hazard_un_numbers,
                    cg.imdg_code,
                    cg.port_of_discharge,
                    cg.destination,
                    p.ctr_from_position,
                    p.ctr_to_position,
                    p.current_position,
                    p.stow_code_1,
                    p.stow_code_2,
                    p.stow_code_3
                FROM {core_tbl} c
                LEFT JOIN {cargo_tbl} cg
                    ON c.unit_id = cg.unit_id
                   AND c.actual_outbound_carrier_visit_id = cg.actual_outbound_carrier_visit_id
                LEFT JOIN {pos_tbl} p
                    ON c.unit_id = p.unit_id
                   AND c.actual_outbound_carrier_visit_id = p.actual_outbound_carrier_visit_id
                {where_sql}
            """

            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(text(q), conn, params=params)
                if not df_tbl.empty:
                    dfs.append(df_tbl)
        except Exception as e:
            logger.warning("History JOIN failed for %s: %s", core_tbl, e)
            _load_single_table(engine, core_tbl, vessel_id, full_load, settings, dfs)

    if not dfs:
        return pd.DataFrame()

    df = pd.concat(dfs, ignore_index=True)

    for col in settings.EXPECTED_HEADERS.get("history", []):
        if col not in df.columns:
            df[col] = None

    if "time_in" in df.columns:
        df = df.sort_values("time_in", ascending=False)
    elif "move_complete_time" in df.columns:
        df = df.sort_values("move_complete_time", ascending=False)

    return _parse_datetime_columns(df).copy()


def _load_crane_joined(engine, core_tables: list[str], vessel_id: str | None, full_load: bool, settings) -> pd.DataFrame:
    dfs: list[pd.DataFrame] = []

    for core_tbl in core_tables:
        prefix = core_tbl.replace("_crane_movements_core", "")
        pos_tbl = f"{prefix}_crane_movements_position"
        meta_tbl = f"{prefix}_crane_movements_meta"

        with engine.connect() as probe:
            pos_ok = _table_exists(probe, pos_tbl)
            meta_ok = _table_exists(probe, meta_tbl)

        if not pos_ok or not meta_ok:
            _load_single_table(engine, core_tbl, vessel_id, full_load, settings, dfs)
            continue

        try:
            where_clauses: list[str] = []
            params: dict = {}

            if vessel_id:
                where_clauses.append("c.carrier_visit = :v_id")
                params["v_id"] = vessel_id

            where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

            q = f"""
                SELECT
                    c.crane_id,
                    c.unit_id,
                    c.carrier_visit,
                    c.event_type,
                    c.move_kind,
                    c.line_op,
                    c.unit_category,
                    c.exclude,
                    c.time_completed,
                    c.yard_id,
                    c.ingestion_id,
                    c.created_at,
                    p.from_position,
                    p.to_position,
                    m.id AS meta_id
                FROM {core_tbl} c
                LEFT JOIN {pos_tbl} p
                    ON c.unit_id = p.unit_id
                   AND c.carrier_visit = p.carrier_visit
                   AND c.yard_id = p.yard_id
                LEFT JOIN {meta_tbl} m
                    ON c.unit_id = m.unit_id
                   AND c.carrier_visit = m.carrier_visit
                   AND c.yard_id = m.yard_id
                {where_sql}
            """

            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(text(q), conn, params=params)
                if not df_tbl.empty:
                    dfs.append(df_tbl)
        except Exception as e:
            logger.warning("Crane JOIN failed for %s: %s", core_tbl, e)
            _load_single_table(engine, core_tbl, vessel_id, full_load, settings, dfs)

    if not dfs:
        return pd.DataFrame()

    df = pd.concat(dfs, ignore_index=True)

    for col in settings.EXPECTED_HEADERS.get("crane", []):
        if col not in df.columns:
            df[col] = None

    if "time_completed" in df.columns:
        df = df.sort_values("time_completed", ascending=False)

    return _parse_datetime_columns(df).copy()


def load_history_with_crane(
    vessel_id: str | None = None,
    yard_id: str | None = None,
    full_load: bool = False,
) -> pd.DataFrame:
    """
    Merge history and crane data on:
      history.unit_id + history.actual_outbound_carrier_visit_id
      <-> crane.unit_id + crane.carrier_visit
    """
    history_df = load_from_db("history", vessel_id=vessel_id, full_load=full_load, yard_id=yard_id)
    crane_df = load_from_db("crane", vessel_id=vessel_id, full_load=full_load, yard_id=yard_id)

    if history_df.empty:
        return history_df
    if crane_df.empty:
        return history_df

    crane_df = crane_df.copy()
    if "time_completed" in crane_df.columns:
        crane_df["time_completed"] = pd.to_datetime(crane_df["time_completed"], errors="coerce")

    if {"unit_id", "carrier_visit"}.issubset(crane_df.columns):
        crane_df = crane_df.sort_values("time_completed", ascending=True, na_position="last")
        crane_df = crane_df.drop_duplicates(subset=["unit_id", "carrier_visit", "yard_id"], keep="last")

    crane_cols = [c for c in crane_df.columns if c not in {"unit_id", "carrier_visit", "yard_id"}]
    crane_pref = crane_df[["unit_id", "carrier_visit", "yard_id"] + crane_cols].copy()
    crane_pref = crane_pref.rename(columns={c: f"crane_{c}" for c in crane_cols})

    merge_left = ["unit_id", "actual_outbound_carrier_visit_id"]
    merge_right = ["unit_id", "carrier_visit"]
    if "yard_id" in history_df.columns and "yard_id" in crane_pref.columns:
        merge_left.append("yard_id")
        merge_right.append("yard_id")

    return history_df.merge(
        crane_pref,
        how="left",
        left_on=merge_left,
        right_on=merge_right,
        suffixes=("", "_crane"),
    )


def _load_single_table(engine, tbl: str, vessel_id, full_load, settings, dfs: list) -> None:
    try:
        filters: list[str] = []
        params: dict = {}

        if vessel_id:
            if tbl.endswith("_crane_movements_core"):
                filters.append("carrier_visit = :v_id")
            else:
                filters.append("actual_outbound_carrier_visit_id = :v_id")
            params["v_id"] = vessel_id
        elif not full_load and settings.HISTORY_LOAD_WINDOW_DAYS > 0 and tbl.endswith("_history_containers_core"):
            filters.append(f"time_in >= NOW() - INTERVAL '{settings.HISTORY_LOAD_WINDOW_DAYS} days'")

        q = f"SELECT * FROM {tbl}"
        if filters:
            q += " WHERE " + " AND ".join(filters)

        with engine.connect() as conn:
            df_tbl = pd.read_sql_query(text(q), conn, params=params)
            if not df_tbl.empty:
                dfs.append(df_tbl)
    except Exception as exc:
        logger.warning("Fallback load failed for %s: %s", tbl, exc)