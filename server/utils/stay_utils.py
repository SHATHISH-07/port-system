import pandas as pd
from utils.datetime_utils import parse_datetime

# ── Domain constants ─────────────────────────────────────────────────────────
# A vessel can physically stay at the port for AT MOST 4 days (96 h).
# Any Move Complete Time that falls OUTSIDE this window before the vessel's
# Time Out is a pre-staged / pre-assigned container move, not part of the
# actual vessel port call, and must be excluded.
VESSEL_WINDOW_HOURS = 96          # 4-day maximum window


# =========================================================
# PREPARE VISIT DATA
# =========================================================
def prepare_visit_data(df):
    """
    Cleans and filters a single visit-ID group so that only crane moves
    that actually happened DURING the vessel's port call are kept.

    Algorithm
    ---------
    1. Parse Move Complete Time (MCT) and Time In.
    2. event_time = MCT  (fallback: Time In if MCT is missing)
    3. Parse Time Out  → vessel_departure  (same value for every row in a visit)
    4. FILTER: keep only rows where
           vessel_departure - 96h  <=  event_time  <=  vessel_departure + 1h
       Rows outside this window are pre-staged container movements, NOT
       part of the actual vessel loading operation.
    5. Sort ascending so  .iloc[0] = first loading move = vessel "start"
                          and vessel_departure = vessel "end"

    The resulting DataFrame carries a 'vessel_departure' column so that
    compute_visit_stay() can use Time Out as the end anchor.
    """
    df = df.copy()
    df.columns = df.columns.str.strip()

    # ── 1-2. event_time ───────────────────────────────────────────────────────
    move_time = parse_datetime(df["Move Complete Time"], "Move Complete Time")
    time_in   = parse_datetime(df["Time In"],            "Time In")

    df["event_time"] = move_time.fillna(time_in)

    # ── 3. vessel departure (Time Out) ────────────────────────────────────────
    time_out = parse_datetime(df["Time Out"], "Time Out")
    df["vessel_departure"] = time_out

    # Drop rows where we have no usable event timestamp
    df = df.dropna(subset=["event_time"])

    if df.empty:
        return df

    # ── 4. Window filter ──────────────────────────────────────────────────────
    valid_out = df["vessel_departure"].dropna()

    if not valid_out.empty:
        # All rows in a visit share the same Time Out; take the modal value
        vessel_dep = valid_out.mode().iloc[0]

        window_start = vessel_dep - pd.Timedelta(hours=VESSEL_WINDOW_HOURS)
        window_end   = vessel_dep + pd.Timedelta(hours=1)   # tiny buffer

        df = df[
            (df["event_time"] >= window_start) &
            (df["event_time"] <= window_end)
        ].copy()

        # Store departure on all surviving rows (may have been NaT on some)
        df["vessel_departure"] = vessel_dep

    # Drop any rows that lost their event_time after filtering
    df = df.dropna(subset=["event_time"])

    if df.empty:
        return df

    # ── 5. Sort ascending ─────────────────────────────────────────────────────
    df = df.sort_values("event_time").reset_index(drop=True)

    return df


# =========================================================
# COMPUTE VISIT STAY
# =========================================================
def compute_visit_stay(df):
    """
    Returns the vessel port-call duration in hours.

        start = min(event_time)     ← first loading crane move
        end   = vessel_departure    ← Time Out (vessel leaves berth)
        stay  = (end - start) in hours

    If vessel_departure is unavailable, max(event_time) is used as end.
    Returns None if the DataFrame is empty or the stay is ≤ 0.
    """
    if df.empty:
        return None

    start = df["event_time"].min()

    # Use Time Out (vessel_departure) as end anchor when available
    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        end = valid_dep.iloc[0] if not valid_dep.empty else df["event_time"].max()
    else:
        end = df["event_time"].max()

    stay_hours = (end - start).total_seconds() / 3600

    if stay_hours <= 0:
        return None

    return round(stay_hours, 2)


# =========================================================
# COMPUTE VESSEL STAY  (all visits for one Outbound Service)
# =========================================================
def compute_vessel_stay(df, vessel_service):
    """
    Computes actual stay duration for every visit of an Outbound Service.

    Returns the result in the structure:
    {
      "Actual Outbound Carrier Visit ID": stay_hours
    }
    """
    df = df[
        df["Outbound Service"].astype(str).str.strip() == str(vessel_service)
    ].copy()

    if df.empty:
        return {}

    result = {}
    grouped = df.groupby("Actual Outbound Carrier visit ID")

    for visit_id, group in grouped:
        # Pre-process using our proper vessel date filters.
        # This properly excludes pre-staged containers (e.g. ones dropped off 2 months prior)
        # by bounding the operations to realistically occur around the 'Time Out'.
        visit_df = prepare_visit_data(group)
        
        if visit_df.empty:
            continue
            
        # compute_visit_stay evaluates end-time anchor properly (Time Out)
        stay_hours = compute_visit_stay(visit_df)
        
        if stay_hours is not None and stay_hours > 0:
            result[str(visit_id).strip()] = stay_hours

    if result:
        stay_values = list(result.values())
        return {
            "visits": result,
            "avg_hours": round(sum(stay_values) / len(stay_values), 2),
            "max_hours": round(max(stay_values), 2),
            "min_hours": round(min(stay_values), 2)
        }

    return {}