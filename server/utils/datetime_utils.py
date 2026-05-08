from __future__ import annotations
import logging
import warnings
from datetime import datetime
import pandas as pd

logger = logging.getLogger("port_system")

# list of datetime formats
_FORMATS: list[str] = [
    # Container CSVs — most common
    "%m/%d/%Y %H:%M:%S",   # 11/14/2025 21:58:00
    "%m/%d/%Y %H:%M",      # 11/14/2025 21:58  (also handles "9:01" single-digit)

    # Crane CSV: "25-Nov-14 2158"  (YY-Mon-DD HHMM, no colon)
    "%y-%b-%d %H%M",       # 2-digit year variant  ← PRIMARY crane format
    "%Y-%b-%d %H%M",       # 4-digit year variant  (defensive)

    # ISO / DB round-trip
    "%Y-%m-%dT%H:%M:%S",   # 2025-11-14T21:58:00
    "%Y-%m-%d %H:%M:%S",   # 2025-11-14 21:58:00
    "%Y-%m-%d %H:%M",      # 2025-11-14 21:58

    # Regional variants (less common, kept as fallback)
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%m-%d-%Y %H:%M",
]

# function to parse datetime columns
def parse_datetime(series: pd.Series | None, col_name: str = "unknown") -> pd.Series:
    # check if series is empty
    if series is None:
        return pd.Series(dtype="datetime64[ns]")

    # check if series is already datetime
    if pd.api.types.is_datetime64_any_dtype(series):
        return series

    # convert series to object and copy
    s = pd.Series(series, dtype=object).copy()

    # normalize strings
    s = s.astype(str).str.strip()
    _SENTINELS = {"", "nan", "none", "null", "nat", "n/a", "na", "-"}
    s = s.where(~s.str.lower().isin(_SENTINELS), other=pd.NA)

    # create a new series to store parsed datetimes
    parsed = pd.Series([pd.NaT] * len(s), index=s.index, dtype="datetime64[ns]")

    # format-by-format pass
    for fmt in _FORMATS:
        # mask for values that are not yet parsed and not null
        mask = parsed.isna() & s.notna()
        # break if no values need to be parsed
        if not mask.any():
            break
        try:
            # attempt to parse with current format
            attempt = pd.to_datetime(s[mask], errors="coerce", format=fmt)
            # update parsed series with successfully parsed values
            parsed.loc[mask] = attempt
        except Exception:
            pass

    # final fallback: pandas mixed-format inference
    remaining = parsed.isna() & s.notna()
    if remaining.any():
        # ignore warnings from pandas
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            # try different pandas parsing methods
            for method in (
                lambda x: pd.to_datetime(x, errors="coerce", format="mixed"),
                lambda x: pd.to_datetime(x, errors="coerce", infer_datetime_format=True),
                lambda x: pd.to_datetime(x, errors="coerce"),
            ):
                still_nat = parsed.isna() & s.notna()
                # break if no values need to be parsed
                if not still_nat.any():
                    break
                try:
                    # attempt to parse with current method
                    parsed.loc[still_nat] = method(s[still_nat])
                except Exception:
                    pass

    # Log how many values could not be parsed (useful for debugging)
    n_failed = parsed.isna().sum() - s.isna().sum()
    if n_failed > 0:
        logger.debug(
            "parse_datetime[%s]: %d value(s) could not be parsed",
            col_name, max(n_failed, 0),
        )

    return parsed

# function to convert datetime to JSON safe string
def to_json_safe(obj) -> str | None:
    # if obj is None, return None
    if obj is None:
        return None
    # if obj is datetime or timestamp, convert to ISO string
    if isinstance(obj, (datetime, pd.Timestamp)):
        return pd.Timestamp(obj).isoformat()
    # otherwise, convert to string
    return str(obj)