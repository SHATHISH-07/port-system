import pandas as pd
from utils.datetime_utils import parse_datetime

# Utility function to clean column names
def clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(' ', '_')
        .str.replace(r'[^a-z0-9_]', '', regex=True)
    )
    return df

# Utility function to load CSV data from bytes
def load_from_file(file_bytes: bytes) -> pd.DataFrame:
    df = pd.read_csv(pd.io.common.BytesIO(file_bytes), low_memory=False)
    
    # Standardize schema naming conventions immediately
    df = clean_column_names(df)
    
    return df

# Validate and clean dataframe
def validate_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        raise ValueError("Uploaded data is empty")

    from config import settings

    # Check for required columns
    missing = [c for c in settings.REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # CLEANING: Drop records missing vital relational keys
    initial_len = len(df)
    df = df.dropna(subset=["outbound_service", "actual_outbound_carrier_visit_id", "unit_id"])
    dropped = initial_len - len(df)
    if dropped > 0:
        print(f"Cleaned dataset: Dropped {dropped} records with null primary keys.")

    # Time parsing
    for col in ["move_complete_time", "time_in", "time_out"]:
        if col in df.columns:
            df[col] = parse_datetime(df[col])

    # Discard any columns not in settings.DB_EXPECTED_COLUMNS (Ignore extra columns strategy)
    expected_columns = settings.DB_EXPECTED_COLUMNS
    # Keep columns that are in expected_columns
    valid_cols = [col for col in df.columns if col in expected_columns or col in settings.REQUIRED_COLS]
    # Actually DB_EXPECTED_COLUMNS has what we need
    # We will just let df retain what it has, `_prepare_dfs_for_insert` already filters to expected columns.
    
    return df