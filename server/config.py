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

    # Fixed Schemas (Expected Headers)
    EXPECTED_HEADERS = {
        "history": [
            "unit_id", "outbound_service", "actual_outbound_carrier_visit_id",
            "ctr_from_position", "ctr_to_position", "move_complete_time",
            "time_in", "time_out", "hazardous_flag", "reefer", "oog_unit", 
            "verified_gross_mass_kg", "unit_weight_in_kg", "port_of_discharge"
        ],
        "current": [
            "unit_id", "outbound_service", "actual_outbound_carrier_visit_id",
            "ctr_from_position", "ctr_to_position", "move_complete_time", "time_in",
            "hazardous_flag", "reefer", "oog_unit", "verified_gross_mass_kg",
            "port_of_discharge"
        ],
        "crane": [
            "crane_id", "unit_id", "carrier_visit", "move_kind",
            "from_position", "to_position", "time_completed", "line_op"
        ]
    }

    # Model Training Constants
    MODEL_PATH = os.getenv("MODEL_PATH", "models/stay_model.pkl")
    TRAIN_MIN_HOURS = 2
    TRAIN_MAX_HOURS = 240
    MIN_VISIT_ROWS = 5
    VESSEL_WINDOW_HOURS = 96

    # Features used by the model
    FEATURE_NAMES = [
        "loaded", "discharged", "total_moves", "imbalance", "load_ratio",
        "discharge_ratio", "container_count", "avg_weight", "heavy_count",
        "reefer_count", "hazard_count", "oog_count", "service_hash",
        "move_span_hours", "restow_intensity", "block_concentration"
    ]

    # Automated Retraining
    RETRAIN_THRESHOLD_NEW_RECORDS = int(os.getenv("RETRAIN_THRESHOLD_NEW_RECORDS", "1000"))
    RETRAIN_CHECK_INTERVAL_SECONDS = int(os.getenv("RETRAIN_CHECK_INTERVAL_SECONDS", "60"))

    # Queries
    LOAD_CONTAINERS_QUERY = "SELECT * FROM {dataset_type}_containers WHERE 1=1"
    LOAD_CRANE_MOVES_QUERY = "SELECT * FROM crane_movements ORDER BY time_completed DESC"
    
    INSERT_TRAINING_METADATA_QUERY = """
        INSERT INTO training_metadata 
            (dataset_size, last_trained_timestamp, data_source, training_type, status, notes)
        VALUES 
            (:size, :ts, :source, :ttype, :status, :notes)
        RETURNING id
    """
    
    GET_LATEST_TRAINING_METADATA_QUERY = """
        SELECT * FROM training_metadata 
        WHERE status = 'completed' 
        ORDER BY last_trained_timestamp DESC LIMIT 1
    """
    
    GET_TRAINING_METADATA_HISTORY_QUERY = """
        SELECT * FROM training_metadata 
        ORDER BY last_trained_timestamp DESC LIMIT :lim
    """

settings = Settings()