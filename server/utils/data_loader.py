from __future__ import annotations
from io import BytesIO
from typing import Optional
import pandas as pd
from utils.datetime_utils import parse_datetime
from config import settings

# normalize column names
def clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    # make copy of dataframe
    df = df.copy()
    df.columns = (
        df.columns
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(" ", "_", regex=False)
        .str.replace("-", "_", regex=False)
        .str.replace("(", "", regex=False)
        .str.replace(")", "", regex=False)
        .str.replace(r"[^a-z0-9_]", "", regex=True)
    )
    return df

# history and current dataset mapping
_HISTORY_CURRENT_MAPPING: dict[str, str] = {
    "unit_id": "unit_id",
    "unit": "unit_id",
    "container_id": "unit_id",

    "actual_outbound_carrier_visit_id": "actual_outbound_carrier_visit_id",
    "actual_outbound_carrier_visit": "actual_outbound_carrier_visit_id",
    "vessel_visit_id": "actual_outbound_carrier_visit_id",

    "outbound_service": "outbound_service",
    "vessel": "outbound_service",
    "service": "outbound_service",

    "move_complete_time": "move_complete_time",
    "time_in": "time_in",
    "time_out": "time_out",

    "ctr_from_position": "ctr_from_position",
    "from_position": "ctr_from_position",

    "ctr_to_position": "ctr_to_position",
    "to_position": "ctr_to_position",

    "verified_gross_mass_kg": "verified_gross_mass_kg",
    "verified_gross_mass_kg_": "verified_gross_mass_kg",
    "vgm": "verified_gross_mass_kg",
    "unit_weight_in_kg": "unit_weight_in_kg",
    "weight": "unit_weight_in_kg",

    "reefer": "reefer",
    "oog_unit": "oog_unit",
    "hazardous_flag": "hazardous_flag",
    "hazardous": "hazardous_flag",
    "port_of_discharge": "port_of_discharge",
    "visit_state": "visit_state",
    "transit_state": "transit_state",
}

# crane dataset mapping
_CRANE_MAPPING: dict[str, str] = {
    "crane_id": "crane_id",
    "crane_che": "crane_id",
    "crane": "crane_id",

    "unit_id": "unit_id",
    "unit": "unit_id",
    "unit_nbr": "unit_id",

    "carrier_visit": "carrier_visit",

    "event_type": "event_type",
    "move_kind": "move_kind",

    "from_position": "from_position",
    "ctr_from_position": "from_position",  
    "crane_from_position": "from_position",
    "crane_from": "from_position",
    "from": "from_position",

    "to_position": "to_position",
    "ctr_to_position": "to_position",
    "crane_to_position": "to_position",
    "crane_to": "to_position",
    "to": "to_position",

    "time_completed": "time_completed",
    "line_op": "line_op",
    "unit_category": "unit_category",
    "exclude": "exclude",
}

# common post processing
_COMMON_POST_MAP = {
    "time_completed": "time_completed",
}

# normalize dataframe
def normalize_dataframe(df: pd.DataFrame, dataset_type: Optional[str] = None) -> pd.DataFrame:
    # clean column names
    df = clean_column_names(df)

    # normalize dataset type
    dataset_type = (dataset_type or "").strip().lower()

    # select dataset-specific mapping (if dataset_type is none, use history-current mapping by default)
    if dataset_type == "crane":
        mapping = _CRANE_MAPPING
    else:
        mapping = _HISTORY_CURRENT_MAPPING
    
    # build final column list
    final_cols: list[str] = []
    
    # handle duplicate column names by adding a suffix
    for col in df.columns:
        mapped = mapping.get(col, col)
        if mapped in final_cols:
            suffix = 1
            while f"{mapped}_{suffix}" in final_cols:
                suffix += 1
            final_cols.append(f"{mapped}_{suffix}")
        else:
            final_cols.append(mapped)
    
    # apply final columns
    df.columns = final_cols
    
    return df

# Dataset type inference
def infer_dataset_type(df: pd.DataFrame) -> str:
    # get column names
    cols = set(df.columns)
    # detect dataset type
    if {"crane_id", "carrier_visit"}.issubset(cols):
        return "crane"
    if "visit_state" in cols or "transit_state" in cols:
        return "current"
    return "history"

# File loading
def load_from_file(file_bytes: bytes, dataset_type: Optional[str] = None) -> pd.DataFrame:
    # read csv file
    df = pd.read_csv(BytesIO(file_bytes), low_memory=False)

    # normalize dataframe
    df = normalize_dataframe(df, dataset_type=dataset_type)

    # infer dataset type if not provided
    if dataset_type is None:
        dataset_type = infer_dataset_type(df)
    
    # normalize dataset type
    dataset_type = dataset_type.lower().strip()

    # parse datetime columns
    if dataset_type in ("history", "current"):
        for col in ["move_complete_time", "time_in", "time_out"]:
            if col in df.columns:
                df[col] = parse_datetime(df[col], col)
    # parse datetime columns
    if dataset_type == "current":
        for col in ["updated_at", "created_at"]:
            if col in df.columns:
                df[col] = parse_datetime(df[col], col)
    # parse datetime columns
    if dataset_type == "crane":
        if "time_completed" in df.columns:
            df["time_completed"] = parse_datetime(df["time_completed"], "time_completed")
        if "move_kind" in df.columns:
            df["move_kind"] = (
                df["move_kind"]
                .astype(str)
                .str.strip()
                .str.upper()
                .replace({"NAN": None, "NONE": None, "NULL": None, "": None})
            )

    return df

# Validation
def validate_dataframe(df: pd.DataFrame, dataset_type: Optional[str] = None) -> pd.DataFrame:
    # validate dataframe
    if df is None or df.empty:
        raise ValueError("Uploaded data is empty")

    # infer dataset type if not provided
    if dataset_type is None:
        dataset_type = infer_dataset_type(df)
    
    # normalize dataset type
    dataset_type = dataset_type.lower().strip()

    # get required columns by dataset type
    required_map = getattr(settings, "REQUIRED_COLS_BY_TYPE", {})
    required_cols = list(required_map.get(dataset_type, getattr(settings, "REQUIRED_COLS", [])))

    # check if all required columns are present
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns for {dataset_type}: {missing}")

    initial_len = len(df)

    # crane validation
    if dataset_type == "crane":
        # drop rows with missing required columns
        df = df.dropna(subset=[c for c in ["crane_id", "unit_id", "carrier_visit", "move_kind", "time_completed"] if c in df.columns])

        # check if from position column is present
        if not any(c in df.columns for c in ("from_position", "ctr_from_position")):
            raise ValueError("Crane file must contain a from position column")
        # check if to position column is present
        if not any(c in df.columns for c in ("to_position", "ctr_to_position")):
            raise ValueError("Crane file must contain a to position column")
        # parse datetime columns
        if "time_completed" in df.columns:
            df["time_completed"] = parse_datetime(df["time_completed"], "time_completed")
    else:
        # drop rows with missing required columns
        primary_cols = [c for c in ["outbound_service", "actual_outbound_carrier_visit_id", "unit_id"] if c in df.columns]
        if primary_cols:
            df = df.dropna(subset=primary_cols)

        # parse datetime columns
        for col in ["move_complete_time", "time_in", "time_out"]:
            if col in df.columns:
                df[col] = parse_datetime(df[col], col)
    
    # calculate dropped records
    dropped = initial_len - len(df)
    if dropped > 0:
        print(f"Cleaned dataset: dropped {dropped} records with null primary keys.")

    return df
