from __future__ import annotations
import re
from typing import Any
import pandas as pd

_BLOCK_RE = re.compile(r"^([A-Z]?\d{2,3})", re.IGNORECASE)

# NaN-safe helpers
def _safe_str(value) -> str | None:
    # return a clean string or None for null-like values (including NaN).
    if value is None:
        return None
    # pandas NaN check
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    # empty or "nan" strings
    s = str(value).strip()
    if s.lower() in ("", "nan", "none", "null", "nat"):
        return None
    return s

def get_yard_id(row: Any) -> str | None:
    """Extract yard ID dynamically from position fields — no hardcoded yard names."""
    for field in ["yard_id", "ctr_from_position", "ctr_to_position", "from_position", "to_position", "current_position"]:
        val = _safe_str(_row_get(row, field))
        if val:
            vu = val.upper()
            # Yard position: Y-<TERMINAL>-<slot> — extract terminal dynamically
            if vu.startswith("Y-") and "-" in vu[2:]:
                parts = val.split("-")
                if len(parts) >= 3:
                    return parts[1].upper()
            # Plain named yard (already a terminal ID)
            if re.match(r'^[A-Z]{2,6}$', vu):
                return vu
    return None

# Safe row value accessor (NaN-proof)
def _row_get(row: Any, key: str):
    # Handle None
    if row is None:
        return None
    # Handle dict-like rows (dict, pandas Series)
    if hasattr(row, "get"):
        try:
            return row.get(key)
        except Exception:
            pass
    # Handle array-like rows
    try:
        return row[key]
    except Exception:
        return None

# Core parser
def parse_position(raw) -> dict | None:
    # return a normalized dict for any position string.
    # return None for empty or unrecognised values.
    s = _safe_str(raw)
    if s is None:
        return None

    su = s.upper()

    # Vessel: V-<visit>-<slot>
    if su.startswith("V-"):
        parts = s.split("-")
        slot = parts[-1] if len(parts) >= 3 else "0"
        return {
            "raw": s,
            "is_vessel": True,
            "is_yard": False,
            "terminal": "VESSEL",
            "block": "VESSEL",
            "row": "0",
            "bay": "0",
            "tier": slot,
        }

    # Y-PEB-...
    if su.startswith("Y-PEB-"):
        suffix = s[6:]

        # Example: G23454C1
        # block=G, bay=234, row=54, tier=1
        m = re.match(r"^([A-Z])(\d{3})(\d{2})([A-Z])(\d+)$", suffix, re.IGNORECASE)
        if m:
            block, bay, row, _sep, tier = m.groups()
            return {
                "raw": s,
                "is_vessel": False,
                "is_yard": True,
                "terminal": "PEB",
                "block": block.upper(),
                "row": row,
                "bay": bay,
                "tier": tier,
            }

        # Example: 3A03859C1
        # block=3A, bay=038, row=59, tier=1
        m = re.match(r"^([0-9]?[A-Z]{1,2})(\d{3})(\d{2})([A-Z])(\d+)$", suffix, re.IGNORECASE)
        if m:
            block, bay, row, _sep, tier = m.groups()
            return {
                "raw": s,
                "is_vessel": False,
                "is_yard": True,
                "terminal": "PEB",
                "block": block.upper(),
                "row": row,
                "bay": bay,
                "tier": tier,
            }

        # Example: RE22369C1
        # block=RE, bay=223, row=69, tier=1
        m = re.match(r"^([A-Z]{1,2})(\d{3})(\d{2})([A-Z])(\d+)$", suffix, re.IGNORECASE)
        if m:
            block, bay, row, _sep, tier = m.groups()
            return {
                "raw": s,
                "is_vessel": False,
                "is_yard": True,
                "terminal": "PEB",
                "block": block.upper(),
                "row": row,
                "bay": bay,
                "tier": tier,
            }

        # Fallback
        return {
            "raw": s,
            "is_vessel": False,
            "is_yard": True,
            "terminal": "PEB",
            "block": suffix[:4] if len(suffix) >= 4 else suffix,
            "row": "0",
            "bay": "0",
            "tier": "1",
        }

    # Y-CWIT-... 
    if su.startswith("Y-CWIT-"):
        suffix = s[7:]
        # Example: 1A003C.5
        m = re.match(r"^(\d+)([A-Z])(\d{3})([A-Z])\.(\d+)$", suffix, re.IGNORECASE)
        if m:
            section, block, bay, row, tier = m.groups()
            return {
                "raw": s,
                "is_vessel": False,
                "is_yard": True,
                "terminal": "CWIT",
                "block": f"{section}{block.upper()}",
                "row": row.upper(),
                "bay": bay,
                "tier": tier,
            }

        # Example: 1AW026 / 1AL003 style transfer zone
        m = re.match(r"^(\d+)([A-Z])[WL](\d{3})$", suffix, re.IGNORECASE)
        if m:
            section, block, bay = m.groups()
            return {
                "raw": s,
                "is_vessel": False,
                "is_yard": True,
                "terminal": "CWIT",
                "block": f"{section}{block.upper()}",
                "row": "0",
                "bay": bay,
                "tier": "1",
            }

        return {
            "raw": s,
            "is_vessel": False,
            "is_yard": True,
            "terminal": "CWIT",
            "block": suffix[:4] if len(suffix) >= 4 else suffix,
            "row": "0",
            "bay": "0",
            "tier": "1",
        }

    # Generic Y-<TERMINAL>-<...>
    if su.startswith("Y-"):
        parts = s.split("-")
        terminal = parts[1].upper() if len(parts) >= 2 else "YARD"
        token = parts[2] if len(parts) >= 3 else ""
        # Example: 1A003C.5
        m = re.match(r"^([A-Z0-9]+?)(\d{2,4})([A-Z]|\d{2})\.?(\d+)$", token, re.IGNORECASE)
        if m:
            block, bay, row, tier = m.groups()
            return {
                "raw": s,
                "is_vessel": False,
                "is_yard": True,
                "terminal": terminal,
                "block": block.upper(),
                "bay": bay,
                "row": row.upper() if isinstance(row, str) else str(row),
                "tier": tier,
            }
        # Fallback
        return {
            "raw": s,
            "is_vessel": False,
            "is_yard": True,
            "terminal": terminal,
            "block": token[:6] if token else terminal,
            "row": "0",
            "bay": "0",
            "tier": "1",
        }

    # Bare dot-separated yard positions
    if "." in s:
        parts = s.split(".")
        m = _BLOCK_RE.match(parts[0])
        block = m.group(1).upper() if m else parts[0].upper()
        # block.bay.tier
        if len(parts) == 3:
            _, bay, tier = parts
            return {
                "raw": s,
                "is_vessel": False,
                "is_yard": True,
                "terminal": "YARD",
                "block": block,
                "row": "0",
                "bay": bay,
                "tier": tier,
            }
        # block.row.bay.tier
        if len(parts) == 4:
            _, row, bay, tier = parts
            return {
                "raw": s,
                "is_vessel": False,
                "is_yard": True,
                "terminal": "YARD",
                "block": block,
                "row": row,
                "bay": bay,
                "tier": tier,
            }
        # Fallback
        return {
            "raw": s,
            "is_vessel": False,
            "is_yard": True,
            "terminal": "YARD",
            "block": block,
            "row": "0",
            "bay": parts[1] if len(parts) > 1 else "0",
            "tier": parts[-1],
        }

    # Bare alphanumeric fallback
    if re.match(r"^[A-Z0-9]{2,}$", s, re.IGNORECASE):
        return {
            "raw": s,
            "is_vessel": False,
            "is_yard": True,
            "terminal": "YARD",
            "block": s.upper(),
            "row": "0",
            "bay": "0",
            "tier": "1",
        }

    return None

