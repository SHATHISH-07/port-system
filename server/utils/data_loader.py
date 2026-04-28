import pandas as pd
import os
from dotenv import load_dotenv
from utils.datetime_utils import parse_datetime

load_dotenv()

_df = None

# Load dataset from CSV file
def load_data():
    global _df

    if _df is not None:
        return _df
    
    # Get the path from the environment variables
    path = os.getenv("DATA_PATH")

    # Check if the path exists
    if not path:
        raise ValueError("DATA_PATH not set in .env")
    
    if not os.path.exists(path):
        raise FileNotFoundError(f"File not found: {path}")
        
    print("[INFO] Loading dataset...")
    
    df = pd.read_csv(path, low_memory=False)
    df.columns = df.columns.str.strip()

    # Parse datetime columns
    for col in ["Move Complete Time", "Time In", "Time Out"]:
        if col in df.columns:
            df[col] = parse_datetime(df[col])

    _df = df

    print("[OK] Dataset loaded successfully")

    return _df


# Get the loaded data
def get_data():
    if _df is None:
        raise Exception("Data not loaded. Call load_data() first.")
    return _df