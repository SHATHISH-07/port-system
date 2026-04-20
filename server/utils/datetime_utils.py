import pandas as pd
import re


def parse_datetime(series, col_name="unknown"):
    """
    Robustly parse datetime series that may contain mixed formats:
      - MM/DD/YYYY HH:MM  (slash-separated date)
      - MM-DD-YYYY HH:MM  (dash-separated date)

    Strategy:
      1. Normalise: strip whitespace, replace sentinel nulls.
      2. Detect separator (/ or -) at the date part and try the matching format.
      3. First pass  → %m/%d/%Y %H:%M  (slash dates)
      4. Second pass → %m-%d-%Y %H:%M  (dash dates, for rows still NaT)
      5. Final flexible fallback via pd.to_datetime(infer_datetime_format=True)
    """

    series = series.astype(str).str.strip()

    # Replace known null sentinels
    series = series.replace({
        "": pd.NaT,
        "nan": pd.NaT,
        "None": pd.NaT,
        "NULL": pd.NaT,
    })

    # --- Pass 1: slash format  MM/DD/YYYY HH:MM ---
    parsed = pd.to_datetime(series, format="%m/%d/%Y %H:%M", errors="coerce")

    # --- Pass 2: dash format   MM-DD-YYYY HH:MM ---
    mask = parsed.isna()
    if mask.any():
        parsed.loc[mask] = pd.to_datetime(
            series[mask], format="%m-%d-%Y %H:%M", errors="coerce"
        )

    # --- Pass 3: flexible fallback (catches any remaining oddities) ---
    mask = parsed.isna()
    if mask.any():
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            parsed.loc[mask] = pd.to_datetime(series[mask], format="mixed", errors="coerce")

    return parsed