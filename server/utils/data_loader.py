from __future__ import annotations

from io import BytesIO
from typing import Optional
from datetime import datetime, timezone

import pandas as pd

from config import settings
from utils.datetime_utils import parse_datetime


# ─────────────────────────────────────────────────────────────────────────────
# Column normalization
# ─────────────────────────────────────────────────────────────────────────────

def clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.lower()
        .str.replace(" ", "_", regex=False)
        .str.replace("-", "_", regex=False)
        .str.replace("(", "", regex=False)
        .str.replace(")", "", regex=False)
        .str.replace(r"[^a-z0-9_]", "", regex=True)
    )
    return df


_HISTORY_MAPPING: dict[str, str] = {
    "unit_id": "unit_id",
    "unit": "unit_id",
    "container_id": "unit_id",
    "unit_visit_gkey": "unit_visit_gkey",
    "actual_outbound_carrier_visit_id": "actual_outbound_carrier_visit_id",
    "actual_outbound_carrier_visit": "actual_outbound_carrier_visit_id",
    "vessel_visit_id": "actual_outbound_carrier_visit_id",
    "outbound_service": "outbound_service",
    "vessel": "outbound_service",
    "service": "outbound_service",
    "actual_inbound_carrier_visit_id": "actual_inbound_carrier_visit_id",
    "actual_inbound_carrier_visit": "actual_inbound_carrier_visit_id",
    "inbound_service": "inbound_service",
    "move_complete_time": "move_complete_time",
    "time_in": "time_in",
    "time_out": "time_out",
    "ctr_from_position": "ctr_from_position",
    "from_position": "ctr_from_position",
    "ctr_to_position": "ctr_to_position",
    "to_position": "ctr_to_position",
    "current_position": "current_position",
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
    "yard_id": "yard_id",
    "complex_id": "complex_id",
    "facility_id": "facility_id",
    "category_id": "category_id",
    "equipment_class": "equipment_class",
    "container_length": "container_length",
    "equipment_type": "equipment_type",
    "freight_kind": "freight_kind",
    "destination": "destination",
    "arrival_mode": "arrival_mode",
    "stow_code_1": "stow_code_1",
    "stow_code_2": "stow_code_2",
    "stow_code_3": "stow_code_3",
}


_CURRENT_MAPPING: dict[str, str] = {
    **_HISTORY_MAPPING,
    "current_position": "current_position",
    "updated_at": "updated_at",
    "created_at": "created_at",
}


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
    "yard_id": "yard_id",
}


def _now_utc_naive() -> pd.Timestamp:
    return pd.Timestamp.now(tz="UTC").tz_localize(None)


def _add_missing_current_fallbacks(df: pd.DataFrame) -> pd.DataFrame:
    """
    Current snapshot files often do not contain event timestamps.
    We backfill them so downstream stay-feature extraction does not drop rows.
    """
    df = df.copy()
    now = _now_utc_naive()

    if "created_at" not in df.columns:
        df["created_at"] = now
    if "updated_at" not in df.columns:
        df["updated_at"] = df["created_at"]

    # For snapshot data, make event-style processing possible
    if "move_complete_time" not in df.columns:
        df["move_complete_time"] = df["updated_at"]

    # Preserve current_position and use it as a snapshot anchor when only one side exists
    if "current_position" not in df.columns:
        df["current_position"] = None

    if "ctr_to_position" in df.columns:
        df["current_position"] = df["current_position"].fillna(df["ctr_to_position"])
    if "ctr_from_position" in df.columns:
        df["current_position"] = df["current_position"].fillna(df["ctr_from_position"])

    # If visit id is missing but service exists, keep analysis usable
    if "actual_outbound_carrier_visit_id" not in df.columns and "outbound_service" in df.columns:
        df["actual_outbound_carrier_visit_id"] = df["outbound_service"]

    return df


