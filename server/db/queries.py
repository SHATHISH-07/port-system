import csv
import uuid
import datetime
from io import StringIO
import pandas as pd
from sqlalchemy import text, inspect
from db.connection import get_engine, _ensure_database_exists, engine as _engine
from config import settings

def init_simplified_schema(engine):
    """Initialize the simplified container and ingestion tables."""
    with engine.begin() as conn:
        # History Containers
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS history_containers (
                id SERIAL PRIMARY KEY,
                unit_id TEXT,
                outbound_service TEXT,
                actual_outbound_carrier_visit_id TEXT,
                ctr_from_position TEXT,
                ctr_to_position TEXT,
                move_complete_time TIMESTAMP,
                time_in TIMESTAMP,
                time_out TIMESTAMP,
                hazardous_flag TEXT,
                reefer TEXT,
                oog_unit TEXT,
                verified_gross_mass_kg FLOAT,
                unit_weight_in_kg FLOAT,
                port_of_discharge TEXT,
                ingestion_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        # Ensure new columns exist
        for col, col_type in [("time_in", "TIMESTAMP"), ("time_out", "TIMESTAMP"), ("unit_weight_in_kg", "FLOAT"), ("ingestion_id", "INTEGER")]:
            try: conn.execute(text(f"ALTER TABLE history_containers ADD COLUMN IF NOT EXISTS {col} {col_type}"))
            except: pass

        # Current Containers
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS current_containers (
                id SERIAL PRIMARY KEY,
                unit_id TEXT UNIQUE,
                outbound_service TEXT,
                actual_outbound_carrier_visit_id TEXT,
                ctr_from_position TEXT,
                ctr_to_position TEXT,
                move_complete_time TIMESTAMP,
                time_in TIMESTAMP,
                hazardous_flag TEXT,
                reefer TEXT,
                oog_unit TEXT,
                verified_gross_mass_kg FLOAT,
                port_of_discharge TEXT,
                ingestion_id INTEGER,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        for col, col_type in [("ingestion_id", "INTEGER"), ("is_active", "BOOLEAN DEFAULT TRUE"), ("time_in", "TIMESTAMP")]:
            try: conn.execute(text(f"ALTER TABLE current_containers ADD COLUMN IF NOT EXISTS {col} {col_type}"))
            except: pass

        # Crane Movements
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS crane_movements (
                id SERIAL PRIMARY KEY,
                crane_id TEXT,
                unit_id TEXT,
                carrier_visit TEXT,
                move_kind TEXT,
                from_position TEXT,
                to_position TEXT,
                time_completed TIMESTAMP,
                line_op TEXT,
                ingestion_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        try: conn.execute(text("ALTER TABLE crane_movements ADD COLUMN IF NOT EXISTS ingestion_id INTEGER"))
        except: pass

        # Ingestion Logs
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ingestion_logs (
                id SERIAL PRIMARY KEY,
                filename TEXT,
                file_hash TEXT,
                dataset_type TEXT,
                status TEXT,
                records_total INTEGER,
                records_accepted INTEGER,
                records_rejected INTEGER,
                uploaded_by INTEGER,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                error_summary TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        for col, col_type in [
            ("file_hash", "TEXT"), ("records_total", "INTEGER"), 
            ("records_accepted", "INTEGER"), ("records_rejected", "INTEGER"), 
            ("uploaded_by", "INTEGER"), ("completed_at", "TIMESTAMP"), ("error_summary", "TEXT")
        ]:
            try: conn.execute(text(f"ALTER TABLE ingestion_logs ADD COLUMN IF NOT EXISTS {col} {col_type}"))
            except: pass

        # Rejection Logs
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rejection_logs (
                id SERIAL PRIMARY KEY,
                ingestion_id INTEGER,
                row_data TEXT,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

def init_auth_schema(engine):
    """Initialize authentication and audit tables."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS operational_requests (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                payload TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by_user TEXT
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                action TEXT NOT NULL,
                details TEXT,
                username TEXT,
                user_id INTEGER,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        try: conn.execute(text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id INTEGER"))
        except: pass

def init_training_metadata_schema(engine):
    """Initialize ML training metadata table."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS training_metadata (
                id SERIAL PRIMARY KEY,
                dataset_size INTEGER,
                last_trained_timestamp TIMESTAMP,
                data_source TEXT,
                training_type TEXT,
                status TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        
        # Feature Configs
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS feature_configs (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE,
                description TEXT,
                feature_names JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))
        
        # Model Versions
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS model_versions (
                id SERIAL PRIMARY KEY,
                model_name TEXT,
                version TEXT UNIQUE,
                artifact_path TEXT,
                feature_config_id INTEGER REFERENCES feature_configs(id),
                dataset_size INTEGER,
                metrics JSONB,
                status TEXT DEFAULT 'active',
                promoted_at TIMESTAMP,
                trained_at TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """))

# Load Data from Database
def load_from_db(dataset_type: str, vessel_id: str = None) -> pd.DataFrame:
    """Load data from simplified containers tables."""
    engine = get_engine()

    query = settings.LOAD_CONTAINERS_QUERY.format(dataset_type=dataset_type)

    params = {}
    if vessel_id:
        query += '\n          AND outbound_service = :vessel_id'
        params["vessel_id"] = vessel_id

    with engine.connect() as conn:
        df = pd.read_sql_query(text(query), conn, params=params)

    for col in ["move_complete_time", "time_in", "time_out", "created_at", "updated_at"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    return df.copy()