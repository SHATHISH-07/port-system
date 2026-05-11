import pandas as pd
from sqlalchemy import text
from utils.datetime_utils import parse_datetime
from db.connection import get_engine



def ensure_history_partitions(months_ahead: int = None):
    from config import settings
    from dateutil.relativedelta import relativedelta
    from datetime import datetime
    import logging
    
    logger = logging.getLogger("port_system")
    if months_ahead is None:
        months_ahead = settings.HISTORY_PARTITION_MONTHS_AHEAD
        
    from db.connection import get_engine
    from sqlalchemy import text
    engine = get_engine()
    now = datetime.now()
    
    try:
        with engine.begin() as conn:
            res = conn.execute(text("SELECT relkind FROM pg_class WHERE relname = 'history_containers'")).fetchone()
            if not res or res[0] != 'p':
                return

            for i in range(months_ahead + 1):
                target_date = now + relativedelta(months=i)
                start_date = datetime(target_date.year, target_date.month, 1)
                end_date = start_date + relativedelta(months=1)
                
                part_name = f"history_containers_{start_date.year}_{start_date.month:02d}"
                
                conn.execute(text(f"""
                    CREATE TABLE IF NOT EXISTS {part_name}
                    PARTITION OF history_containers
                    FOR VALUES FROM ('{start_date.strftime('%Y-%m-%d')}') TO ('{end_date.strftime('%Y-%m-%d')}');
                """))
                
            try:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS history_containers_default
                    PARTITION OF history_containers DEFAULT;
                """))
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Failed to ensure history partitions: {e}")

# Schema initialisation
def init_simplified_schema(engine):
    with engine.begin() as conn:

        # history_containers
        res_hc = conn.execute(text("SELECT relkind FROM pg_class WHERE relname = 'history_containers'")).fetchone()
        if not res_hc:
            conn.execute(text("""
                CREATE TABLE history_containers (
                    id                               SERIAL,
                    unit_id                          TEXT,
                    outbound_service                 TEXT,
                    actual_outbound_carrier_visit_id TEXT,
                    facility_id                      TEXT,
                    category_id                      TEXT,
                    ctr_from_position                TEXT,
                    ctr_to_position                  TEXT,
                    move_complete_time               TIMESTAMP,
                    time_in                          TIMESTAMP NOT NULL,
                    time_out                         TIMESTAMP,
                    hazardous_flag                   TEXT,
                    reefer                           TEXT,
                    oog_unit                         TEXT,
                    verified_gross_mass_kg           FLOAT,
                    unit_weight_in_kg                FLOAT,
                    port_of_discharge                TEXT,
                    freight_kind                     TEXT,
                    equipment_class                  TEXT,
                    container_length                 TEXT,
                    equipment_type                   TEXT,
                    inbound_service                  TEXT,
                    arrival_mode                     TEXT,
                    stow_code_1                      TEXT,
                    stow_code_2                      TEXT,
                    stow_code_3                      TEXT,
                    imdg_code                        TEXT,
                    hazard_un_numbers                TEXT,
                    unit_visit_gkey                  TEXT,
                    ingestion_id                     INTEGER,
                    created_at                       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) PARTITION BY RANGE (time_in);
            """))
        # adding columns if they don't exist
        for col, col_type in [
            ("time_in", "TIMESTAMP"),
            ("time_out", "TIMESTAMP"),
            ("unit_weight_in_kg", "FLOAT"),
            ("ingestion_id", "INTEGER"),
            ("unit_visit_gkey", "TEXT"),
            ("category_id", "TEXT"),
            ("equipment_class", "TEXT"),
            ("container_length", "TEXT"),
            ("equipment_type", "TEXT"),
            ("freight_kind", "TEXT"),
            ("inbound_service", "TEXT"),
            ("arrival_mode", "TEXT"),
            ("stow_code_1", "TEXT"),
            ("stow_code_2", "TEXT"),
            ("stow_code_3", "TEXT"),
            ("imdg_code", "TEXT"),
            ("hazard_un_numbers", "TEXT"),
        ]:
            try:
                # add column if it doesn't exist
                conn.execute(
                    text(f"ALTER TABLE history_containers ADD COLUMN IF NOT EXISTS {col} {col_type}")
                )
            except Exception:
                pass

        # current_containers
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

        # add columns if they don't exist
        for col, col_type in [
            ("ingestion_id", "INTEGER"),
            ("is_active", "BOOLEAN"),
            ("time_in", "TIMESTAMP"),
            ("visit_state", "TEXT"),
            ("transit_state", "TEXT"),
            ("oog_unit", "TEXT"),
            ("verified_gross_mass_kg", "FLOAT"),
            ("unit_visit_gkey", "TEXT"),
            ("category_id", "TEXT"),
            ("equipment_class", "TEXT"),
            ("container_length", "TEXT"),
            ("equipment_type", "TEXT"),
            ("freight_kind", "TEXT"),
            ("inbound_service", "TEXT"),
            ("arrival_mode", "TEXT"),
            ("stow_code_1", "TEXT"),
            ("stow_code_2", "TEXT"),
            ("stow_code_3", "TEXT"),
            ("imdg_code", "TEXT"),
            ("hazard_un_numbers", "TEXT"),
        ]:
            try:
                # add column if it doesn't exist
                conn.execute(
                    text(f"ALTER TABLE current_containers ADD COLUMN IF NOT EXISTS {col} {col_type}")
                )
            except Exception:
                pass

        # crane_movements
        res_cm = conn.execute(text("SELECT relkind FROM pg_class WHERE relname = 'crane_movements'")).fetchone()
        if not res_cm:
            conn.execute(text("""
                CREATE TABLE crane_movements (
                    id             SERIAL,
                    crane_id       TEXT,
                    unit_id        TEXT,
                    carrier_visit  TEXT NOT NULL,
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
                ) PARTITION BY HASH (carrier_visit);
            """))
            try:
                from config import settings
                for i in range(settings.CRANE_HASH_PARTITIONS):
                    conn.execute(text(f"CREATE TABLE IF NOT EXISTS crane_movements_p{i} PARTITION OF crane_movements FOR VALUES WITH (MODULUS {settings.CRANE_HASH_PARTITIONS}, REMAINDER {i});"))
            except Exception:
                pass

        # add columns if they don't exist
        for col, col_type in [
            ("event_type", "TEXT"),
            ("unit_category", "TEXT"),
            ("exclude", "TEXT"),
            ("ingestion_id", "INTEGER"),
            ("from_position", "TEXT"),
            ("to_position", "TEXT"),
        ]:
            try:
                # add column if it doesn't exist
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

        # add columns if they don't exist
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
                # add column if it doesn't exist
                conn.execute(
                    text(f"ALTER TABLE ingestion_logs ADD COLUMN IF NOT EXISTS {col} {col_type}")
                )
            except Exception:
                pass


        # Create all indexes
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_service_visit ON history_containers (outbound_service, actual_outbound_carrier_visit_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_time_in ON history_containers (time_in DESC NULLS LAST);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_facility ON history_containers (facility_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_category ON history_containers (category_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_hazardous ON history_containers (hazardous_flag) WHERE hazardous_flag = 'Yes';"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_reefer ON history_containers (reefer) WHERE reefer = 'Yes';"))
        
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cm_carrier_visit ON crane_movements (carrier_visit);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cm_crane_time ON crane_movements (crane_id, time_completed DESC NULLS LAST);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cm_exclude ON crane_movements (exclude) WHERE exclude = 'No';"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cm_move_kind ON crane_movements (move_kind);"))

        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cc_service_visit ON current_containers (outbound_service, actual_outbound_carrier_visit_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cc_active ON current_containers (is_active) WHERE is_active = TRUE;"))
        pass
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cc_hazardous ON current_containers (hazardous_flag) WHERE hazardous_flag = 'Yes';"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cc_reefer ON current_containers (reefer) WHERE reefer = 'Yes';"))
        
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
    
    # Ensure partitions exist after schema is initialized
    ensure_history_partitions()


# Authentication tables
def init_auth_schema(engine):
    with engine.begin() as conn:
        # users table
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

        # operational_requests table
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

        # audit_logs table
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
            # add column if it doesn't exist
            conn.execute(
                text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id INTEGER")
            )
        except Exception:
            pass


# ML training metadata tables
def init_training_metadata_schema(engine):
    with engine.begin() as conn:
        # training_metadata table
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

        # feature_configs table
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

        # model_versions table
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


# Date parsing helper
def _parse_datetime_columns(df: pd.DataFrame) -> pd.DataFrame:
    # list of columns to parse datetime
    for col in [
        "move_complete_time", "time_in", "time_out",
        "created_at", "updated_at", "time_completed",
    ]:
        # check if column exists
        if col in df.columns:
            df[col] = parse_datetime(df[col], col)
    return df


# Data loading
def load_from_db(dataset_type: str, vessel_id: str = None, full_load: bool = False) -> pd.DataFrame:
    # get engine from connection.py
    from config import settings
    engine = get_engine()
    dataset_type = (dataset_type or "").strip().lower()

    # if dataset_type is history
    if dataset_type == "history":
        table = "history_containers"
        id_col = "outbound_service"
        order_col = "COALESCE(move_complete_time, time_in, created_at) DESC NULLS LAST"
    # if dataset_type is current
    elif dataset_type == "current":
        table = "current_containers"
        id_col = "outbound_service"
        order_col = "COALESCE(move_complete_time, time_in, updated_at, created_at) DESC NULLS LAST"
    # if dataset_type is crane
    elif dataset_type == "crane":
        table = "crane_movements"
        id_col = "carrier_visit"
        order_col = "COALESCE(time_completed, created_at) DESC NULLS LAST"
    else:
        return pd.DataFrame()
    
    # query to select all data from the table
    query = f"SELECT * FROM {table}"
    params: dict = {}
    
    filters = []
    # if vessel_id is provided, add it to the query
    if vessel_id:
        filters.append(f"{id_col} = :vessel_id")
        params["vessel_id"] = vessel_id

    if dataset_type == "history" and not full_load and settings.HISTORY_LOAD_WINDOW_DAYS > 0:
        filters.append(f"time_in >= NOW() - INTERVAL '{settings.HISTORY_LOAD_WINDOW_DAYS} days'")

    if filters:
        query += " WHERE " + " AND ".join(filters)

    # add order by clause
    query += f" ORDER BY {order_col}"
    
    # connect to the database and execute the query
    with engine.connect() as conn:
        df = pd.read_sql_query(text(query), conn, params=params)

    return _parse_datetime_columns(df).copy()
