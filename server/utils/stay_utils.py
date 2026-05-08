import pandas as pd
from utils.datetime_utils import parse_datetime
from config import settings

def _safe_parse(df: pd.DataFrame, col: str) -> pd.Series:
    """Parse a datetime column if it exists, else return a null Series."""
    if col in df.columns:
        return parse_datetime(df[col], col)
    return pd.Series([pd.NaT] * len(df), index=df.index)

def prepare_visit_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Prepare a container visit DataFrame for stay-time analysis.
    Works with both history (has time_in / time_out) and current data.
    Crane timestamps are pre-merged into move_complete_time before this call.
    """
    df = df.copy()
    df.columns = df.columns.str.strip()

    # Build event_time: move_complete_time → time_in → fallback
    move_time = _safe_parse(df, "move_complete_time")
    time_in   = _safe_parse(df, "time_in")
    df["event_time"] = move_time.fillna(time_in)

    # CRITICAL FIX for 'Current' dataset static snapshot operations: 
    # Current dataset usually lacks completion dates. Supply current timestamp so data isn't dropped.
    df["event_time"] = df["event_time"].fillna(pd.Timestamp.utcnow())

    # Vessel departure = time_out (if present)
    time_out = _safe_parse(df, "time_out")
    df["vessel_departure"] = time_out

    # Apply time window if vessel_departure is available
    valid_out = df["vessel_departure"].dropna()
    if not valid_out.empty:
        vessel_dep   = valid_out.mode().iloc[0]
        window_start = vessel_dep - pd.Timedelta(hours=settings.VESSEL_WINDOW_HOURS)
        window_end   = vessel_dep + pd.Timedelta(hours=1)
        df = df[
            (df["event_time"] >= window_start) &
            (df["event_time"] <= window_end)
        ].copy()
        df["vessel_departure"] = vessel_dep
    else:
        # No departure time — use the full event span (typical for current data)
        pass

    df = df.dropna(subset=["event_time"])
    if df.empty:
        return df

    return df.sort_values("event_time").reset_index(drop=True)

def compute_visit_stay(df: pd.DataFrame):
    if df is None or df.empty:
        return None

    start = df["event_time"].min()

    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        end = valid_dep.iloc[0] if not valid_dep.empty else df["event_time"].max()
    else:
        end = df["event_time"].max()

    stay_hours = (end - start).total_seconds() / 3600
    if stay_hours <= 0:
        return None
    return round(stay_hours, 2)

def compute_vessel_stay(prepared_visits: dict):
    result = {}
    for visit_id, visit_df in prepared_visits.items():
        if visit_df is None or visit_df.empty:
            continue
        stay_hours = compute_visit_stay(visit_df)
        if stay_hours is not None and stay_hours > 0:
            result[str(visit_id).strip()] = stay_hours

    if result:
        stay_values = list(result.values())
        return {
            "visits":    result,
            "avg_hours": round(sum(stay_values) / len(stay_values), 2),
            "max_hours": round(max(stay_values), 2),
            "min_hours": round(min(stay_values), 2),
        }
    return {}