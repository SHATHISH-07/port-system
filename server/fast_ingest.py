import os
import glob
import pandas as pd
from sqlalchemy import text
from db.connection import get_engine
from utils.position_parser import get_yard_id
from db.queries import ensure_yard_tables
from config import settings
from utils.datetime_utils import parse_datetime

# Map CSV column variations to our standard schema column names
MAPPING = {
    # Crane-specific
    "crane che": "crane_id",
    "che_id": "crane_id",
    "che id": "crane_id",
    "crane": "crane_id",
    "che_kind": "crane_kind",
    "visit_id": "carrier_visit",
    "vessel_visit": "carrier_visit",
    "carrier visit": "carrier_visit",
    "time completed": "time_completed",
    "event type": "event_type",
    "move kind": "move_kind",
    "unit category": "unit_category",
    "unit nbr": "unit_id",
    "from position": "from_position",
    "to position": "to_position",
    "line op": "line_op",
    "actual_outbound_carrier_visit": "actual_outbound_carrier_visit_id",
    "from_pos": "from_position",
    "to_pos": "to_position",
    # Container-specific
    "unit id": "unit_id",
    "unit_nbr": "unit_id",
    "facility id": "facility_id",
    "category id": "category_id",
    "equipment class": "equipment_class",
    "container length": "container_length",
    "equipment type": "equipment_type",
    "freight kind": "freight_kind",
    "unit weight in kg": "unit_weight_in_kg",
    "verified gross mass (kg)": "verified_gross_mass_kg",
    "hazardous flag": "hazardous_flag",
    "hazard un numbers": "hazard_un_numbers",
    "imdg code": "imdg_code",
    "stow code 1": "stow_code_1",
    "stow code 2": "stow_code_2",
    "stow code 3": "stow_code_3",
    "port of discharge": "port_of_discharge",
    "actual inbound carrier visit id": "actual_inbound_carrier_visit_id",
    "inbound service": "inbound_service",
    "actual outbound carrier visit id": "actual_outbound_carrier_visit_id",
    "outbound service": "outbound_service",
    "arrival mode": "arrival_mode",
    "current position": "current_position",
    "visit state": "visit_state",
    "transit state": "transit_state",
    "time out": "time_out",
    "time in": "time_in",
    "move complete time": "move_complete_time",
    "ctr from position": "ctr_from_position",
    "ctr to position": "ctr_to_position",
    "oog unit": "oog_unit",
    "unit visit gkey": "unit_visit_gkey",
    "yard id": "yard_id",
}

# Columns that belong in each table type
CRANE_COLS = [
    "crane_id", "unit_id", "carrier_visit", "event_type", "move_kind",
    "from_position", "to_position", "time_completed", "line_op",
    "unit_category", "exclude", "yard_id"
]

HISTORY_COLS = list(dict.fromkeys(
    settings.EXPECTED_HEADERS.get("history", []) + ["yard_id", "facility_id", "outbound_service"]
))
CURRENT_COLS = list(dict.fromkeys(
    settings.EXPECTED_HEADERS.get("current", []) + ["yard_id", "visit_state", "transit_state", "is_active"]
))


def _get_yard_for_crane_row(row) -> str | None:
    """For crane rows, extract yard from from_position or to_position dynamically."""
    for field in ["from_position", "to_position"]:
        val = row.get(field)
        if val and isinstance(val, str):
            vu = val.upper()
            if vu.startswith("Y-") and "-" in vu[2:]:
                parts = val.split("-")
                if len(parts) >= 3:
                    return parts[1].upper()
    return None


def ingest_file(engine, file_path, dataset_type):
    print(f"Ingesting {file_path} as {dataset_type}...")
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path, low_memory=False)
    elif file_path.endswith('.json'):
        df = pd.read_json(file_path)
    else:
        return

    # Normalize column names: lowercase + strip, then map to schema names
    df.columns = [c.lower().strip() for c in df.columns]
    df.rename(columns=MAPPING, inplace=True)

    # Parse datetime columns
    for col in ["move_complete_time", "time_in", "time_out", "time_completed"]:
        if col in df.columns:
            df[col] = parse_datetime(df[col], col)

    # Fill missing time_in for history rows (partition key must not be null)
    if dataset_type == "history" and "time_in" in df.columns:
        fallback = df.get("move_complete_time", pd.NaT)
        if hasattr(fallback, 'dtype'):
            df["time_in"] = df["time_in"].fillna(fallback).fillna(pd.Timestamp("2020-01-01"))
        else:
            df["time_in"] = df["time_in"].fillna(pd.Timestamp("2020-01-01"))

    # Determine yard_id per row
    if dataset_type == "crane":
        # Crane: derive yard from from_position/to_position
        df["yard_id"] = df.apply(_get_yard_for_crane_row, axis=1)
    else:
        # History/Current: derive yard from container position fields
        if "yard_id" not in df.columns or df["yard_id"].isna().all():
            df["yard_id"] = df.apply(get_yard_id, axis=1)

    # Drop rows with no yard
    missing_yard = df["yard_id"].isna() | (df["yard_id"].astype(str).str.strip() == "")
    if missing_yard.any():
        print(f"  -> Skipping {missing_yard.sum()} rows with no detectable yard")
        df = df[~missing_yard]

    if df.empty:
        print(f"  -> No data to ingest after yard detection")
        return

    # Ingest per yard group
    for yard, group in df.groupby("yard_id"):
        yard_str = str(yard).strip().upper()
        yard_lower = yard_str.lower()
        if not yard_lower or yard_lower == "nan":
            continue

        print(f"  -> Routing {len(group)} records to yard: {yard_str}")

        # Ensure yard tables exist
        ensure_yard_tables(engine, yard_lower)

        # Determine target table
        if dataset_type == "crane":
            table_name = f"{yard_lower}_crane_movements"
            valid_cols = [c for c in CRANE_COLS if c in group.columns]
        elif dataset_type == "current":
            table_name = f"{yard_lower}_current_containers"
            valid_cols = [c for c in CURRENT_COLS if c in group.columns]
        else:
            table_name = f"{yard_lower}_history_containers"
            valid_cols = [c for c in HISTORY_COLS if c in group.columns]

        insert_df = group[valid_cols].copy()
        # Remove duplicate columns (can happen if valid_cols has overlaps with the df)
        insert_df = insert_df.loc[:, ~insert_df.columns.duplicated()]

        # Ensure time_in is set (required for history partition key)
        if dataset_type == "history" and "time_in" in insert_df.columns:
            insert_df["time_in"] = insert_df["time_in"].fillna(pd.Timestamp("2020-01-01"))

        try:
            insert_df.to_sql(
                table_name, engine, if_exists="append",
                index=False, chunksize=5000, method="multi"
            )
            print(f"     Inserted {len(insert_df)} rows into {table_name}")
        except Exception as e:
            print(f"  -> Error inserting into {table_name}: {e}")


def main():
    engine = get_engine()
    data_dir = os.path.join(os.path.dirname(__file__), "data")

    # Order matters: history first, then crane, then current
    for f in glob.glob(os.path.join(data_dir, "*history*.csv")):
        ingest_file(engine, f, "history")

    for f in glob.glob(os.path.join(data_dir, "*crane*.csv")):
        ingest_file(engine, f, "crane")

    for f in glob.glob(os.path.join(data_dir, "*current*.csv")):
        ingest_file(engine, f, "current")

    print("Fast ingestion complete.")


if __name__ == "__main__":
    main()