def normalize_dataframe(df: pd.DataFrame, dataset_type: Optional[str] = None) -> pd.DataFrame:
    df = clean_column_names(df)
    dataset_type = (dataset_type or "").strip().lower()

    if dataset_type == "crane":
        mapping = _CRANE_MAPPING
    elif dataset_type == "current":
        mapping = _CURRENT_MAPPING
    else:
        mapping = _HISTORY_MAPPING

    final_cols: list[str] = []
    for col in df.columns:
        mapped = mapping.get(col, col)
        if mapped in final_cols:
            suffix = 1
            while f"{mapped}_{suffix}" in final_cols:
                suffix += 1
            final_cols.append(f"{mapped}_{suffix}")
        else:
            final_cols.append(mapped)

    df.columns = final_cols

    if dataset_type == "current":
        df = _add_missing_current_fallbacks(df)

    return df


def infer_dataset_type(df: pd.DataFrame) -> str:
    cols = set(df.columns)

    if {"crane_id", "carrier_visit"}.issubset(cols):
        return "crane"

    # Current snapshot clues
    if "current_position" in cols or "visit_state" in cols or "transit_state" in cols:
        return "current"

    # History clues
    if "time_out" in cols or "move_complete_time" in cols:
        return "history"

    return "history"


def load_from_file(file_bytes: bytes, dataset_type: Optional[str] = None) -> pd.DataFrame:
    df = pd.read_csv(BytesIO(file_bytes), low_memory=False)
    df = normalize_dataframe(df, dataset_type=dataset_type)

    if dataset_type is None:
        dataset_type = infer_dataset_type(df)
    dataset_type = dataset_type.lower().strip()

    if dataset_type in ("history", "current"):
        for col in ["move_complete_time", "time_in", "time_out", "updated_at", "created_at"]:
            if col in df.columns:
                df[col] = parse_datetime(df[col], col)

        # Ensure current snapshots always have usable timestamps
        if dataset_type == "current":
            df = _add_missing_current_fallbacks(df)
            for col in ["move_complete_time", "updated_at", "created_at"]:
                if col in df.columns:
                    df[col] = parse_datetime(df[col], col)

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


def validate_dataframe(df: pd.DataFrame, dataset_type: Optional[str] = None) -> pd.DataFrame:
    if df is None or df.empty:
        raise ValueError("Uploaded data is empty")

    if dataset_type is None:
        dataset_type = infer_dataset_type(df)
    dataset_type = dataset_type.lower().strip()

    required_map = getattr(settings, "REQUIRED_COLS_BY_TYPE", {})
    required_cols = list(required_map.get(dataset_type, getattr(settings, "REQUIRED_COLS", [])))

    if dataset_type == "current":
        # current snapshots can be analyzed using service or vessel visit id
        if "actual_outbound_carrier_visit_id" not in df.columns and "outbound_service" not in df.columns:
            raise ValueError(
                "Current dataset must contain either actual_outbound_carrier_visit_id or outbound_service"
            )

    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns for {dataset_type}: {missing}")

    initial_len = len(df)

    if dataset_type == "crane":
        df = df.dropna(subset=[c for c in ["crane_id", "unit_id", "carrier_visit", "move_kind", "time_completed"] if c in df.columns])

        if not any(c in df.columns for c in ("from_position", "ctr_from_position")):
            raise ValueError("Crane file must contain a from position column")
        if not any(c in df.columns for c in ("to_position", "ctr_to_position")):
            raise ValueError("Crane file must contain a to position column")

        if "time_completed" in df.columns:
            df["time_completed"] = parse_datetime(df["time_completed"], "time_completed")
    else:
        primary_cols = [c for c in ["outbound_service", "actual_outbound_carrier_visit_id", "unit_id"] if c in df.columns]
        if primary_cols:
            df = df.dropna(subset=primary_cols)

        for col in ["move_complete_time", "time_in", "time_out", "updated_at", "created_at"]:
            if col in df.columns:
                df[col] = parse_datetime(df[col], col)

        if dataset_type == "current":
            df = _add_missing_current_fallbacks(df)

    dropped = initial_len - len(df)
    if dropped > 0:
        print(f"Cleaned dataset: dropped {dropped} records with null primary keys.")

    return df