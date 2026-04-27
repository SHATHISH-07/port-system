import pandas as pd
from utils.datetime_utils import parse_datetime

VESSEL_WINDOW_HOURS = 96

def prepare_visit_data(df):
    df = df.copy()
    df.columns = df.columns.str.strip()

    move_time = parse_datetime(df["Move Complete Time"], "Move Complete Time")
    time_in   = parse_datetime(df["Time In"],            "Time In")

    df["event_time"] = move_time.fillna(time_in)

    time_out = parse_datetime(df["Time Out"], "Time Out")
    df["vessel_departure"] = time_out

    df = df.dropna(subset=["event_time"])

    if df.empty:
        return df

    valid_out = df["vessel_departure"].dropna()

    if not valid_out.empty:
        vessel_dep = valid_out.mode().iloc[0]

        window_start = vessel_dep - pd.Timedelta(hours=VESSEL_WINDOW_HOURS)
        window_end   = vessel_dep + pd.Timedelta(hours=1) 

        df = df[
            (df["event_time"] >= window_start) &
            (df["event_time"] <= window_end)
        ].copy()

        df["vessel_departure"] = vessel_dep

    df = df.dropna(subset=["event_time"])

    if df.empty:
        return df

    df = df.sort_values("event_time").reset_index(drop=True)

    return df

def compute_visit_stay(df):
    if df.empty:
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

def compute_vessel_stay(df, vessel_service):
    df = df[
        df["Outbound Service"].astype(str).str.strip() == str(vessel_service)
    ].copy()

    if df.empty:
        return {}

    result = {}
    grouped = df.groupby("Actual Outbound Carrier visit ID")

    for visit_id, group in grouped:
        visit_df = prepare_visit_data(group)
        
        if visit_df.empty:
            continue
        
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