import re
from typing import Any, Dict, Optional


def parse_vessel_slot(slot_str: str) -> Optional[Dict[str, Any]]:
    """
    Parses a vessel slot string, e.g. V-MAE180253-942119
    Returns the parsed components with a configurable decoded block if it matches standards.
    """
    if not slot_str:
        return None

    parts = slot_str.split("-")
    if len(parts) >= 3 and parts[0].upper() == "V":
        visit_id = parts[1]
        raw_slot = parts[2]
        clean_slot = raw_slot.strip()

        parsed = {
            "type": "VESSEL",
            "visitId": visit_id,
            "slot": clean_slot,
            "rawSlot": raw_slot,
            "parsedSlot": clean_slot,
            "decoded": {}
        }

        if len(clean_slot) == 6 and clean_slot.isdigit():
            parsed["decoded"] = {
                "bay": clean_slot[0:2],
                "row": clean_slot[2:4],
                "tier": clean_slot[4:6]
            }

        return parsed

    return None


def parse_yard_slot(slot_str: str) -> Optional[Dict[str, Any]]:
    """
    Parses a yard position string, e.g. Y-PEB-D45873C3
    """
    if not slot_str:
        return None

    parts = slot_str.split("-")
    if len(parts) >= 3 and parts[0].upper() == "Y":
        yard_area = parts[1]
        raw_slot = parts[2]

        match = re.match(r"^([A-Za-z]+)(\d+.*)$", raw_slot)
        block = match.group(1).upper() if match else raw_slot[0:1].upper()

        return {
            "type": "YARD",
            "terminal": yard_area,
            "yardArea": yard_area,
            "block": block,
            "slot": raw_slot,
            "rawSlot": raw_slot
        }

    return None


__all__ = ["parse_vessel_slot", "parse_yard_slot"]