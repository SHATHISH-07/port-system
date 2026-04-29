import pandas as pd
from utils.datetime_utils import parse_datetime

def load_csv(file_bytes: bytes):
    df = pd.read_csv(pd.io.common.BytesIO(file_bytes), low_memory=False)
    df.columns = df.columns.str.strip()

    if df.empty:
        raise ValueError("Uploaded CSV is empty")

    required_cols = [
        "Move Complete Time",
        "Time In",
        "Time Out",
        "Outbound Service"
    ]

    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    for col in ["Move Complete Time", "Time In", "Time Out"]:
        if col in df.columns:
            df[col] = parse_datetime(df[col])

    return df