# Convenience helpers
def is_vessel_pos(pos) -> bool:
    p = parse_position(pos)
    return bool(p and p["is_vessel"])

# check if the position is yard
def is_yard_pos(pos) -> bool:
    p = parse_position(pos)
    return bool(p and p["is_yard"])

# classify a move.
def classify_move(from_pos, to_pos) -> str:
    # LOAD      : Yard  -> Vessel
    # DISCHARGE : Vessel -> Yard
    # SHIFT     : Yard  -> Yard  |  Vessel -> Vessel
    # UNKNOWN   : missing / unrecognised positions
    f_p = parse_position(from_pos)
    t_p = parse_position(to_pos)
    # check if the positions are yard or vessel
    f_y = bool(f_p and f_p["is_yard"])
    f_v = bool(f_p and f_p["is_vessel"])
    t_y = bool(t_p and t_p["is_yard"])
    t_v = bool(t_p and t_p["is_vessel"])
    # classify the move
    if f_y and t_v:
        return "LOAD"
    # DISCHARGE : Vessel -> Yard
    if f_v and t_y:
        return "DISCHARGE"
    # SHIFT     : Yard  -> Yard  |  Vessel -> Vessel
    if (f_y and t_y) or (f_v and t_v):
        return "SHIFT"
    # UNKNOWN   : missing / unrecognised positions
    return "UNKNOWN"

# safe get position
def safe_get_pos(row: dict, *keys) -> str | None:
    # Return the first non-null value from a row using case-insensitive keys.
    # This is safe for pandas NaN and handles title-case / snake_case columns.
    if row is None:
        return None
    # check for the keys
    for key in keys:
        candidates = [
            key,
            key.lower(),
            key.upper(),
            key.title(),
            key.replace(" ", "_"),
            key.replace("_", " "),
        ]
        # check for the candidates
        for cand in dict.fromkeys(candidates):
            value = _row_get(row, cand)
            s = _safe_str(value)
            if s is not None:
                return s

    return None

# block label
def block_label(parsed: dict | None) -> str | None:
    # Return a display-ready block label like 'D08' or 'PEB-3A'.
    if not parsed or not parsed.get("is_yard"):
        return None
    # get the terminal and block
    terminal = parsed.get("terminal") or "YARD"
    block = parsed.get("block") or "UNKNOWN"
    # return the block label
    return block if terminal in ("YARD", "UNKNOWN") else f"{terminal}-{block}"
