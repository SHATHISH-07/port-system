from __future__ import annotations
import pandas as pd
from config import settings
from utils.datetime_utils import parse_datetime

# safe parse
def _safe_parse(df: pd.DataFrame, col: str) -> pd.Series:
    # if the column exists in the DataFrame, parse it
    if col in df.columns:
        return parse_datetime(df[col], col)
    # else return a Series of NaT
    return pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")

# prepare visit data
def prepare_visit_data(df: pd.DataFrame) -> pd.DataFrame:
    # Supported data sources:
    #   • history:         move_complete_time / time_in / time_out
    #   • current:         move_complete_time / time_in / updated_at / created_at
    #   • crane-enriched:  any of the above + crane_time (added by vessel_service)
    # Event-time priority:
    # move_complete_time → crane_time → time_in → time_completed → updated_at → created_at
    df = df.copy()
    if df.empty:
        return df
    # standardize column names by stripping whitespace
    df.columns = df.columns.str.strip()
    # normalize time-related columns to datetime, using the first valid one
    event_sources = [
        "move_complete_time",
        "crane_time",
        "time_in",
        "time_completed",
        "updated_at",
        "created_at",
    ]
    # Build a single event_time column by merging the above in order
    event_time = pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")
    for col in event_sources:
        parsed = _safe_parse(df, col)
        event_time = event_time.fillna(parsed)
    # store final event_time and vessel_departure (if available)
    df["event_time"] = event_time
    df["vessel_departure"] = _safe_parse(df, "time_out")
    # Drop rows without event time
    df = df.dropna(subset=["event_time"])
    if df.empty:
        return df

    # Apply time window only when an explicit departure time is available
    valid_out = df["vessel_departure"].dropna()
    if not valid_out.empty:
        # If there are multiple departure times, use the most common one (mode)
        vessel_dep = valid_out.mode().iloc[0]
        window_start = vessel_dep - pd.Timedelta(hours=settings.VESSEL_WINDOW_HOURS)
        window_end = vessel_dep + pd.Timedelta(hours=1)
        # Keep only rows within the window
        df = df[
            (df["event_time"] >= window_start) & (df["event_time"] <= window_end)
        ].copy()
        df["vessel_departure"] = vessel_dep

    if df.empty:
        return df
    # return the final prepared DataFrame
    return df.sort_values("event_time").reset_index(drop=True)

# Function to compute stay duration for a single visit
def compute_visit_stay(df: pd.DataFrame) -> float | None:
    # check if df is empty or does not have event_time column
    if df is None or df.empty or "event_time" not in df.columns:
        return None
    # Calculate stay duration
    start = df["event_time"].min()
    # if vessel_departure is available, use it as end time, otherwise use event_time max
    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        end = valid_dep.iloc[0] if not valid_dep.empty else df["event_time"].max()
    else:
        end = df["event_time"].max()
    # Calculate stay duration in hours
    stay_hours = (end - start).total_seconds() / 3600
    return round(stay_hours, 2) if stay_hours > 0 else None

# Function to compute stay duration for all visits of a vessel
def compute_vessel_stay(prepared_visits: dict) -> dict:
    # create a dictionary to store the stay durations for each visit
    result: dict[str, float] = {}
    # Iterate over each visit
    for visit_id, visit_df in prepared_visits.items():
        # check if visit_df is empty or does not have event_time column
        if visit_df is None or visit_df.empty:
            continue
        stay = compute_visit_stay(visit_df)
        # if stay is valid, add it to the result
        if stay is not None and stay > 0:
            result[str(visit_id).strip()] = stay
    # if result is empty, return empty dictionary
    if not result:
        return {}
    # compute average, maximum, and minimum stay durations
    vals = list(result.values())
    return {
        "visits": result,
        "avg_hours": round(sum(vals) / len(vals), 2),
        "max_hours": round(max(vals), 2),
        "min_hours": round(min(vals), 2),
    }