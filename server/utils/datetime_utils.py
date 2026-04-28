import pandas as pd
import warnings

# Parse datetime series with multiple formats
def parse_datetime(series, col_name="unknown"):
    # Convert to string and strip whitespace
    series = series.astype(str).str.strip()
    
    # Replace empty strings and NaT values
    series = series.replace({
        "": pd.NaT,
        "nan": pd.NaT,
        "None": pd.NaT,
        "NULL": pd.NaT,
    })

    # Parse datetime with format %m/%d/%Y %H:%M
    parsed = pd.to_datetime(series, format="%m/%d/%Y %H:%M", errors="coerce")

    # Check if there are any NaT values
    mask = parsed.isna()
    if mask.any():
        parsed.loc[mask] = pd.to_datetime(
            series[mask], format="%m-%d-%Y %H:%M", errors="coerce"
        )

    # Check if there are any NaT values
    mask = parsed.isna()
    if mask.any():
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            parsed.loc[mask] = pd.to_datetime(series[mask], format="mixed", errors="coerce")

    return parsed