import sys
import pandas as pd
from io import BytesIO
from datetime import datetime, timezone
from sqlalchemy import text
import hashlib
from db.connection import get_engine
from db.queries import init_simplified_schema, init_auth_schema, init_training_metadata_schema

sys.path.insert(0, '.')
engine = get_engine()

init_simplified_schema(engine)
init_auth_schema(engine)
init_training_metadata_schema(engine)

# Data files to ingest and their types
FILES = [
    ("data/synthetic_history_container_inventory.csv", "history"),
    ("data/synthetic_current_container_inventory.csv", "current"),
    ("data/synthetic_crane_moves.csv",                  "crane"),
]

# Normalize column names
def col_norm(c):
    c = str(c).lower().strip()
    c = c.replace(" ", "_").replace("-", "_")
    c = c.replace("(", "").replace(")", "")
    return c

# Map normalized columns to database column names
MAPPING = {
    "unit_id": "unit_id", "unit": "unit_id", "unit_nbr": "unit_id", "container_id": "unit_id",
    "actual_outbound_carrier_visit_id": "actual_outbound_carrier_visit_id",
    "actual_outbound_carrier_visit": "actual_outbound_carrier_visit_id",
    "vessel_visit_id": "actual_outbound_carrier_visit_id",
    "outbound_service": "outbound_service", "vessel": "outbound_service", "service": "outbound_service",
    "vessel_id": "outbound_service",
    "move_complete_time": "move_complete_time", "completed": "move_complete_time",
    "time_in": "time_in", "time_out": "time_out",
    "ctr_from_position": "ctr_from_position", "from_position": "ctr_from_position",
    "from": "ctr_from_position", "current_position": "ctr_from_position",
    "ctr_to_position": "ctr_to_position", "to_position": "ctr_to_position", "to": "ctr_to_position",
    "verified_gross_mass_kg": "verified_gross_mass_kg", "verified_gross_mass_kg_": "verified_gross_mass_kg",
    "vgm": "verified_gross_mass_kg", "gross_mass_kg": "verified_gross_mass_kg",
    "unit_weight_in_kg": "unit_weight_in_kg", "weight": "unit_weight_in_kg",
    "reefer": "reefer", "oog_unit": "oog_unit",
    "hazardous_flag": "hazardous_flag", "hazardous": "hazardous_flag",
    "port_of_discharge": "port_of_discharge",
    "crane_id": "crane_id", "crane_che": "crane_id", "crane": "crane_id",
    "move_kind": "move_kind", "kind": "move_kind", "event_type": "move_kind",
    "carrier_visit": "carrier_visit", "time_completed": "time_completed", "line_op": "line_op",
}

# Normalize columns
def normalize(df):
    # Normalize column names
    cols = [col_norm(c) for c in df.columns]
    df.columns = cols
    final_cols = []
    # Map normalized columns to database column names
    for col in cols:
        # Get the mapped column name, default to original if not found
        mapped = MAPPING.get(col, col)
        # Avoid duplicate column names
        if mapped in final_cols:
            suffix = 1
            while f"{mapped}_{suffix}" in final_cols:
                suffix += 1
            final_cols.append(f"{mapped}_{suffix}")
        # Append the mapped column name
        else:
            final_cols.append(mapped)
    df.columns = final_cols
    return df

# Safely convert values to the correct type
def safe_val(v):
    # If value is None, return None
    if v is None: return None
    # If value is NaN, return None
    try:
        if pd.isna(v): return None
    except: pass
    # If value is a Timestamp, convert it to a datetime object
    if isinstance(v, pd.Timestamp): return v.to_pydatetime()
    # Return the value
    return v
    
