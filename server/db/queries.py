import pandas as pd
from sqlalchemy import text

from db.connection import get_engine


# ── Schema initialisation ─────────────────────────────────────────────────────

def init_simplified_schema(engine):
    """Create / migrate container and ingestion tables."""
    with engine.begin() as conn:

        # history_containers
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS history_containers (
                id                               SERIAL PRIMARY KEY,
                unit_id                          TEXT,
                outbound_service                 TEXT,
                actual_outbound_carrier_visit_id TEXT,
                ctr_from_position                TEXT,
                ctr_to_position                  TEXT,
                move_complete_time               TIMESTAMP,
                time_in                          TIMESTAMP,
                time_out                         TIMESTAMP,
                hazardous_flag                   TEXT,
                reefer                           TEXT,
                oog_unit                         TEXT,
                verified_gross_mass_kg           FLOAT,
                unit_weight_in_kg                FLOAT,
                port_of_discharge                TEXT,
                ingestion_id                     INTEGER,
                created_at                       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

        for col, col_type in [
            ("time_in", "TIMESTAMP"),
            ("time_out", "TIMESTAMP"),
            ("unit_weight_in_kg", "FLOAT"),
            ("ingestion_id", "INTEGER"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE history_containers ADD COLUMN IF NOT EXISTS {col} {col_type}")
                )
            except Exception:
                pass

        # current_containers — unit_id must have UNIQUE for ON CONFLICT to work
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS current_containers (
                id                               SERIAL PRIMARY KEY,
                unit_id                          TEXT UNIQUE NOT NULL,
                outbound_service                 TEXT,
                actual_outbound_carrier_visit_id TEXT,
                ctr_from_position                TEXT,
                ctr_to_position                  TEXT,
                move_complete_time               TIMESTAMP,
                time_in                          TIMESTAMP,
                visit_state                      TEXT,
                transit_state                    TEXT,
                hazardous_flag                   TEXT,
                reefer                           TEXT,
                oog_unit                         TEXT,
                verified_gross_mass_kg           FLOAT,
                port_of_discharge                TEXT,
                ingestion_id                     INTEGER,
                is_active                        BOOLEAN DEFAULT TRUE,
                created_at                       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at                       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

        # Ensure UNIQUE constraint exists even on pre-existing tables
        try:
            conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = 'current_containers'::regclass
                          AND contype = 'u'
                          AND conname LIKE '%unit_id%'
                    ) THEN
                        ALTER TABLE current_containers
                            ADD CONSTRAINT current_containers_unit_id_unique UNIQUE (unit_id);
                    END IF;
                END$$;
            """))
        except Exception:
            pass

        for col, col_type in [
            ("ingestion_id", "INTEGER"),
            ("is_active", "BOOLEAN"),
            ("time_in", "TIMESTAMP"),
            ("visit_state", "TEXT"),
            ("transit_state", "TEXT"),
            ("oog_unit", "TEXT"),
            ("verified_gross_mass_kg", "FLOAT"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE current_containers ADD COLUMN IF NOT EXISTS {col} {col_type}")
                )
            except Exception:
                pass

        # crane_movements
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crane_movements (
                id             SERIAL PRIMARY KEY,
                crane_id       TEXT,
                unit_id        TEXT,
                carrier_visit  TEXT,
                event_type     TEXT,
                move_kind      TEXT,
                from_position  TEXT,
                to_position    TEXT,
                time_completed TIMESTAMP,
                line_op        TEXT,
                unit_category  TEXT,
                exclude        TEXT,
                ingestion_id   INTEGER,
                created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

        for col, col_type in [
            ("event_type", "TEXT"),
            ("unit_category", "TEXT"),
            ("exclude", "TEXT"),
            ("ingestion_id", "INTEGER"),
            ("from_position", "TEXT"),
            ("to_position", "TEXT"),
        ]:
            try:
                conn.execute(
                    text(f"ALTER TABLE crane_movements ADD COLUMN IF NOT EXISTS {col} {col_type}")
                )
            except Exception:
                pass

        # ingestion_logs
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ingestion_logs (
                id               SERIAL PRIMARY KEY,
                filename         TEXT,
                file_hash        TEXT,
                dataset_type     TEXT,
                status           TEXT,
                records_total    INTEGER,
                records_accepted INTEGER,
                records_rejected INTEGER,
                uploaded_by      INTEGER,
                completed_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                error_summary    TEXT,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                conn.execute(
                    text(f"ALTER TABLE ingestion_logs ADD COLUMN IF NOT EXISTS {col} {col_type}")
                )
            except Exception:
                pass

        # rejection_logs
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rejection_logs (
                id           SERIAL PRIMARY KEY,
                ingestion_id INTEGER,
                row_data     TEXT,
                reason       TEXT,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))


def init_auth_schema(engine):
    """Create authentication and audit tables."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'user',
                is_active     BOOLEAN DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS operational_requests (
                id              SERIAL PRIMARY KEY,
                type            TEXT NOT NULL,
                status          TEXT DEFAULT 'pending',
                payload         TEXT,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

        try:
            conn.execute(
                text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id INTEGER")
            )
        except Exception:
            pass


def init_training_metadata_schema(engine):
    """Create ML training metadata tables."""
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
                created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS feature_configs (
                id           SERIAL PRIMARY KEY,
                name         TEXT UNIQUE,
                description  TEXT,
                feature_names JSONB,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS model_versions (
                id                 SERIAL PRIMARY KEY,
                model_name         TEXT,
                version            TEXT UNIQUE,
                artifact_path      TEXT,
                feature_config_id  INTEGER REFERENCES feature_configs(id),
                dataset_size       INTEGER,
                metrics            JSONB,
                status             TEXT DEFAULT 'active',
                promoted_at        TIMESTAMP,
                trained_at         TIMESTAMP,
                notes              TEXT,
                created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))


# ── Date parsing helper ───────────────────────────────────────────────────────

def _parse_datetime_columns(df: pd.DataFrame) -> pd.DataFrame:
    from utils.datetime_utils import parse_datetime
    for col in [
        "move_complete_time", "time_in", "time_out",
        "created_at", "updated_at", "time_completed",
    ]:
        if col in df.columns:
            df[col] = parse_datetime(df[col], col)
    return df


# ── Data loading ──────────────────────────────────────────────────────────────

def load_from_db(dataset_type: str, vessel_id: str = None) -> pd.DataFrame:
    """Load data from simplified tables.

    dataset_type: 'history' | 'current' | 'crane'
    vessel_id:    optional filter on the service / carrier_visit column
    """
    engine = get_engine()
    dataset_type = (dataset_type or "").strip().lower()

    if dataset_type == "history":
        table = "history_containers"
        id_col = "outbound_service"
        order_col = "COALESCE(move_complete_time, time_in, created_at) DESC NULLS LAST"
    elif dataset_type == "current":
        table = "current_containers"
        id_col = "outbound_service"
        order_col = "COALESCE(move_complete_time, time_in, updated_at, created_at) DESC NULLS LAST"
    elif dataset_type == "crane":
        table = "crane_movements"
        id_col = "carrier_visit"
        order_col = "COALESCE(time_completed, created_at) DESC NULLS LAST"
    else:
        return pd.DataFrame()

    query = f"SELECT * FROM {table}"
    params: dict = {}

    if vessel_id:
        query += f" WHERE {id_col} = :vessel_id"
        params["vessel_id"] = vessel_id

    query += f" ORDER BY {order_col}"

    with engine.connect() as conn:
        df = pd.read_sql_query(text(query), conn, params=params)

    return _parse_datetime_columns(df).copy()
