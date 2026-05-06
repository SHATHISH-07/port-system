import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Database
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/portsystem").replace("@localhost", "@127.0.0.1")

    # Authentication & Admin
    JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-for-portsync")
    JWT_ALGORITHM = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days
    DEFAULT_ADMIN_USER = os.getenv("DEFAULT_ADMIN_USER", "admin")
    DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")

    # Data Loading
    REQUIRED_COLS = [
        "move_complete_time",
        "time_in",
        "time_out",
        "outbound_service",
        "actual_outbound_carrier_visit_id",
        "unit_id"
    ]

    # Model Training Constants
    MODEL_PATH = os.getenv("MODEL_PATH", "models/stay_model.pkl")
    TRAIN_MIN_HOURS = 2     # Ignore stays shorter than 2 hours (noise)
    TRAIN_MAX_HOURS = 240   # Ignore stays longer than 240 hours (outliers)
    MIN_VISIT_ROWS = 5      # Ignore visits with fewer than 5 rows
    VESSEL_WINDOW_HOURS = 96 # Vessel stay window

    # Features used by the model
    FEATURE_NAMES = [
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
    ]

    # Automated Retraining
    RETRAIN_THRESHOLD_NEW_RECORDS = int(os.getenv("RETRAIN_THRESHOLD_NEW_RECORDS", "1000"))
    RETRAIN_CHECK_INTERVAL_SECONDS = int(os.getenv("RETRAIN_CHECK_INTERVAL_SECONDS", "60"))

    # Database Queries and Schemas
    DB_EXPECTED_COLUMNS = [
        "id", "actual_outbound_carrier_visit_id", "move_complete_time", 
        "time_in", "time_out", "unit_id", "ctr_from_position", 
        "ctr_to_position", "unit_weight_in_kg", "verified_gross_mass_kg", 
        "reefer", "hazardous_flag", "oog_unit", "port_of_discharge", 
        "created_at", "updated_at", "deleted_at"
    ]

    # Upsert vessels query
    UPSERT_VESSELS_QUERY = """
        INSERT INTO "{dataset_type}_vessels" ("outbound_service", "created_at", "updated_at", "deleted_at")
        SELECT "outbound_service", "created_at", "updated_at", CAST("deleted_at" AS TIMESTAMP WITH TIME ZONE) FROM tmp_vessels 
        ON CONFLICT (outbound_service) DO UPDATE 
        SET updated_at = EXCLUDED.updated_at, deleted_at = NULL;
    """

    # Upsert visits query
    UPSERT_VISITS_QUERY = """
        INSERT INTO "{dataset_type}_visits" ("actual_outbound_carrier_visit_id", "outbound_service", "created_at", "updated_at", "deleted_at")
        SELECT "actual_outbound_carrier_visit_id", "outbound_service", "created_at", "updated_at", CAST("deleted_at" AS TIMESTAMP WITH TIME ZONE) FROM tmp_visits 
        ON CONFLICT (actual_outbound_carrier_visit_id) DO UPDATE 
        SET updated_at = EXCLUDED.updated_at, deleted_at = NULL;
    """

    # Upsert containers query
    UPSERT_CONTAINERS_QUERY = """
        INSERT INTO "{dataset_type}_containers" (
            "id", "actual_outbound_carrier_visit_id", "move_complete_time", 
            "time_in", "time_out", "unit_id", "ctr_from_position", 
            "ctr_to_position", "unit_weight_in_kg", "verified_gross_mass_kg", 
            "reefer", "hazardous_flag", "oog_unit", "port_of_discharge", 
            "created_at", "updated_at", "deleted_at"
        )
        SELECT 
            CAST("id" AS UUID), "actual_outbound_carrier_visit_id", CAST("move_complete_time" AS TIMESTAMP WITH TIME ZONE), 
            CAST("time_in" AS TIMESTAMP WITH TIME ZONE), CAST("time_out" AS TIMESTAMP WITH TIME ZONE), "unit_id", "ctr_from_position", 
            "ctr_to_position", "unit_weight_in_kg", "verified_gross_mass_kg", 
            "reefer", "hazardous_flag", "oog_unit", "port_of_discharge", 
            "created_at", "updated_at", CAST("deleted_at" AS TIMESTAMP WITH TIME ZONE) 
        FROM tmp_containers 
        ON CONFLICT (actual_outbound_carrier_visit_id, unit_id) DO UPDATE 
        SET 
            move_complete_time = EXCLUDED.move_complete_time,
            time_in = EXCLUDED.time_in,
            time_out = EXCLUDED.time_out,
            ctr_from_position = EXCLUDED.ctr_from_position,
            ctr_to_position = EXCLUDED.ctr_to_position,
            unit_weight_in_kg = EXCLUDED.unit_weight_in_kg,
            verified_gross_mass_kg = EXCLUDED.verified_gross_mass_kg,
            reefer = EXCLUDED.reefer,
            hazardous_flag = EXCLUDED.hazardous_flag,
            oog_unit = EXCLUDED.oog_unit,
            port_of_discharge = EXCLUDED.port_of_discharge,
            updated_at = EXCLUDED.updated_at,
            deleted_at = NULL;
    """

    # Load containers query
    LOAD_CONTAINERS_QUERY = """
        SELECT 
            c.*,
            v.outbound_service
        FROM "{dataset_type}_containers" c
        JOIN "{dataset_type}_visits" v 
          ON c.actual_outbound_carrier_visit_id = v.actual_outbound_carrier_visit_id
        JOIN "{dataset_type}_vessels" ve 
          ON v.outbound_service = ve.outbound_service
        WHERE c.deleted_at IS NULL 
          AND v.deleted_at IS NULL
          AND ve.deleted_at IS NULL
    """

    # Training metadata queries
    INSERT_TRAINING_METADATA_QUERY = """
        INSERT INTO training_metadata
            (last_trained_dataset_size, last_trained_timestamp,
             data_source, training_type, status, notes,
             created_at, updated_at)
        VALUES
            (:size, :ts, :source, :ttype, :status, :notes,
             :created, :updated)
        RETURNING id, last_trained_dataset_size, last_trained_timestamp,
                  data_source, training_type, status, notes,
                  created_at, updated_at, deleted_at
    """

    GET_LATEST_TRAINING_METADATA_QUERY = """
        SELECT id, last_trained_dataset_size, last_trained_timestamp,
               data_source, training_type, status, notes,
               created_at, updated_at, deleted_at
        FROM training_metadata
        WHERE deleted_at IS NULL
        ORDER BY last_trained_timestamp DESC
        LIMIT 1
    """

    GET_TRAINING_METADATA_HISTORY_QUERY = """
        SELECT id, last_trained_dataset_size, last_trained_timestamp,
               data_source, training_type, status, notes,
               created_at, updated_at, deleted_at
        FROM training_metadata
        WHERE deleted_at IS NULL
        ORDER BY last_trained_timestamp DESC
        LIMIT :lim
    """

settings = Settings()
