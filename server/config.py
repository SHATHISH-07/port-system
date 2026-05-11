from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Database
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@127.0.0.1:5432/portsystem",
    ).replace("@localhost", "@127.0.0.1")

    # Authentication
    JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-for-portsync")
    JWT_ALGORITHM = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
    DEFAULT_ADMIN_USER = os.getenv("DEFAULT_ADMIN_USER", "admin")
    DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")

    # Expected schema columns per dataset type
    # - history/current use ctr_from_position / ctr_to_position
    # - crane uses from_position / to_position (matching crane_movements schema)
    # - event_type is kept separate from move_kind
    EXPECTED_HEADERS: dict[str, list[str]] = {
        "history": [
            "unit_id",
            "outbound_service",
            "actual_outbound_carrier_visit_id",
            "ctr_from_position",
            "ctr_to_position",
            "move_complete_time",
            "time_in",
            "time_out",
            "hazardous_flag",
            "reefer",
            "oog_unit",
            "verified_gross_mass_kg",
            "unit_weight_in_kg",
            "port_of_discharge",
            "unit_visit_gkey",
            "category_id",
            "equipment_class",
            "container_length",
            "equipment_type",
            "freight_kind",
            "inbound_service",
            "arrival_mode",
            "stow_code_1",
            "stow_code_2",
            "stow_code_3",
            "imdg_code",
            "hazard_un_numbers",
        ],
        "current": [
            "unit_id",
            "outbound_service",
            "actual_outbound_carrier_visit_id",
            "ctr_from_position",
            "ctr_to_position",
            "move_complete_time",
            "time_in",
            "visit_state",
            "transit_state",
            "hazardous_flag",
            "reefer",
            "oog_unit",
            "verified_gross_mass_kg",
            "port_of_discharge",
            "unit_visit_gkey",
            "category_id",
            "equipment_class",
            "container_length",
            "equipment_type",
            "freight_kind",
            "inbound_service",
            "arrival_mode",
            "stow_code_1",
            "stow_code_2",
            "stow_code_3",
            "imdg_code",
            "hazard_un_numbers",
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
        ],
    }

    # Required columns per dataset type
    REQUIRED_COLS_BY_TYPE: dict[str, list[str]] = {
        "history": [
            "unit_id",
            "outbound_service",
            "actual_outbound_carrier_visit_id",
        ],
        "current": [
            "unit_id",
            "outbound_service",
            "actual_outbound_carrier_visit_id",
        ],
        "crane": [
            "crane_id",
            "unit_id",
            "carrier_visit",
            "move_kind",
            "from_position",
            "to_position",
            "time_completed",
        ],
    }

    # Backward-compatible fallback
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
        "move_span_hours",
        "restow_intensity",
        "block_concentration",
        "crane_count",
        "crane_mphc",
        "crane_intensity",
        "crane_duration_hours",
        "crane_restow_ratio",
        "crane_exclude_ratio",
        "reefer_equipment_ratio",
        "pct_40ft",
        "avg_weight_kg",
        "heavy_ratio",
    ]

    # Automated retraining
    RETRAIN_THRESHOLD_NEW_RECORDS = int(
        os.getenv("RETRAIN_THRESHOLD_NEW_RECORDS", "1000")
    )
    RETRAIN_CHECK_INTERVAL_SECONDS = int(
        os.getenv("RETRAIN_CHECK_INTERVAL_SECONDS", "60")
    )

    # Query templates
    LOAD_CONTAINERS_QUERY = "SELECT * FROM {dataset_type}_containers WHERE 1=1"
    LOAD_CRANE_MOVES_QUERY = (
        "SELECT * FROM crane_movements ORDER BY time_completed DESC"
    )

    # Training metadata table queries
    INSERT_TRAINING_METADATA_QUERY = """
        INSERT INTO training_metadata
            (dataset_size, last_trained_timestamp, data_source, training_type, status, notes)
        VALUES
            (:size, :ts, :source, :ttype, :status, :notes)
        RETURNING id
    """
    # Get latest completed training metadata
    GET_LATEST_TRAINING_METADATA_QUERY = """
        SELECT * FROM training_metadata
        WHERE status = 'completed'
        ORDER BY last_trained_timestamp DESC LIMIT 1
    """

    # Get training metadata history
    GET_TRAINING_METADATA_HISTORY_QUERY = """
        SELECT * FROM training_metadata
        ORDER BY last_trained_timestamp DESC LIMIT :lim
    """

    # --- Berth analysis thresholds ---
    BERTH_HIGH_RISK_SHARE_PCT: float = 40.0
    BERTH_HIGH_RISK_MOVES: int = 60
    BERTH_MEDIUM_RISK_SHARE_PCT: float = 20.0
    BERTH_MEDIUM_RISK_MOVES: int = 30
    BERTH_TOP_N: int = 5
    BERTH_CRANE_MOVES_PER_HOUR: int = 20

    # --- Risk flags ---
    RISK_HIGH_LOAD_THRESHOLD: int = 250
    RISK_HAZARDOUS_THRESHOLD: int = 10
    RISK_REEFER_THRESHOLD: int = 20
    RISK_EXTENDED_STAY_HOURS: float = 40.0

    # --- Crane analytics ---
    CRANE_MOVES_PER_HOUR_TARGET: int = 25
    CRANE_MAX_CRANES_DISPLAY: int = 6
    CRANE_IDLE_THRESHOLD_MINUTES: int = 30
    CRANE_EFFICIENCY_ROLLING_WINDOW: int = 10
    CRANE_PERFORMANCE_LIMIT: int = 1000
    CRANE_ANALYTICS_WINDOW_DAYS: int = 90
    CRANE_HASH_PARTITIONS: int = 8

    # --- Database Config ---
    HISTORY_PARTITION_MONTHS_AHEAD: int = 3
    HISTORY_PARTITION_KEY: str = "time_in"
    HISTORY_LOAD_WINDOW_DAYS: int = 180

    # --- Stay prediction ---
    MOVES_PER_HOUR_PER_CRANE: float = 25.0
    DEFAULT_AVG_WEIGHT_KG: float = 15000.0
    DEFAULT_REEFER_RATIO: float = 0.1
    DEFAULT_HAZARD_RATIO: float = 0.05
    DEFAULT_OOG_RATIO: float = 0.02

    # --- Berth labels (for manual prediction fallback) ---
    BERTH_HIGH_VOLUME_THRESHOLD: int = 1000
    BERTH_MED_VOLUME_THRESHOLD: int = 500
    BERTH_HIGH_LABEL: str = "PEB-1"
    BERTH_MED_LABEL: str = "PEB-2"
    BERTH_LOW_LABEL: str = "PEB-3"

settings = Settings()
