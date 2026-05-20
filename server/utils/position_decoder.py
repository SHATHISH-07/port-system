import re
from typing import Any, Dict, Optional


def parse_vessel_slot(slot_str: str) -> Optional[Dict[str, Any]]:
    """
    Parses vessel position strings like:
        V-MAE180253-942119
        V-8YF180025-147623

    The 6-digit slot encodes bay (BB), row (RR), tier (TT).
    Tier >= 80 => ABOVE_DECK (on-deck / hatch cover stow).
    Tier <  80 => BELOW_DECK (hold stow).
    """
    if not slot_str:
        return None
    parts = str(slot_str).split("-")
    if len(parts) < 3 or parts[0].upper() != "V":
        return None

    visit_id = parts[1].strip()
    raw_slot = parts[2].strip()

    parsed: Dict[str, Any] = {
        "type": "VESSEL",
        "visitId": visit_id,
        "slot": raw_slot,
        "rawSlot": raw_slot,
        "parsedSlot": raw_slot,
        "decoded": {},
    }

    if len(raw_slot) >= 6 and raw_slot.isdigit():
        parsed["decoded"] = {
            "bay": raw_slot[0:2],
            "row": raw_slot[2:4],
            "tier": raw_slot[4:6],
        }

    return parsed


def parse_yard_slot(slot_str: str) -> Optional[Dict[str, Any]]:
    """
    Parses yard position strings from two terminal formats:

    PEB terminal  – block letter comes first:
        Y-PEB-A87289C1   => block = 'A'
        Y-PEB-F50615C4   => block = 'F'

    CWIT terminal – a numeric zone prefix comes before the block letter:
        Y-CWIT-1A821N.2  => block = '1A'   (zone 1, block A)
        Y-CWIT-2C676K.3  => block = '2C'   (zone 2, block C)
        Y-CWIT-3D948A.4  => block = '3D'   (zone 3, block D)

    The fix covers the CWIT pattern: when the raw slot starts with one or
    more digits immediately followed by one or more letters (and then more
    characters), the block identifier is the leading <digits><letters> prefix
    (e.g. '1A', '2C', '3D').  For the PEB pattern the original letter-first
    regex is unchanged.
    """
    if not slot_str:
        return None

    parts = str(slot_str).split("-")
    if len(parts) < 3 or parts[0].upper() != "Y":
        return None

    yard_area = parts[1].strip()
    raw_slot = parts[2].strip()

    block = _extract_yard_block(raw_slot)

    decoded_coords = {}
    if "CWIT" in yard_area.upper():
        m = re.match(r"^(\d+)([A-Z]+)(\d+)([A-Z])\.(\d+)$", raw_slot.upper())
        if m:
            decoded_coords = {
                "zone": m.group(1),
                "block_letter": m.group(2),
                "yard_row": int(m.group(3)),
                "yard_col": m.group(4),
                "yard_tier": int(m.group(5)),
            }
    else:
        m = re.match(r"^([A-Z]+)(\d+)([A-Z]+)(\d+)$", raw_slot.upper())
        if m:
            decoded_coords = {
                "yard_row": int(m.group(2)),
                "yard_col": m.group(3),
                "yard_tier": int(m.group(4)),
            }

    return {
        "type": "YARD",
        "terminal": yard_area,
        "yardArea": yard_area,
        "block": block,
        "slot": raw_slot,
        "rawSlot": raw_slot,
        "decoded_coords": decoded_coords,
    }


def _extract_yard_block(raw_slot: str) -> str:
    """
    Extract the logical block identifier from a raw yard slot string.

    Two patterns handled:

    1. Letter-first (PEB style): starts with one or more letters, then digits.
       Regex ^([A-Za-z]+)(\d+.*)$ captures the leading letters as the block.
       Examples: 'A87289C1' -> 'A', 'F50615C4' -> 'F'

    2. Digit-then-letter (CWIT style): starts with one or more digits followed
       by one or more letters.  The block is the combined <digit(s)><letter(s)>
       prefix before the remaining numeric content.
       Examples: '1A821N.2' -> '1A', '2C676K.3' -> '2C', '3D948A.4' -> '3D'

    Falls back to the first character (uppercased) when neither pattern matches.
    """
    # Pattern 1: letter-first (PEB and similar)
    m_letter_first = re.match(r"^([A-Za-z]+)\d", raw_slot)
    if m_letter_first:
        return m_letter_first.group(1).upper()

    # Pattern 2: digit(s) then letter(s) (CWIT zone+block prefix)
    m_digit_letter = re.match(r"^(\d+[A-Za-z]+)", raw_slot)
    if m_digit_letter:
        prefix = m_digit_letter.group(1)
        # Keep digits + the immediately following letters only (stop before next digit)
        m_trim = re.match(r"^(\d+[A-Za-z]+?)(?=\d|$)", prefix)
        return (m_trim.group(1) if m_trim else prefix).upper()

    # Fallback
    return raw_slot[:1].upper()