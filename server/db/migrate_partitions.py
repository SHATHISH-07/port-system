import logging
from sqlalchemy import text
import sys
import os

# Add server directory to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.connection import get_engine
from config import settings
from db.queries import ensure_history_partitions

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("port_system")

def run_migration(engine):
    with engine.begin() as conn:
        # Check if already migrated
        result = conn.execute(text(
            "SELECT relkind FROM pg_class WHERE relname = 'history_containers'"
        )).fetchone()
        
        if result and result[0] == 'p':
            logger.info("history_containers already partitioned — skipping migration")
            return
        
        if result and result[0] == 'r':
            # Still a plain table — safe to proceed
            logger.info("Starting partition migration for history_containers...")
            
            # Step 1: Rename the existing table
            conn.execute(text("ALTER TABLE history_containers RENAME TO history_containers_legacy;"))
            
            # Step 2: Create the partitioned parent
            conn.execute(text("""
                CREATE TABLE history_containers (
                    id                               SERIAL,
                    unit_id                          TEXT,
                    outbound_service                 TEXT,
                    actual_outbound_carrier_visit_id TEXT,
                    facility_id                      TEXT,
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

    # Need to commit the parent table creation before ensuring partitions
    # Step 3: Create monthly child partitions
    logger.info("Ensuring partitions exist...")
    ensure_history_partitions()
    
    with engine.begin() as conn:
        # Step 4: Migrate data from legacy table
        logger.info("Migrating history_containers data...")
        # Get actual columns existing in legacy table to build the insert
        columns_res = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'history_containers_legacy'
        """)).fetchall()
        legacy_cols = [r[0] for r in columns_res]
        
        # Build the select list, substituting time_in
        select_cols = []
        for col in legacy_cols:
            if col == 'time_in':
                select_cols.append("COALESCE(time_in, move_complete_time, time_out, created_at) AS time_in")
            else:
                select_cols.append(col)
        
        insert_cols = ", ".join(legacy_cols)
        select_query = ", ".join(select_cols)
        
        # null-safe insert
        conn.execute(text(f"""
            INSERT INTO history_containers ({insert_cols})
            SELECT {select_query}
            FROM history_containers_legacy
            WHERE COALESCE(time_in, move_complete_time, time_out, created_at) IS NOT NULL;
        """))

        # Log rejected rows (all time columns null) into rejection_logs before dropping legacy
        conn.execute(text("""
            INSERT INTO rejection_logs (ingestion_id, row_data, reason)
            SELECT 
                ingestion_id,
                row_to_json(h)::text,
                'Migration rejected: all time columns null — cannot assign to partition'
            FROM history_containers_legacy h
            WHERE COALESCE(time_in, move_complete_time, time_out, created_at) IS NULL;
        """))

        # Step 5: Drop legacy
        conn.execute(text("DROP TABLE history_containers_legacy;"))
        logger.info("history_containers migration complete.")

        # Now migrate crane_movements
        logger.info("Starting partition migration for crane_movements...")
        res_cm = conn.execute(text("SELECT relkind FROM pg_class WHERE relname = 'crane_movements'")).fetchone()
        if res_cm and res_cm[0] == 'r':
            conn.execute(text("ALTER TABLE crane_movements RENAME TO crane_movements_legacy;"))
            conn.execute(text("""
                CREATE TABLE crane_movements (
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
                    ingestion_id   INTEGER,
                    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) PARTITION BY HASH (carrier_visit);
            """))
            for i in range(settings.CRANE_HASH_PARTITIONS):
                conn.execute(text(f"CREATE TABLE crane_movements_p{i} PARTITION OF crane_movements FOR VALUES WITH (MODULUS {settings.CRANE_HASH_PARTITIONS}, REMAINDER {i});"))

            cm_cols_res = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'crane_movements_legacy'
            """)).fetchall()
            cm_legacy_cols = [r[0] for r in cm_cols_res]
            cm_insert_cols = ", ".join(cm_legacy_cols)
            
            # For crane_movements, carrier_visit is NOT NULL. Drop rows with null carrier_visit or migrate them to a default.
            # The prompt says partition by hash carrier_visit. Null partition key will fail hash partition unless we have a null partition or drop.
            # Let's use COALESCE(carrier_visit, 'UNKNOWN')
            cm_select_cols = []
            for col in cm_legacy_cols:
                if col == 'carrier_visit':
                    cm_select_cols.append("COALESCE(carrier_visit, 'UNKNOWN') AS carrier_visit")
                else:
                    cm_select_cols.append(col)
            cm_select_query = ", ".join(cm_select_cols)

            conn.execute(text(f"""
                INSERT INTO crane_movements ({cm_insert_cols})
                SELECT {cm_select_query} FROM crane_movements_legacy;
            """))
            conn.execute(text("DROP TABLE crane_movements_legacy;"))
            logger.info("crane_movements migration complete.")

        # Recreate indexes
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_service_visit ON history_containers (outbound_service, actual_outbound_carrier_visit_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_time_in ON history_containers (time_in DESC NULLS LAST);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_facility ON history_containers (facility_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_category ON history_containers (category_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_hazardous ON history_containers (hazardous_flag) WHERE hazardous_flag = 'Yes';"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hc_reefer ON history_containers (reefer) WHERE reefer = 'Yes';"))
        
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cm_carrier_visit ON crane_movements (carrier_visit);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cm_crane_time ON crane_movements (crane_id, time_completed DESC NULLS LAST);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cm_exclude ON crane_movements (exclude) WHERE exclude = 'No';"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cm_move_kind ON crane_movements (move_kind);"))

        logger.info("All indexes created.")

if __name__ == "__main__":
    engine = get_engine()
    run_migration(engine)
