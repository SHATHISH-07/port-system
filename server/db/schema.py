from sqlalchemy import text
import logging

logger = logging.getLogger("port_system")

def init_dataset_schema(engine, dataset_type: str):
    with engine.begin() as conn:
        # Vessels Table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{dataset_type}_vessels" (
                outbound_service VARCHAR(255) PRIMARY KEY,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE NULL
            );
        """))
        
        # Visits Table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{dataset_type}_visits" (
                actual_outbound_carrier_visit_id VARCHAR(255) PRIMARY KEY,
                outbound_service VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE NULL,
                CONSTRAINT fk_{dataset_type}_vessel FOREIGN KEY (outbound_service) 
                    REFERENCES "{dataset_type}_vessels" (outbound_service) ON DELETE CASCADE
            );
        """))
        
        # Containers Table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{dataset_type}_containers" (
                id UUID PRIMARY KEY,
                actual_outbound_carrier_visit_id VARCHAR(255) NOT NULL,
                move_complete_time TIMESTAMP WITH TIME ZONE,
                time_in TIMESTAMP WITH TIME ZONE,
                time_out TIMESTAMP WITH TIME ZONE,
                unit_id VARCHAR(255),
                ctr_from_position VARCHAR(255),
                ctr_to_position VARCHAR(255),
                unit_weight_in_kg NUMERIC,
                verified_gross_mass_kg NUMERIC,
                reefer VARCHAR(10),
                hazardous_flag VARCHAR(10),
                oog_unit VARCHAR(10),
                port_of_discharge VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE NULL,
                CONSTRAINT fk_{dataset_type}_visit FOREIGN KEY (actual_outbound_carrier_visit_id) 
                    REFERENCES "{dataset_type}_visits" (actual_outbound_carrier_visit_id) ON DELETE CASCADE,
                CONSTRAINT unique_container_{dataset_type} UNIQUE (actual_outbound_carrier_visit_id, unit_id)
            );
        """))

        # Indexes
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{dataset_type}_visits_service ON "{dataset_type}_visits" (outbound_service);'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS idx_{dataset_type}_containers_visit ON "{dataset_type}_containers" (actual_outbound_carrier_visit_id);'))
        
        logger.info(f"[DB] Schema verified/initialized for dataset type: {dataset_type}")


def init_training_metadata_schema(engine):
    """
    Creates the `training_metadata` table if it does not exist.
    Stores one row per completed training run.
    """
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS training_metadata (
                id                      SERIAL PRIMARY KEY,
                last_trained_dataset_size INTEGER NOT NULL,
                last_trained_timestamp  TIMESTAMP WITH TIME ZONE NOT NULL,
                data_source             VARCHAR(50)  DEFAULT 'db',
                training_type           VARCHAR(50)  DEFAULT 'manual',
                status                  VARCHAR(50)  DEFAULT 'completed',
                notes                   TEXT         NULL,
                created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at              TIMESTAMP WITH TIME ZONE NULL
            );
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_training_metadata_timestamp
            ON training_metadata (last_trained_timestamp DESC);
        """))
        logger.info("[DB] training_metadata schema verified/initialized")