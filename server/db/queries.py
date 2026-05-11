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

def ensure_yard_tables(engine, yard_id: str):
    yard_id = yard_id.lower().strip()
    if not yard_id:
        return
        
    with engine.begin() as conn:
        # History table for the yard
        hist_table = f"{yard_id}_history_containers"
        res_hc = conn.execute(text(f"SELECT relkind FROM pg_class WHERE relname = '{hist_table}'")).fetchone()
        if not res_hc:
            conn.execute(text(f"""
                CREATE TABLE {hist_table} (
                    id                               SERIAL,
                    unit_id                          TEXT,
                    outbound_service                 TEXT,
                    actual_outbound_carrier_visit_id TEXT,
                    facility_id                      TEXT,
                    yard_id                          TEXT,
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
            conn.execute(text(f"CREATE TABLE IF NOT EXISTS {hist_table}_default PARTITION OF {hist_table} DEFAULT;"))
            
        # Current table for the yard
        curr_table = f"{yard_id}_current_containers"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {curr_table} (
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
                updated_at                       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                yard_id                          TEXT,
                category_id                      TEXT,
                equipment_class                  TEXT,
                container_length                 TEXT,
                equipment_type                   TEXT,
                freight_kind                     TEXT,
                inbound_service                  TEXT,
                arrival_mode                     TEXT,
                stow_code_1                      TEXT,
                stow_code_2                      TEXT,
                stow_code_3                      TEXT,
                imdg_code                        TEXT,
                hazard_un_numbers                TEXT,
                unit_visit_gkey                  TEXT
            );
        """))

        # Crane table for the yard
        crane_table = f"{yard_id}_crane_movements"
        res_cm = conn.execute(text(f"SELECT relkind FROM pg_class WHERE relname = '{crane_table}'")).fetchone()
        if not res_cm:
            conn.execute(text(f"""
                CREATE TABLE {crane_table} (
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
                    yard_id        TEXT,
                    ingestion_id   INTEGER,
                    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) PARTITION BY HASH (carrier_visit);
            """))
            from config import settings
            for i in range(settings.CRANE_HASH_PARTITIONS):
                conn.execute(text(f"CREATE TABLE IF NOT EXISTS {crane_table}_p{i} PARTITION OF {crane_table} FOR VALUES WITH (MODULUS {settings.CRANE_HASH_PARTITIONS}, REMAINDER {i});"))

        # Indexes
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_hc_visit ON {hist_table} (actual_outbound_carrier_visit_id);"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_hc_service ON {hist_table} (outbound_service);"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_hc_unit ON {hist_table} (unit_id);"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_hc_time ON {hist_table} (time_in DESC);"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_hc_haz ON {hist_table} (hazardous_flag) WHERE hazardous_flag = 'Yes';"))
        
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_cc_unit ON {curr_table} (unit_id);"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_cc_visit ON {curr_table} (actual_outbound_carrier_visit_id);"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_cc_active ON {curr_table} (is_active) WHERE is_active = TRUE;"))
        
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_cm_visit ON {crane_table} (carrier_visit);"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_cm_crane ON {crane_table} (crane_id, time_completed DESC);"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{yard_id}_cm_unit ON {crane_table} (unit_id);"))

# Schema initialisation — creates support tables (NOT yard data tables)
def init_simplified_schema(engine):
    with engine.begin() as conn:
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

        # add extra columns if they don't exist (safe migration)
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

    # Ensure yard tables exist for any yards already in the DB
    try:
        engine2 = get_engine()
        with engine2.connect() as conn2:
            res_all = conn2.execute(text(
                "SELECT relname FROM pg_class WHERE relkind IN ('r','p') AND relname LIKE '%_current_containers' AND oid NOT IN (SELECT inhrelid FROM pg_inherits)"
            )).fetchall()
        for r in res_all:
            yid = r[0].replace("_current_containers", "")
            if yid:
                ensure_yard_tables(engine, yid)
    except Exception:
        pass



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
def load_from_db(dataset_type: str, vessel_id: str = None, full_load: bool = False, yard_id: str = None) -> pd.DataFrame:
    # get engine from connection.py
    from config import settings
    engine = get_engine()
    dataset_type = (dataset_type or "").strip().lower()

    table_list = []
    
    if yard_id:
        y_pref = f"{yard_id.lower().strip()}_"
        if dataset_type == "history": table_list.append(f"{y_pref}history_containers")
        elif dataset_type == "current": table_list.append(f"{y_pref}current_containers")
        elif dataset_type == "crane": table_list.append(f"{y_pref}crane_movements")
    else:
        # Global Load: Discover all yard-specific tables
        with engine.connect() as conn:
            suffix = "history_containers" if dataset_type == "history" else "current_containers" if dataset_type == "current" else "crane_movements"
            # Discover top-level tables only (not partitions)
            # We exclude any table that is a child in pg_inherits
            res = conn.execute(text(f"""
                SELECT relname FROM pg_class 
                WHERE relkind IN ('p','r') 
                  AND relname LIKE '%_{suffix}'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            for r in res:
                table_list.append(r[0])
            
            # Add monolithic as fallback/legacy if not already added
            legacy = "history_containers" if dataset_type == "history" else "current_containers" if dataset_type == "current" else "crane_movements"
            if legacy not in table_list:
                check_legacy = conn.execute(text(f"SELECT relname FROM pg_class WHERE relname = '{legacy}'")).fetchone()
                if check_legacy:
                    table_list.append(legacy)

    # Build and execute individual queries to handle schema variations gracefully
    dfs = []
    
    # Get common columns for the dataset type
    expected_cols = settings.EXPECTED_HEADERS.get(dataset_type, [])

    id_col = "carrier_visit" if dataset_type == "crane" else "actual_outbound_carrier_visit_id"

    for tbl in table_list:
        try:
            q = f"SELECT * FROM {tbl}"
            filters = []
            params = {}
            if vessel_id:
                filters.append(f"{id_col} = :v_id")
                params["v_id"] = vessel_id
            
            if dataset_type == "history" and not full_load and settings.HISTORY_LOAD_WINDOW_DAYS > 0:
                # Skip the date window when filtering by a specific vessel ID
                # so old CWIT/PEB records are always reachable
                if not vessel_id:
                    filters.append(f"time_in >= NOW() - INTERVAL '{settings.HISTORY_LOAD_WINDOW_DAYS} days'")
                
            if filters:
                q += " WHERE " + " AND ".join(filters)
            
            with engine.connect() as conn:
                df_tbl = pd.read_sql_query(text(q), conn, params=params)
                if not df_tbl.empty:
                    dfs.append(df_tbl)
        except Exception as e:
            import logging
            logging.getLogger("port_system").warning(f"Failed to load from table {tbl}: {e}")

    if not dfs:
        return pd.DataFrame()

    # Combine all dataframes
    df = pd.concat(dfs, ignore_index=True)
    
    # Ensure all expected columns exist
    for col in expected_cols:
        if col not in df.columns:
            df[col] = None
            
    # Sort the final result
    if dataset_type == "crane":
        if "time_completed" in df.columns:
            df = df.sort_values("time_completed", ascending=False)
    else:
        if "move_complete_time" in df.columns:
            df = df.sort_values("move_complete_time", ascending=False)
        elif "time_in" in df.columns:
            df = df.sort_values("time_in", ascending=False)

    return _parse_datetime_columns(df).copy()
