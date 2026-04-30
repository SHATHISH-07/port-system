import pandas as pd
from utils.datetime_utils import parse_datetime

VESSEL_WINDOW_HOURS = 96

def prepare_visit_data(df):
    # Copy dataframe
    df = df.copy()
    # Strip whitespace from column names
    df.columns = df.columns.str.strip()

    # Parse event time
    move_time = parse_datetime(df["Move Complete Time"], "Move Complete Time")
    time_in   = parse_datetime(df["Time In"],            "Time In")
    
    # Combine move time and time in
    df["event_time"] = move_time.fillna(time_in)

    # Parse vessel departure
    time_out = parse_datetime(df["Time Out"], "Time Out")
    df["vessel_departure"] = time_out

    # Drop rows with no event time
    df = df.dropna(subset=["event_time"])

    # Check if the dataframe is empty
    if df.empty:
        return df

    # Get valid vessel departure
    valid_out = df["vessel_departure"].dropna()

    if not valid_out.empty:
        vessel_dep = valid_out.mode().iloc[0]
    
        # Calculate time window
        window_start = vessel_dep - pd.Timedelta(hours=VESSEL_WINDOW_HOURS)
        window_end   = vessel_dep + pd.Timedelta(hours=1) 

        # Filter data within the time window
        df = df[
            (df["event_time"] >= window_start) &
            (df["event_time"] <= window_end)
        ].copy()

        df["vessel_departure"] = vessel_dep
        
    df = df.dropna(subset=["event_time"])

    # Check if the dataframe is empty
    if df.empty:
        return df

    # Sort by event time
    df = df.sort_values("event_time").reset_index(drop=True)

    return df

# Compute visit stay
def compute_visit_stay(df):
    if df.empty:
        return None
    
    # Get start time
    start = df["event_time"].min()

    if "vessel_departure" in df.columns:
        valid_dep = df["vessel_departure"].dropna()
        end = valid_dep.iloc[0] if not valid_dep.empty else df["event_time"].max()
    else:
        end = df["event_time"].max()

    # Calculate stay hours
    stay_hours = (end - start).total_seconds() / 3600

    # Return stay hours if positive
    if stay_hours <= 0:
        return None

    return round(stay_hours, 2)


# Compute vessel stay
def compute_vessel_stay(prepared_visits: dict):
    # Initialize result dictionary
    result = {}
    
    # Compute stay for each visit
    for visit_id, visit_df in prepared_visits.items():
        if visit_df.empty:
            continue
        
        # Compute stay for each visit
        stay_hours = compute_visit_stay(visit_df)
        
        if stay_hours is not None and stay_hours > 0:
            result[str(visit_id).strip()] = stay_hours

    # Return result if not empty
    if result:
        stay_values = list(result.values())
        return {
            "visits": result,
            "avg_hours": round(sum(stay_values) / len(stay_values), 2),
            "max_hours": round(max(stay_values), 2),
            "min_hours": round(min(stay_values), 2)
        }

    return {}