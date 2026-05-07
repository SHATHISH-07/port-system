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


def init_canonical_schema(engine):
    """Initialize the new canonical entity-driven tables.
    These co-exist alongside legacy tables — no existing data is modified."""
    with engine.begin() as conn:

        # ── Organizational hierarchy ──────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS organizations (
                id          SERIAL PRIMARY KEY,
                name        VARCHAR(255) NOT NULL,
                code        VARCHAR(50)  UNIQUE NOT NULL,
                config      JSONB        DEFAULT '{}',
                is_active   BOOLEAN      DEFAULT TRUE,
                created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS terminals (
                id              SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
                name            VARCHAR(255) NOT NULL,
                code            VARCHAR(50)  NOT NULL,
                timezone        VARCHAR(100) DEFAULT 'UTC',
                config          JSONB        DEFAULT '{}',
                is_active       BOOLEAN      DEFAULT TRUE,
                created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (organization_id, code)
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS yards (
                id          SERIAL PRIMARY KEY,
                terminal_id INTEGER REFERENCES terminals(id) ON DELETE CASCADE,
                name        VARCHAR(255) NOT NULL,
                code        VARCHAR(50)  NOT NULL,
                layout_config JSONB      DEFAULT '{}',
                is_active   BOOLEAN      DEFAULT TRUE,
                created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (terminal_id, code)
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS berths (
                id          SERIAL PRIMARY KEY,
                terminal_id INTEGER REFERENCES terminals(id) ON DELETE CASCADE,
                name        VARCHAR(255) NOT NULL,
                code        VARCHAR(50)  NOT NULL,
                max_loa     NUMERIC,
                max_draft   NUMERIC,
                config      JSONB        DEFAULT '{}',
                is_active   BOOLEAN      DEFAULT TRUE,
                created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        # ── Source system management ──────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS source_profiles (
                id                  SERIAL PRIMARY KEY,
                terminal_id         INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
                name                VARCHAR(255) NOT NULL,
                description         TEXT,
                dataset_type        VARCHAR(100),
                alias_map           JSONB  DEFAULT '{}',
                datetime_formats    JSONB  DEFAULT '[]',
                detection_rules     JSONB  DEFAULT '{}',
                position_rules      JSONB  DEFAULT '{}',
                validation_rules    JSONB  DEFAULT '{}',
                transformation_rules JSONB DEFAULT '{}',
                is_active           BOOLEAN DEFAULT TRUE,
                created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS schema_mappings (
                id                SERIAL PRIMARY KEY,
                source_profile_id INTEGER REFERENCES source_profiles(id) ON DELETE CASCADE,
                raw_field         VARCHAR(255) NOT NULL,
                canonical_field   VARCHAR(255) NOT NULL,
                confidence        NUMERIC(5,2) DEFAULT 0,
                match_method      VARCHAR(50)  DEFAULT 'manual',
                is_confirmed      BOOLEAN      DEFAULT FALSE,
                confirmed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
                confirmed_at      TIMESTAMP WITH TIME ZONE,
                created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (source_profile_id, raw_field)
            );
        """))

        # ── Raw upload audit trail ────────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS raw_uploads (
                id                    SERIAL PRIMARY KEY,
                terminal_id           INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
                source_profile_id     INTEGER REFERENCES source_profiles(id) ON DELETE SET NULL,
                filename              VARCHAR(500),
                file_hash             VARCHAR(64),
                file_size_bytes       BIGINT,
                dataset_type_detected VARCHAR(100),
                detection_confidence  NUMERIC(5,2),
                status                VARCHAR(50) DEFAULT 'pending',
                uploaded_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
                raw_row_count         INTEGER,
                notes                 TEXT,
                created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ingestion_jobs (
                id               SERIAL PRIMARY KEY,
                raw_upload_id    INTEGER REFERENCES raw_uploads(id) ON DELETE CASCADE,
                status           VARCHAR(50) DEFAULT 'pending',
                records_total    INTEGER DEFAULT 0,
                records_success  INTEGER DEFAULT 0,
                records_failed   INTEGER DEFAULT 0,
                error_log        JSONB   DEFAULT '[]',
                mapping_snapshot JSONB   DEFAULT '{}',
                started_at       TIMESTAMP WITH TIME ZONE,
                completed_at     TIMESTAMP WITH TIME ZONE,
                created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        # ── Canonical operational entities ────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS canonical_vessel_visits (
                id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                terminal_id                 INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
                source_profile_id           INTEGER REFERENCES source_profiles(id) ON DELETE SET NULL,
                ingestion_job_id            INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
                canonical_vessel_visit_id   VARCHAR(255) UNIQUE NOT NULL,
                outbound_service            VARCHAR(255),
                time_in                     TIMESTAMP WITH TIME ZONE,
                time_out                    TIMESTAMP WITH TIME ZONE,
                status                      VARCHAR(50) DEFAULT 'active',
                dynamic_attributes          JSONB DEFAULT '{}',
                created_at                  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS canonical_containers (
                id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                terminal_id               INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
                vessel_visit_id           UUID REFERENCES canonical_vessel_visits(id) ON DELETE SET NULL,
                ingestion_job_id          INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
                canonical_unit_id         VARCHAR(255) NOT NULL,
                unit_weight_kg            NUMERIC,
                verified_gross_mass_kg    NUMERIC,
                reefer                    BOOLEAN DEFAULT FALSE,
                hazardous                 BOOLEAN DEFAULT FALSE,
                oog                       BOOLEAN DEFAULT FALSE,
                port_of_discharge         VARCHAR(255),
                ctr_from_position         VARCHAR(255),
                ctr_to_position           VARCHAR(255),
                move_complete_time        TIMESTAMP WITH TIME ZONE,
                time_in                   TIMESTAMP WITH TIME ZONE,
                time_out                  TIMESTAMP WITH TIME ZONE,
                dynamic_attributes        JSONB DEFAULT '{}',
                created_at                TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at                TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (terminal_id, canonical_unit_id, move_complete_time)
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS canonical_crane_moves (
                id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                terminal_id         INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
                ingestion_job_id    INTEGER REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
                canonical_crane_id  VARCHAR(255),
                canonical_unit_id   VARCHAR(255),
                carrier_visit        VARCHAR(255),
                move_kind           VARCHAR(50),
                from_position       VARCHAR(255),
                to_position         VARCHAR(255),
                time_completed      TIMESTAMP WITH TIME ZONE,
                line_op             VARCHAR(255),
                excluded            BOOLEAN DEFAULT FALSE,
                dynamic_attributes  JSONB DEFAULT '{}',
                created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS operational_events (
                id          SERIAL PRIMARY KEY,
                terminal_id INTEGER REFERENCES terminals(id) ON DELETE SET NULL,
                event_type  VARCHAR(100) NOT NULL,
                entity_type VARCHAR(100),
                entity_id   VARCHAR(255),
                payload     JSONB DEFAULT '{}',
                created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        # ── ML infrastructure ─────────────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS feature_configs (
                id                    SERIAL PRIMARY KEY,
                name                  VARCHAR(255) UNIQUE NOT NULL,
                description           TEXT,
                feature_names         JSONB NOT NULL DEFAULT '[]',
                preprocessing_config  JSONB DEFAULT '{}',
                is_active             BOOLEAN DEFAULT TRUE,
                created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS model_versions (
                id                SERIAL PRIMARY KEY,
                model_name        VARCHAR(255) NOT NULL,
                version           VARCHAR(50)  NOT NULL,
                artifact_path     VARCHAR(500) NOT NULL,
                feature_config_id INTEGER REFERENCES feature_configs(id) ON DELETE SET NULL,
                dataset_size      INTEGER,
                metrics           JSONB DEFAULT '{}',
                status            VARCHAR(50) DEFAULT 'candidate',
                notes             TEXT,
                trained_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                promoted_at       TIMESTAMP WITH TIME ZONE,
                created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (model_name, version)
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS system_configs (
                key         VARCHAR(255) PRIMARY KEY,
                value       JSONB        NOT NULL DEFAULT '{}',
                description TEXT,
                updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
                updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        # ── Indexes ───────────────────────────────────────────────────────────
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_canonical_containers_visit ON canonical_containers (vessel_visit_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_canonical_containers_terminal ON canonical_containers (terminal_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_canonical_crane_moves_terminal ON canonical_crane_moves (terminal_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_canonical_crane_moves_time ON canonical_crane_moves (time_completed);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_raw_uploads_terminal ON raw_uploads (terminal_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_upload ON ingestion_jobs (raw_upload_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_model_versions_name ON model_versions (model_name, status);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_schema_mappings_profile ON schema_mappings (source_profile_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_operational_events_terminal ON operational_events (terminal_id, event_type);"))

        # ── Seed default organization + terminal if not present ───────────────
        existing_org = conn.execute(
            text("SELECT id FROM organizations WHERE code = 'DEFAULT' LIMIT 1")
        ).fetchone()

        if not existing_org:
            org_row = conn.execute(text(
                "INSERT INTO organizations (name, code) VALUES ('PortSync Default', 'DEFAULT') RETURNING id"
            )).fetchone()
            org_id = org_row[0]

            term_row = conn.execute(text(
                "INSERT INTO terminals (organization_id, name, code, timezone) "
                "VALUES (:org_id, 'Primary Terminal', 'T001', 'Asia/Kolkata') RETURNING id"
            ), {"org_id": org_id}).fetchone()
            terminal_id = term_row[0]

            conn.execute(text(
                "INSERT INTO yards (terminal_id, name, code) VALUES (:tid, 'Main Yard', 'Y001')"
            ), {"tid": terminal_id})

            logger.info("[DB] Seeded default organization and terminal")

        logger.info("[DB] Canonical entity schema verified/initialized")

# Creates training_metadata table for tracking model training
def init_training_metadata_schema(engine):
    # Creates a single row table to store metadata about the last model training run
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
        # Index for retrieving the most recent training run
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_training_metadata_timestamp
            ON training_metadata (last_trained_timestamp DESC);
        """))
        logger.info("[DB] training_metadata schema verified/initialized")

def init_auth_schema(engine):
    with engine.begin() as conn:
        # Users Table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'user',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        # Requests Table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS requests (
                id SERIAL PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                payload TEXT,
                created_by INTEGER REFERENCES users(id),
                executed_by INTEGER REFERENCES users(id) NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))

        # Audit Logs Table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                action VARCHAR(255) NOT NULL,
                details TEXT,
                user_id INTEGER REFERENCES users(id) NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """))
        logger.info("[DB] auth and operations schema verified/initialized")
