import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Database
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/portsystem").replace("@localhost", "@127.0.0.1")

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

    # Database Queries and Schemas
    DB_EXPECTED_COLUMNS = [
        "id", "actual_outbound_carrier_visit_id", "move_complete_time", 
        "time_in", "time_out", "unit_id", "ctr_from_position", 
        "ctr_to_position", "unit_weight_in_kg", "verified_gross_mass_kg", 
        "reefer", "hazardous_flag", "oog_unit", "port_of_discharge", 
        "created_at", "updated_at", "deleted_at"
    ]

    UPSERT_VESSELS_QUERY = """
        INSERT INTO "{dataset_type}_vessels" ("outbound_service", "created_at", "updated_at", "deleted_at")
        SELECT "outbound_service", "created_at", "updated_at", CAST("deleted_at" AS TIMESTAMP WITH TIME ZONE) FROM tmp_vessels 
        ON CONFLICT (outbound_service) DO UPDATE 
        SET updated_at = EXCLUDED.updated_at, deleted_at = NULL;
    """

    UPSERT_VISITS_QUERY = """
        INSERT INTO "{dataset_type}_visits" ("actual_outbound_carrier_visit_id", "outbound_service", "created_at", "updated_at", "deleted_at")
        SELECT "actual_outbound_carrier_visit_id", "outbound_service", "created_at", "updated_at", CAST("deleted_at" AS TIMESTAMP WITH TIME ZONE) FROM tmp_visits 
        ON CONFLICT (actual_outbound_carrier_visit_id) DO UPDATE 
        SET updated_at = EXCLUDED.updated_at, deleted_at = NULL;
    """

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

settings = Settings()
