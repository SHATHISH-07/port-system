import pandas as pd
import re


def parse_datetime(series, col_name="unknown"):
    series = series.astype(str).str.strip()
    
    series = series.replace({
        "": pd.NaT,
        "nan": pd.NaT,
        "None": pd.NaT,
        "NULL": pd.NaT,
    })

    parsed = pd.to_datetime(series, format="%m/%d/%Y %H:%M", errors="coerce")

    mask = parsed.isna()
    if mask.any():
        parsed.loc[mask] = pd.to_datetime(
            series[mask], format="%m-%d-%Y %H:%M", errors="coerce"
        )

    mask = parsed.isna()
    if mask.any():
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            parsed.loc[mask] = pd.to_datetime(series[mask], format="mixed", errors="coerce")

    return parsed