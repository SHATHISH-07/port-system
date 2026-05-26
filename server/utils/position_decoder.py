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