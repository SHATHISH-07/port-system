import re
from typing import Optional

def _normalise(s: str) -> str:
    """Strip, uppercase, collapse whitespace."""
    return " ".join(s.strip().upper().split())

def parse_position(pos: str) -> Optional[dict]:
    """
    Robustly parse terminal position strings (Yard and Vessel).
    Returns a dict with: type, is_vessel, is_yard, block, row, bay, tier.
    Returns None if the position is malformed or unidentifiable.
    """
    if not pos:
        return None
    
    value = str(pos).strip().upper()
    if not value:
        return None

    # Helper to return structured result
    def res(p_type, block, row=None, bay=None, tier=None):
        return {
            "type": p_type,
            "is_vessel": p_type == "VESSEL",
            "is_yard": p_type == "YARD",
            "block": str(block) if block else "UNKNOWN",
            "row": str(row) if row else "0",
            "bay": str(bay) if bay else "0",
            "tier": str(tier) if tier else "1"
        }

    # 1. Vessel Positions (V-VisitID-Slot or V-Slot)
    # Match V- followed by something
    if value.startswith("V-"):
        # Try to extract slot if it's V-VISIT-SLOT
        parts = value.split("-")
        if len(parts) >= 3:
            return res("VESSEL", "VESSEL", None, None, parts[-1])
        return res("VESSEL", "VESSEL", None, None, None)

    # 2. Yard Positions (Y-...)
    if value.startswith("Y-"):
        # Pattern A: Y-SITE-BLOCK-BAYROWTIER (e.g. Y-PEB-3A32285C1)
        # We look for a pattern like G1-32-28-5
        # Actually the samples show: Y-PEB-3A32285C1
        # Let's try to extract block from the 3rd part
        parts = value.split("-")
        if len(parts) >= 3:
            site_block = parts[2]
            # Try to split site_block into block and the rest
            # Usually Block is 2 chars like 3A
            if len(site_block) >= 2:
                block = site_block[:2]
                remainder = site_block[2:]
                # Further parsing of remainder if needed
                return res("YARD", block, None, None, None)
        
        # Pattern B: Y-CGSA-3A 29 A 2
        if "CGSA" in value:
            match = re.search(r'Y-CGSA-([A-Z0-9]+)\s+(\d+)\s+([A-Z]+)\s+(\d+)', value)
            if match:
                return res("YARD", match.group(1), match.group(3), match.group(2), match.group(4))

        # Pattern C: Y-CWIT-1A003C.5
        if "CWIT" in value:
            match = re.search(r'Y-CWIT-(\d+[A-Z])(\d{3})([A-Z])\.(\d+)', value)
            if match:
                return res("YARD", match.group(1), match.group(3), match.group(2), match.group(4))

        # Generic YARD fallback
        return res("YARD", "YARD", None, None, None)

    # 3. Dotted / Numeric Formats (e.g. 02.097.2)
    # Pattern: BLOCK.BAY.TIER or BLOCK.ROW.BAY.TIER
    if "." in value:
        dots = value.split(".")
        if len(dots) == 3:
            return res("YARD", dots[0], None, dots[1], dots[2])
        if len(dots) == 4:
            return res("YARD", dots[0], dots[1], dots[2], dots[3])

    return None

def extract_block(pos: str) -> Optional[str]:
    """Helper for legacy code that just wants the block name."""
    p = parse_position(pos)
    return p["block"] if p else None

def is_vessel_pos(pos: str) -> bool:
    p = parse_position(pos)
    return p["is_vessel"] if p else False

def is_yard_pos(pos: str) -> bool:
    p = parse_position(pos)
    return p["is_yard"] if p else False
