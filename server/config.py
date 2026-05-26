from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Application Metadata
    API_TITLE = "PortSync API"
    API_VERSION = "2.0.0"
    CORS_ORIGINS = ["*"]

    # Database
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@127.0.0.1:5432/portsystem",
    ).replace("@localhost", "@127.0.0.1")
    DB_POOL_SIZE = 5
    DB_MAX_OVERFLOW = 10
    DEFAULT_TRAINING_HISTORY_LIMIT = 20

    # Scheduled Jobs
    RETRAIN_CRON_HOUR = 2
    RETRAIN_CRON_MINUTE = 0

    # Business Logic Thresholds
    CRANE_IDLE_THRESHOLD_MINUTES = 30
    BERTH_HIGH_RISK_SHARE_PCT = 40.0
    BERTH_HIGH_RISK_MOVES = 60
    BERTH_MEDIUM_RISK_SHARE_PCT = 20.0
    BERTH_MEDIUM_RISK_MOVES = 30

    # Authentication
    JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-for-portsync")
    JWT_ALGORITHM = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
    DEFAULT_ADMIN_USER = os.getenv("DEFAULT_ADMIN_USER", "admin")
    DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")

    # Expected schema columns per dataset type
    # History is stored in three split tables and reassembled on read.
    # Current is a single position-only snapshot table.
    # Crane is stored in three split tables and reassembled on read.
    EXPECTED_HEADERS: dict[str, list[str]] = {
        "history": [
            "unit_id",
            "unit_visit_gkey",
            "outbound_service",
            "actual_outbound_carrier_visit_id",
            "inbound_service",
            "actual_inbound_carrier_visit_id",
            "facility_id",
            "yard_id",
            "complex_id",
            "category_id",
            "freight_kind",
            "arrival_mode",
            "visit_state",
            "transit_state",
            "time_in",
            "time_out",
            "move_complete_time",
            "equipment_class",
            "container_length",
            "equipment_type",
            "unit_weight_in_kg",
            "verified_gross_mass_kg",
            "reefer",
            "oog_unit",
            "hazardous_flag",
            "hazard_un_numbers",
            "imdg_code",
            "port_of_discharge",
            "destination",
            "ctr_from_position",
            "ctr_to_position",
            "current_position",
            "stow_code_1",
            "stow_code_2",
            "stow_code_3",
        ],
        "current": [
            "unit_id",
            "unit_visit_gkey",
            "outbound_service",
            "actual_outbound_carrier_visit_id",
            "inbound_service",
            "actual_inbound_carrier_visit_id",
            "category_id",
            "equipment_class",
            "container_length",
            "equipment_type",
            "freight_kind",
            "unit_weight_in_kg",
            "verified_gross_mass_kg",
            "reefer",
            "oog_unit",
            "hazardous_flag",
            "hazard_un_numbers",
            "imdg_code",
            "port_of_discharge",
            "destination",
            "arrival_mode",
            "ctr_from_position",
            "ctr_to_position",
            "current_position",
            "stow_code_1",
            "stow_code_2",
            "stow_code_3",
            "visit_state",
            "transit_state",
            "yard_id",
            "complex_id",
            "facility_id",
        ],
        "crane": [
            "crane_id",
            "unit_id",
            "carrier_visit",
            "event_type",
            "move_kind",
            "from_position",
            "to_position",
            "time_completed",
            "line_op",
            "unit_category",
            "exclude",
            "yard_id",
        ],
    }

    # Required columns per dataset type
    REQUIRED_COLS_BY_TYPE: dict[str, list[str]] = {
        "history": ["unit_id", "actual_outbound_carrier_visit_id"],
        "current": ["unit_id", "actual_outbound_carrier_visit_id"],
        "crane": ["crane_id", "carrier_visit", "move_kind"],
    }

    REQUIRED_COLS: list[str] = [
        "unit_id",
        "outbound_service",
        "actual_outbound_carrier_visit_id",
    ]

    # Model training
    MODEL_PATH = os.getenv("MODEL_PATH", "models/stay_model.pkl")
    TRAIN_MIN_HOURS = 2
    TRAIN_MAX_HOURS = 240
    MIN_VISIT_ROWS = 5
    VESSEL_WINDOW_HOURS = 96

    FEATURE_NAMES: list[str] = [
        "loaded",
        "discharged",
        "total_moves",
        "imbalance",
        "load_ratio",
        "discharge_ratio",
        "container_count",
        "avg_weight",
        "heavy_count",
        "reefer_count",
        "hazard_count",
        "oog_count",
        "service_hash",
        "restow_intensity",
        "block_concentration",
        "reefer_equipment_ratio",
        "pct_40ft",
        "avg_weight_kg",
        "heavy_ratio",
    ]

    # Automated retraining
    RETRAIN_THRESHOLD_NEW_RECORDS = int(os.getenv("RETRAIN_THRESHOLD_NEW_RECORDS", "1000"))
    RETRAIN_CHECK_INTERVAL_SECONDS = int(os.getenv("RETRAIN_CHECK_INTERVAL_SECONDS", "60"))

    INSERT_TRAINING_METADATA_QUERY = """
        INSERT INTO training_metadata
            (dataset_size, last_trained_timestamp, data_source,
             training_type, status, notes, created_at, updated_at)
        VALUES
            (:size, :ts, :source, :ttype, :status, :notes, :created, :updated)
        RETURNING id, dataset_size, last_trained_timestamp,
                  data_source, training_type, status, notes, created_at
    """

    GET_LATEST_TRAINING_METADATA_QUERY = """
        SELECT id, dataset_size, last_trained_timestamp,
               data_source, training_type, status, notes, created_at
        FROM training_metadata
        WHERE status = 'completed'
        ORDER BY last_trained_timestamp DESC
        LIMIT 1
    """

    GET_TRAINING_METADATA_HISTORY_QUERY = """
        SELECT id, dataset_size, last_trained_timestamp,
               data_source, training_type, status, notes, created_at
        FROM training_metadata
        ORDER BY last_trained_timestamp DESC
        LIMIT :lim
    """

    # Berth analysis thresholds
    BERTH_HIGH_RISK_SHARE_PCT = 40.0
    BERTH_HIGH_RISK_MOVES = 60
    BERTH_MEDIUM_RISK_SHARE_PCT = 20.0
    BERTH_MEDIUM_RISK_MOVES = 30
    BERTH_TOP_N = 5
    BERTH_CRANE_MOVES_PER_HOUR = 20

    # Risk flags
    RISK_HIGH_LOAD_THRESHOLD = 250
    RISK_HAZARDOUS_THRESHOLD = 10
    RISK_REEFER_THRESHOLD = 20
    RISK_EXTENDED_STAY_HOURS = 40.0

    # Crane analytics
    CRANE_MOVES_PER_HOUR_TARGET = 25
    CRANE_MAX_CRANES_DISPLAY = 6
    CRANE_IDLE_THRESHOLD_MINUTES = 30
    CRANE_EFFICIENCY_ROLLING_WINDOW = 10
    CRANE_PERFORMANCE_LIMIT = 1000
    CRANE_ANALYTICS_WINDOW_DAYS = 90
    CRANE_HASH_PARTITIONS = 8

    # Database config
    HISTORY_PARTITION_MONTHS_AHEAD = 3
    HISTORY_PARTITION_KEY = "time_in"
    HISTORY_LOAD_WINDOW_DAYS = 0

    # Stay prediction defaults
    MOVES_PER_HOUR_PER_CRANE = 25.0
    DEFAULT_AVG_WEIGHT_KG = 15000.0
    DEFAULT_REEFER_RATIO = 0.1
    DEFAULT_HAZARD_RATIO = 0.05
    DEFAULT_OOG_RATIO = 0.02

    # Berth labels
    BERTH_HIGH_VOLUME_THRESHOLD = 1000
    BERTH_MED_VOLUME_THRESHOLD = 500
    BERTH_HIGH_LABEL = "PEB-1"
    BERTH_MED_LABEL = "PEB-2"
    BERTH_LOW_LABEL = "PEB-3"

    # SQL Queries (from db/connection.py & db/queries.py)
    QUERY_CHECK_DB_EXISTS = "SELECT 1 FROM pg_database WHERE datname = %s"
    QUERY_CREATE_DB = 'CREATE DATABASE "{db_name}"'
    
    QUERY_COLUMN_EXISTS = """
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = :tbl
          AND column_name = :col
    """
    QUERY_TABLE_EXISTS = """
        SELECT 1
        FROM pg_class
        WHERE relname = :t
          AND relkind IN ('r', 'p')
    """
    QUERY_CREATE_INDEX = "CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({columns});"
    
    QUERY_ENSURE_PGCRYPTO = 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
    
    QUERY_CREATE_VESSEL_VISITS = """
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
    """
    
    QUERY_CREATE_CONTAINER_OPERATIONS = """
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
    """
    
    QUERY_ADD_RECORD_TYPE_COL = "ALTER TABLE {co_tbl} ADD COLUMN IF NOT EXISTS record_type TEXT DEFAULT 'history'"
    QUERY_BACKFILL_RECORD_TYPE = "UPDATE {co_tbl} SET record_type = 'history' WHERE record_type IS NULL"
    QUERY_CREATE_CO_UNIQUE_INDEX = """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_{yard_id}_co_unit_yard_current
        ON {co_tbl} (unit_id, yard_id)
        WHERE record_type = 'current';
    """
    
    QUERY_CREATE_CRANE_OPERATIONS = """
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
    """
    
    QUERY_CREATE_INGESTION_LOGS = """
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
    """
    
    QUERY_CREATE_REJECTION_LOGS = """
        CREATE TABLE IF NOT EXISTS rejection_logs (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ingestion_id TEXT,
            row_data     TEXT,
            reason       TEXT,
            created_at   TIMESTAMP DEFAULT NOW()
        );
    """
    
    QUERY_ALTER_ADD_COLUMN = "ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type}"
    
    QUERY_DISCOVER_YARDS = """
        SELECT replace(relname, '_container_operations', '') AS yard_prefix
        FROM pg_class
        WHERE relkind IN ('r','p')
          AND relname LIKE '%_container_operations'
          AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
          AND relname != ''
        ORDER BY relname
    """
    
    QUERY_CREATE_USERS = """
        CREATE TABLE IF NOT EXISTS users (
            id            SERIAL PRIMARY KEY,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'user',
            is_active     BOOLEAN DEFAULT TRUE,
            created_at    TIMESTAMP DEFAULT NOW()
        );
    """
    
    QUERY_CREATE_OP_REQUESTS = """
        CREATE TABLE IF NOT EXISTS operational_requests (
            id              SERIAL PRIMARY KEY,
            type            TEXT NOT NULL,
            status          TEXT DEFAULT 'pending',
            payload         TEXT,
            created_at      TIMESTAMP DEFAULT NOW(),
            created_by_user TEXT
        );
    """
    
    QUERY_CREATE_AUDIT_LOGS = """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id        SERIAL PRIMARY KEY,
            action    TEXT NOT NULL,
            details   TEXT,
            username  TEXT,
            user_id   INTEGER,
            timestamp TIMESTAMP DEFAULT NOW()
        );
    """
    
    QUERY_CREATE_TRAINING_METADATA = """
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
    """
    
    QUERY_CREATE_FEATURE_CONFIGS = """
        CREATE TABLE IF NOT EXISTS feature_configs (
            id            SERIAL PRIMARY KEY,
            name          TEXT UNIQUE,
            description   TEXT,
            feature_names JSONB,
            created_at    TIMESTAMP DEFAULT NOW(),
            updated_at    TIMESTAMP DEFAULT NOW()
        );
    """
    
    QUERY_CREATE_MODEL_VERSIONS = """
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
    """
    
    QUERY_DISCOVER_TABLES = """
        SELECT relname
        FROM pg_class
        WHERE relkind IN ('r', 'p')
          AND relname LIKE '%_{suffix}'
          AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
        ORDER BY relname
    """
    
    QUERY_SELECT_VESSEL_SCHEDULES = """
        SELECT port_of_discharge 
        FROM vessel_schedules 
        WHERE vessel_id = :v_id 
        ORDER BY sequence_order ASC
    """
    
    QUERY_DELETE_VESSEL_SCHEDULES = "DELETE FROM vessel_schedules WHERE vessel_id = :v_id"
    
    QUERY_INSERT_VESSEL_SCHEDULES = """
        INSERT INTO vessel_schedules (vessel_id, port_of_discharge, sequence_order) 
        VALUES (:v_id, :port, :seq)
    """


settings = Settings()