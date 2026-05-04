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
def load_csv(file_bytes: bytes):
    df = pd.read_csv(pd.io.common.BytesIO(file_bytes), low_memory=False)
    
    # Standardize schema naming conventions immediately
    df = clean_column_names(df)

    if df.empty:
        raise ValueError("Uploaded CSV is empty")

    from config import settings

    missing = [c for c in settings.REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    # CLEANING: Drop records missing vital relational keys
    initial_len = len(df)
    df = df.dropna(subset=["outbound_service", "actual_outbound_carrier_visit_id", "unit_id"])
    dropped = initial_len - len(df)
    if dropped > 0:
        print(f"Cleaned dataset: Dropped {dropped} records with null primary keys.")

    for col in ["move_complete_time", "time_in", "time_out"]:
        if col in df.columns:
            df[col] = parse_datetime(df[col])

    return df