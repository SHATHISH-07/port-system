"""
utils/stay_utils.py
-------------------
Vessel stay-time computation utilities.
"""
from __future__ import annotations

import pandas as pd

from config import settings
from utils.datetime_utils import parse_datetime


def _safe_parse(df: pd.DataFrame, col: str) -> pd.Series:
    if col in df.columns:
        return parse_datetime(df[col], col)
    return pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")


def prepare_visit_data(df: pd.DataFrame) -> pd.DataFrame:
    """Prepare a single-visit DataFrame for stay-time analysis.

    Supported data sources:
      • history:         move_complete_time / time_in / time_out
      • current:         move_complete_time / time_in / updated_at / created_at
      • crane-enriched:  any of the above + crane_time (added by vessel_service)

    Event-time priority:
        move_complete_time → crane_time → time_in → time_completed → updated_at → created_at
    """
    df = df.copy()
    if df.empty:
        return df

    df.columns = df.columns.str.strip()

    event_sources = [
        "move_complete_time",
        "crane_time",
        "time_in",
        "time_completed",
        "updated_at",
        "created_at",
    ]

    event_time = pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")
    for col in event_sources:
        parsed = _safe_parse(df, col)
        event_time = event_time.fillna(parsed)

    df["event_time"] = event_time
    df["vessel_departure"] = _safe_parse(df, "time_out")

    df = df.dropna(subset=["event_time"])
    if df.empty:
        return df

    # Apply time window only when an explicit departure time is available
    valid_out = df["vessel_departure"].dropna()
    if not valid_out.empty:
        vessel_dep = valid_out.mode().iloc[0]
        window_start = vessel_dep - pd.Timedelta(hours=settings.VESSEL_WINDOW_HOURS)
        window_end = vessel_dep + pd.Timedelta(hours=1)
        df = df[
            (df["event_time"] >= window_start) & (df["event_time"] <= window_end)
        ].copy()
        df["vessel_departure"] = vessel_dep

    if df.empty:
        return df

    return df.sort_values("event_time").reset_index(drop=True)


def compute_visit_stay(df: pd.DataFrame) -> float | None:
    """Return stay duration in hours for a prepared single-visit DataFrame."""
    if df is None or df.empty or "event_time" not in df.columns:
        return None

    start = df["event_time"].min()

    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        end = valid_dep.iloc[0] if not valid_dep.empty else df["event_time"].max()
    else:
        end = df["event_time"].max()

    stay_hours = (end - start).total_seconds() / 3600
    return round(stay_hours, 2) if stay_hours > 0 else None


def compute_vessel_stay(prepared_visits: dict) -> dict:
    """Aggregate stay stats across all visits for one vessel service.

    Returns:
        {
            'visits': {visit_id: stay_hours, ...},
            'avg_hours': float,
            'max_hours': float,
            'min_hours': float,
        }
        or {} if no valid visits.
    """
    result: dict[str, float] = {}

    for visit_id, visit_df in prepared_visits.items():
        if visit_df is None or visit_df.empty:
            continue
        stay = compute_visit_stay(visit_df)
        if stay is not None and stay > 0:
            result[str(visit_id).strip()] = stay

    if not result:
        return {}

    vals = list(result.values())
    return {
        "visits": result,
        "avg_hours": round(sum(vals) / len(vals), 2),
        "max_hours": round(max(vals), 2),
        "min_hours": round(min(vals), 2),
    }