# Main ingestion loop
for fpath, dtype in FILES:
    print(f"\n{'='*60}")
    # Print the file path and dataset type
    print(f"Ingesting: {fpath}  [{dtype}]")
    try:
        # Read the CSV file
        df = pd.read_csv(fpath, low_memory=False)
    except FileNotFoundError:
        # If the file is not found, print an error message and continue to the next file
        print(f"Skipping {fpath} (file not found)")
        continue
    # Print the number of raw rows
    print(f"  Raw rows: {len(df)}")
    # Normalize columns
    df = normalize(df)
    # Drop rows with all NaN values
    df = df.dropna(how='all')
    # Define date columns based on dataset type
    date_cols = {
        "history": ["move_complete_time", "time_in", "time_out"],
        "current": ["move_complete_time", "time_in"],
        "crane":   ["time_completed"],
    }[dtype]
    # Convert date columns to datetime objects
    for col in date_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce', dayfirst=False)

    # Filter rows based on dataset type
    if dtype in ("history", "current"):
        before = len(df)
        # Filter out rows with missing unit_id
        df = df[df["unit_id"].notna() & (df["unit_id"].astype(str).str.strip() != "")]
        # Filter out rows with missing actual_outbound_carrier_visit_id
        df = df[df["actual_outbound_carrier_visit_id"].notna()]
        # Filter out rows with missing outbound_service
        df = df[df["outbound_service"].notna()]
        # Print the number of rows after filtering
        print(f"  After key-field filter: {len(df)} (dropped {before - len(df)})")
    # Filter rows for crane dataset type
    elif dtype == "crane":
        before = len(df)
        # Filter out rows with missing crane_id
        df = df[df["crane_id"].notna() & (df["crane_id"].astype(str).str.strip() != "")]
        # Filter out rows with missing carrier_visit
        df = df[df["carrier_visit"].notna()]
        # Print the number of rows after filtering
        print(f"  After key-field filter: {len(df)} (dropped {before - len(df)})")

    # Convert DataFrame to list of dictionaries
    records = df.to_dict('records')
    # Start a transaction
    with engine.begin() as conn:
        # Get current time in UTC
        now = datetime.now(timezone.utc)
        # Generate a hash for the file
        fhash = hashlib.sha256(fpath.encode()).hexdigest()[:16] + "_bulk"
        # Insert the ingestion log
        res = conn.execute(text("""
            INSERT INTO ingestion_logs
                (filename, file_hash, dataset_type, status, records_total,
                 records_accepted, records_rejected, uploaded_by, completed_at)
            VALUES (:fn, :h, :dtype, 'success', :total, :total, 0, 1, :now)
            RETURNING id
        """), {"fn": fpath, "h": fhash, "dtype": dtype, "total": len(records), "now": now})
        ingestion_id = res.fetchone()[0]
        
        # Initialize counters
        inserted = 0
        skipped  = 0

        # Process based on dataset type
        if dtype == "history":
            # Set batch size
            BATCH = 2000
            # Iterate over records in batches
            for i in range(0, len(records), BATCH):
                batch = records[i:i+BATCH]
                params = []
                # Prepare parameters for bulk insert
                for r in batch:
                    params.append({
                        "unit_id":                            safe_val(r.get("unit_id")),
                        "actual_outbound_carrier_visit_id":   safe_val(r.get("actual_outbound_carrier_visit_id")),
                        "outbound_service":                   safe_val(r.get("outbound_service")),
                        "move_complete_time":                 safe_val(r.get("move_complete_time")),
                        "time_in":                            safe_val(r.get("time_in")),
                        "time_out":                           safe_val(r.get("time_out")),
                        "ctr_from_position":                  safe_val(r.get("ctr_from_position")),
                        "ctr_to_position":                    safe_val(r.get("ctr_to_position")),
                        "verified_gross_mass_kg":             safe_val(r.get("verified_gross_mass_kg")),
                        "unit_weight_in_kg":                  safe_val(r.get("unit_weight_in_kg")),
                        "reefer":                             safe_val(r.get("reefer")),
                        "hazardous_flag":                     safe_val(r.get("hazardous_flag")),
                        "oog_unit":                           safe_val(r.get("oog_unit")),
                        "port_of_discharge":                  safe_val(r.get("port_of_discharge")),
                        "ingestion_id":                       ingestion_id,
                    })
                conn.execute(text("""
                    INSERT INTO history_containers
                        (unit_id, actual_outbound_carrier_visit_id, outbound_service,
                         move_complete_time, time_in, time_out, ctr_from_position,
                         ctr_to_position, verified_gross_mass_kg, unit_weight_in_kg,
                         reefer, hazardous_flag, oog_unit, port_of_discharge, ingestion_id)
                    VALUES
                        (:unit_id, :actual_outbound_carrier_visit_id, :outbound_service,
                         :move_complete_time, :time_in, :time_out, :ctr_from_position,
                         :ctr_to_position, :verified_gross_mass_kg, :unit_weight_in_kg,
                         :reefer, :hazardous_flag, :oog_unit, :port_of_discharge, :ingestion_id)
                """), params)
                inserted += len(params)
                print(f"    ... inserted {inserted}/{len(records)}", end="\r")
        
        # Process current dataset
        elif dtype == "current":
            # Process each record in the current dataset
            for r in records:
                try:
                    # Insert the record into the current_containers table
                    conn.execute(text("""
                        INSERT INTO current_containers
                            (unit_id, actual_outbound_carrier_visit_id, outbound_service,
                             ctr_from_position, ctr_to_position, move_complete_time, time_in,
                             reefer, hazardous_flag, port_of_discharge, ingestion_id,
                             is_active, updated_at)
                        VALUES
                            (:unit_id, :actual_outbound_carrier_visit_id, :outbound_service,
                             :ctr_from_position, :ctr_to_position, :move_complete_time, :time_in,
                             :reefer, :hazardous_flag, :port_of_discharge, :ingestion_id,
                             TRUE, CURRENT_TIMESTAMP)
                        ON CONFLICT (unit_id) DO UPDATE SET
                            actual_outbound_carrier_visit_id = EXCLUDED.actual_outbound_carrier_visit_id,
                            outbound_service                 = EXCLUDED.outbound_service,
                            ctr_from_position                = EXCLUDED.ctr_from_position,
                            ctr_to_position                  = EXCLUDED.ctr_to_position,
                            move_complete_time               = EXCLUDED.move_complete_time,
                            time_in                          = EXCLUDED.time_in,
                            reefer                           = EXCLUDED.reefer,
                            hazardous_flag                   = EXCLUDED.hazardous_flag,
                            port_of_discharge                = EXCLUDED.port_of_discharge,
                            ingestion_id                     = EXCLUDED.ingestion_id,
                            updated_at                       = CURRENT_TIMESTAMP
                    """), {
                        "unit_id":                           safe_val(r.get("unit_id")),
                        "actual_outbound_carrier_visit_id":  safe_val(r.get("actual_outbound_carrier_visit_id")),
                        "outbound_service":                  safe_val(r.get("outbound_service")),
                        "ctr_from_position":                 safe_val(r.get("ctr_from_position")),
                        "ctr_to_position":                   safe_val(r.get("ctr_to_position")),
                        "move_complete_time":                safe_val(r.get("move_complete_time")),
                        "time_in":                           safe_val(r.get("time_in")),
                        "reefer":                            safe_val(r.get("reefer")),
                        "hazardous_flag":                    safe_val(r.get("hazardous_flag")),
                        "port_of_discharge":                 safe_val(r.get("port_of_discharge")),
                        "ingestion_id":                      ingestion_id,
                    })
                    inserted += 1
                except Exception as e:
                    skipped += 1
        
        # Process crane dataset
        elif dtype == "crane":
            # Set batch size
            BATCH = 2000
            # Iterate over records in batches
            for i in range(0, len(records), BATCH):
                batch = records[i:i+BATCH]
                params = []
                # Prepare parameters for bulk insert
                for r in batch:
                    params.append({
                        "crane_id":       safe_val(r.get("crane_id")),
                        "unit_id":        safe_val(r.get("unit_id")),
                        "carrier_visit":  safe_val(r.get("carrier_visit")),
                        "move_kind":      safe_val(r.get("move_kind")),
                        "from_position":  safe_val(r.get("ctr_from_position")),
                        "to_position":    safe_val(r.get("ctr_to_position")),
                        "time_completed": safe_val(r.get("time_completed")),
                        "line_op":        safe_val(r.get("line_op")),
                        "ingestion_id":   ingestion_id,
                    })
                # Insert the batch into the crane_movements table
                conn.execute(text("""
                    INSERT INTO crane_movements
                        (crane_id, unit_id, carrier_visit, move_kind,
                         from_position, to_position, time_completed, line_op, ingestion_id)
                    VALUES
                        (:crane_id, :unit_id, :carrier_visit, :move_kind,
                         :from_position, :to_position, :time_completed, :line_op, :ingestion_id)
                """), params)
                inserted += len(params)
                print(f"    ... inserted {inserted}/{len(records)}", end="\r")
    
    # Print the final count
    print(f"\n  Done: {inserted} inserted, {skipped} skipped")

print("\n\nAll ingestion complete. Verifying counts...")
# Connect to the database and verify the counts
with engine.connect() as conn:
    for tbl in ["history_containers", "current_containers", "crane_movements"]:
        c = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
        print(f"  {tbl}: {c}")