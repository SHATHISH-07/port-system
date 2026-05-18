from __future__ import annotations

import logging

import pandas as pd

from config import settings
from utils.datetime_utils import parse_datetime

logger = logging.getLogger("port_system")


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _safe_parse(df: pd.DataFrame, col: str) -> pd.Series:
    """Parse a datetime column if present; return NaT series otherwise."""
    if col in df.columns:
        return parse_datetime(df[col], col)
    return pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")


def _is_history_df(df: pd.DataFrame) -> bool:
    """
    A DataFrame is treated as 'history' when:
      - time_out column exists AND has at least 30 % non-null values
      - AND visit_state / transit_state contains departed states (if present)

    Both conditions must hold — this prevents current datasets that happen to
    include a `time_out` column with all-null values from being misclassified.
    """
    if "time_out" not in df.columns:
        return False

    # Require meaningful departure data, not just an empty column header
    non_null_ratio = df["time_out"].notna().mean()
    if non_null_ratio < 0.30:
        return False

    if "visit_state" in df.columns:
        visit_states = df["visit_state"].dropna().astype(str).str.upper().unique()
        return any("DEPART" in s for s in visit_states)

    if "transit_state" in df.columns:
        transit_states = df["transit_state"].dropna().astype(str).str.upper().unique()
        return any("DEPART" in s for s in transit_states)

    # time_out is well-populated and no visit_state column present → treat as history
    return True


# ─────────────────────────────────────────────────────────────────────────────
# prepare_visit_data
# ─────────────────────────────────────────────────────────────────────────────

def prepare_visit_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalise a visit DataFrame into a form ready for stay computation and
    feature extraction.

    Event-time priority (for move_span_hours / feature engineering):
        move_complete_time → time_in → updated_at → created_at

    Stay computation time (for actual stay hours):
        Primary: move_complete_time span (first move → last move)
        Fallback (history): vessel_departure (time_out) − first event_time

    History datasets (has time_out with departed containers):
        - vessel_departure is read from time_out
        - event_time is windowed to ±VESSEL_WINDOW_HOURS around departure

    Current datasets (in-yard containers):
        - vessel_departure is left as NaT (vessel has not left yet)
        - no time-window pruning is applied
    """
    df = df.copy()
    if df.empty:
        return df

    df.columns = df.columns.str.strip()

    # ── Parse move_complete_time specifically ────────────────────────────────
    if "move_complete_time" in df.columns:
        df["move_complete_time"] = pd.to_datetime(df["move_complete_time"], errors="coerce")

    # ── Build event_time from priority sources ───────────────────────────────
    event_sources = [
        "move_complete_time",
        "time_in",
        "updated_at",
        "created_at",
    ]
    event_time = pd.Series(
        [pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]"
    )
    for col in event_sources:
        parsed = _safe_parse(df, col)
        event_time = event_time.fillna(parsed)

    df["event_time"]       = event_time
    df["vessel_departure"] = _safe_parse(df, "time_out")

    df = df.dropna(subset=["event_time"])
    if df.empty:
        return df

    # For history: apply time window around vessel departure
    if _is_history_df(df):
        valid_out = df["vessel_departure"].dropna()
        if not valid_out.empty:
            vessel_dep   = valid_out.mode().iloc[0]
            window_start = vessel_dep - pd.Timedelta(hours=settings.VESSEL_WINDOW_HOURS)
            window_end   = vessel_dep + pd.Timedelta(hours=1)
            windowed     = df[
                (df["event_time"] >= window_start)
                & (df["event_time"] <= window_end)
            ].copy()
            if len(windowed) >= 3:
                df = windowed
            df["vessel_departure"] = vessel_dep

    if df.empty:
        return df

    return df.sort_values("event_time").reset_index(drop=True)


# ─────────────────────────────────────────────────────────────────────────────
# compute_visit_stay  (single visit)
# ─────────────────────────────────────────────────────────────────────────────

def compute_visit_stay(df: pd.DataFrame) -> float | None:
    """
    Compute stay duration in hours for a single prepared visit DataFrame.

    Priority:
        1. move_complete_time span  — first to last container move completion.
           This is the most operationally accurate measure because it captures
           exactly how long cargo operations ran on the vessel, with NO crane
           data dependency whatsoever.
        2. vessel_departure (time_out) − earliest event_time
           (history fallback when move_complete_time is absent or too sparse)

    Current mode (vessel_departure absent / NaT and no move_complete_time
    span available) → returns None so callers use ML prediction.
    """
    if df is None or df.empty:
        return None

    # ── Priority 1: move_complete_time span ──────────────────────────────────
    if "move_complete_time" in df.columns:
        mct = pd.to_datetime(df["move_complete_time"], errors="coerce").dropna()
        if len(mct) >= 2:
            span_hours = (mct.max() - mct.min()).total_seconds() / 3600
            if span_hours >= 0.5:  # at least 30 min of operations
                return round(span_hours, 2)

    # ── Priority 2: event_time span anchored at vessel departure ────────────
    if "event_time" not in df.columns:
        return None

    start = df["event_time"].min()
    if pd.isna(start):
        return None

    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        if not valid_dep.empty:
            end = valid_dep.iloc[0]
            if pd.notna(end) and end > start:
                stay_hours = (end - start).total_seconds() / 3600
                if stay_hours > 0:
                    return round(stay_hours, 2)
        # vessel_departure present but unusable → return None (ML path)
        return None

    # No departure info available → ML path
    return None


# ─────────────────────────────────────────────────────────────────────────────
# compute_vessel_stay  (all visits for a vessel/service)
# ─────────────────────────────────────────────────────────────────────────────

def compute_vessel_stay(prepared_visits: dict) -> dict:
    """
    Compute stay statistics across all prepared visits for a vessel.

    Returns:
        {
            "visits":    {visit_id: hours},
            "avg_hours": float,
            "max_hours": float,
            "min_hours": float,
        }
    or an empty dict if no valid stays are found.
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
        "visits":    result,
        "avg_hours": round(sum(vals) / len(vals), 2),
        "max_hours": round(max(vals), 2),
        "min_hours": round(min(vals), 2),
    }