from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@127.0.0.1:5432/portsystem",
    ).replace("@localhost", "@127.0.0.1")

    # ── Authentication ───────────────────────────────────────────────────────
    JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-for-portsync")
    JWT_ALGORITHM = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
    DEFAULT_ADMIN_USER = os.getenv("DEFAULT_ADMIN_USER", "admin")
    DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")

    # ── Expected schema columns per dataset type ─────────────────────────────
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

    # ── Required columns per dataset type ────────────────────────────────────
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

    # ── Model training ───────────────────────────────────────────────────────
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
        "reefer_equipment_ratio",
        "pct_40ft",
        "avg_weight_kg",
        "heavy_ratio",
    ]

    # ── Automated retraining ─────────────────────────────────────────────────
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

    # ── Berth analysis thresholds ────────────────────────────────────────────
    BERTH_HIGH_RISK_SHARE_PCT = 40.0
    BERTH_HIGH_RISK_MOVES = 60
    BERTH_MEDIUM_RISK_SHARE_PCT = 20.0
    BERTH_MEDIUM_RISK_MOVES = 30
    BERTH_TOP_N = 5
    BERTH_CRANE_MOVES_PER_HOUR = 20

    # ── Risk flags ───────────────────────────────────────────────────────────
    RISK_HIGH_LOAD_THRESHOLD = 250
    RISK_HAZARDOUS_THRESHOLD = 10
    RISK_REEFER_THRESHOLD = 20
    RISK_EXTENDED_STAY_HOURS = 40.0

    # ── Crane analytics ───────────────────────────────────────────────────────
    CRANE_MOVES_PER_HOUR_TARGET = 25
    CRANE_MAX_CRANES_DISPLAY = 6
    CRANE_IDLE_THRESHOLD_MINUTES = 30
    CRANE_EFFICIENCY_ROLLING_WINDOW = 10
    CRANE_PERFORMANCE_LIMIT = 1000
    CRANE_ANALYTICS_WINDOW_DAYS = 90
    CRANE_HASH_PARTITIONS = 8

    # ── Database config ───────────────────────────────────────────────────────
    HISTORY_PARTITION_MONTHS_AHEAD = 3
    HISTORY_PARTITION_KEY = "time_in"
    HISTORY_LOAD_WINDOW_DAYS = 0

    # ── Stay prediction defaults ─────────────────────────────────────────────
    MOVES_PER_HOUR_PER_CRANE = 25.0
    DEFAULT_AVG_WEIGHT_KG = 15000.0
    DEFAULT_REEFER_RATIO = 0.1
    DEFAULT_HAZARD_RATIO = 0.05
    DEFAULT_OOG_RATIO = 0.02

    # ── Berth labels ─────────────────────────────────────────────────────────
    BERTH_HIGH_VOLUME_THRESHOLD = 1000
    BERTH_MED_VOLUME_THRESHOLD = 500
    BERTH_HIGH_LABEL = "PEB-1"
    BERTH_MED_LABEL = "PEB-2"
    BERTH_LOW_LABEL = "PEB-3"


settings = Settings()