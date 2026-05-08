"""
utils/datetime_utils.py
-----------------------
Robust datetime parsing that handles all formats in this codebase.

Supported formats
-----------------
  Container datasets  : "11/14/2025 21:58"    (%m/%d/%Y %H:%M)
                        "11/14/2025 21:58:00"  (%m/%d/%Y %H:%M:%S)
                        "11/15/2025 9:01"      (single-digit hour — handled by pandas)
  Crane dataset       : "25-Nov-14 2158"       (%y-%b-%d %H%M)  ← YY-Mon-DD HHMM
  ISO / DB round-trip : "2025-11-14T21:58:00"
                        "2025-11-14 21:58:00"

Format notes
------------
• "%m/%d/%Y %H:%M" correctly parses both "21:58" and "9:01" — Python's strptime
  pads single-digit hours automatically, so no special case is needed.

• Crane format "25-Nov-14 2158" = YY-Mon-DD HHMM (no colon between HH and MM).
  Correct strptime: "%y-%b-%d %H%M"  → 2025-11-14 21:58 ✓
  Wrong   strptime: "%d-%b-%y %H%M"  → 2014-11-25 21:58 ✗

• "%H%M" (no separator) only works inside strptime when it is the entire
  remaining token — pandas handles this correctly with format=.
"""
from __future__ import annotations

import logging
import warnings
from datetime import datetime

import pandas as pd

logger = logging.getLogger("port_system")

# ── Format list ────────────────────────────────────────────────────────────────
# Order matters: more specific / more common formats first.
# Formats that share a common prefix are ordered longest-first so the more
# specific one (with seconds) is tried before the shorter one.
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


def parse_datetime(series: pd.Series | None, col_name: str = "unknown") -> pd.Series:
    """Parse a datetime-like Series, trying multiple explicit formats.

    Strategy
    --------
    1. Return immediately if already datetime64.
    2. Normalise the string representation (strip, replace sentinel strings).
    3. Walk through _FORMATS one by one.  For each format, only attempt rows
       that are still NaT so we never overwrite a successfully parsed value.
    4. Final fallback: pandas mixed-format inference (handles anything we missed).

    Returns a timezone-naive datetime64[ns] Series.
    Unparseable values become NaT — this function never raises.
    """
    if series is None:
        return pd.Series(dtype="datetime64[ns]")

    # Already parsed
    if pd.api.types.is_datetime64_any_dtype(series):
        return series

    s = pd.Series(series, dtype=object).copy()

    # ── Normalise strings ──────────────────────────────────────────────────────
    s = s.astype(str).str.strip()
    _SENTINELS = {"", "nan", "none", "null", "nat", "n/a", "na", "-"}
    s = s.where(~s.str.lower().isin(_SENTINELS), other=pd.NA)

    parsed = pd.Series([pd.NaT] * len(s), index=s.index, dtype="datetime64[ns]")

    # ── Format-by-format pass ──────────────────────────────────────────────────
    for fmt in _FORMATS:
        mask = parsed.isna() & s.notna()
        if not mask.any():
            break
        try:
            attempt = pd.to_datetime(s[mask], errors="coerce", format=fmt)
            parsed.loc[mask] = attempt
        except Exception:
            pass  # format not applicable, try next

    # ── Final fallback: pandas mixed-format inference ──────────────────────────
    remaining = parsed.isna() & s.notna()
    if remaining.any():
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            for method in (
                lambda x: pd.to_datetime(x, errors="coerce", format="mixed"),
                lambda x: pd.to_datetime(x, errors="coerce", infer_datetime_format=True),
                lambda x: pd.to_datetime(x, errors="coerce"),
            ):
                still_nat = parsed.isna() & s.notna()
                if not still_nat.any():
                    break
                try:
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


def to_json_safe(obj) -> str | None:
    """Convert a datetime/Timestamp to ISO string, or return None."""
    if obj is None:
        return None
    if isinstance(obj, (datetime, pd.Timestamp)):
        return pd.Timestamp(obj).isoformat()
    return str(obj)