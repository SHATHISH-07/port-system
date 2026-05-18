import re
from typing import Any, Dict, Optional


def parse_vessel_slot(slot_str: str) -> Optional[Dict[str, Any]]:
    """
    Parses vessel position strings like:
    V-MAE180253-942119
    """
    if not slot_str:
        return None

    parts = str(slot_str).split("-")
    if len(parts) < 3 or parts[0].upper() != "V":
        return None

    visit_id = parts[1].strip()
    raw_slot = parts[2].strip()

    parsed = {
        "type": "VESSEL",
        "visitId": visit_id,
        "slot": raw_slot,
        "rawSlot": raw_slot,
        "parsedSlot": raw_slot,
        "decoded": {}
    }

    if len(raw_slot) >= 6 and raw_slot.isdigit():
        parsed["decoded"] = {
            "bay": raw_slot[0:2],
            "row": raw_slot[2:4],
            "tier": raw_slot[4:6]
        }

    return parsed


def parse_yard_slot(slot_str: str) -> Optional[Dict[str, Any]]:
    """
    Parses yard position strings like:
    Y-PEB-D45873C3
    """
    if not slot_str:
        return None

    parts = str(slot_str).split("-")
    if len(parts) < 3 or parts[0].upper() != "Y":
        return None

    yard_area = parts[1].strip()
    raw_slot = parts[2].strip()

    match = re.match(r"^([A-Za-z]+)(\d+.*)$", raw_slot)
    block = match.group(1).upper() if match else raw_slot[:1].upper()

    return {
        "type": "YARD",
        "terminal": yard_area,
        "yardArea": yard_area,
        "block": block,
        "slot": raw_slot,
        "rawSlot": raw_slot
    }


def classify_deck_position(weight_band: str) -> str:
    """
    Heavy   -> BELOW_DECK
    Light   -> ABOVE_DECK
    Medium  -> BELOW_DECK
    """
    band = str(weight_band).strip().upper()
    if band == "HEAVY":
        return "BELOW_DECK"
    if band == "LIGHT":
        return "ABOVE_DECK"
    return "BELOW_DECK"