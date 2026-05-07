import re
from typing import Optional


def _normalise(s: str) -> str:
    """Strip, uppercase, collapse whitespace."""
    return " ".join(s.strip().upper().split())


def parse_position(pos, position_format: Optional[str] = None) -> Optional[dict]:
    """
    Parse common terminal yard position formats into a structured result.

    Returns a dict with keys: FullStack, Block, Row, Bay, Bays, Tier
    or None if the position cannot be parsed.
    """
    if not pos:
        return None
    value = str(pos).strip()
    if not value:
        return None

    def as_result(block, row=None, bay=None, tier=None):
        return {
            "FullStack": "-".join(str(v) for v in [block, row, bay] if v not in (None, "")),
            "Block":     str(block),
            "Row":       str(row) if row is not None else "UNKNOWN",
            "Bay":       str(bay) if bay is not None else None,
            "Bays":      {str(bay)} if bay is not None else {str(block)},
            "Tier":      int(tier) if tier is not None and str(tier).isdigit() else tier,
        }

    # ── Specialized terminal formats ─────────────────────────────────────────
    cgsa = extract_stack_tier_cgsa(value)
    if cgsa:
        return cgsa

    cwit = extract_stack_tier_cwit(value)
    if cwit:
        return cwit

    # ── Dotted formats: BLOCK.ROW.BAY.TIER  or  BLOCK.BAY.TIER ──────────────
    if re.fullmatch(r"[A-Za-z0-9]+[.][A-Za-z0-9]+[.]\d+[.]\d+", value):
        block, row, bay, tier = value.split(".")
        return as_result(block, row, bay, tier)

    if re.fullmatch(r"[A-Za-z0-9]+[.]\d+[.]\d+", value):
        block, bay, tier = value.split(".")
        return as_result(block, None, bay, tier)

    # ── Y-SITE-... compound formats ──────────────────────────────────────────
    y_result = extract_stack_tier(value)
    if y_result:
        return y_result

    # ── Vessel-side slot: V-{visit}-{number} → treat block as "VESSEL" ──────
    if re.match(r"^V-", value, re.IGNORECASE):
        return as_result("VESSEL", None, None, None)

    return None


def is_cwit_transfer_zone(pos):
    """Check if a position is a CWIT transfer zone (W=Waterside, L=Landside).
    Format: Y-CWIT-{Section}{Block}{W|L}{Bay3} e.g. Y-CWIT-1AW026, Y-CWIT-1AL003
    """
    if not pos: return False
    pos = str(pos).strip()
    if not pos.startswith('Y-CWIT-'): return False
    suffix = pos[7:]  # e.g. '1AW026' or '1AL003'
    return bool(re.search(r'[A-Z][WL]\d{3}$', suffix))

def is_cwit_waterside_tz(pos):
    """Check if a position is a CWIT Waterside transfer zone (W only).
    Only Waterside TZ moves lead to actual vessel loads (Phase 1 → Phase 2).
    Landside (L) TZ moves are staging/retrieval and are NOT Phase 1 loads.
    Format: Y-CWIT-{Section}{Block}W{Bay3} e.g. Y-CWIT-1AW026
    """
    if not pos: return False
    pos = str(pos).strip()
    if not pos.startswith('Y-CWIT-'): return False
    suffix = pos[7:]
    return bool(re.search(r'[A-Z]W\d{3}$', suffix))

def is_cwit_stack(pos):
    """Check if a position is a standard CWIT yard stack (has row letter and tier).
    Format: Y-CWIT-{Section}{Block}{Bay3}{Row}.{Tier} e.g. Y-CWIT-1A003C.5
    """
    if not pos: return False
    pos = str(pos).strip()
    if not pos.startswith('Y-CWIT-'): return False
    return bool(re.search(r'\d{3}[A-Z]\.\d+$', pos))

def detect_terminal_format(rows):
    """Auto-detect terminal format by scanning positions in the first N rows.
    Returns 'CGSA', 'CWIT', or 'STANDARD'.
    """
    cwit_count = 0
    cgsa_count = 0
    sample_size = min(200, len(rows))
    for r in rows[:sample_size]:
        from_pos = str(r.get('From Position', '')).strip()
        if from_pos.startswith('Y-CWIT-'):
            cwit_count += 1
        elif from_pos.startswith('Y-CGSA-'):
            cgsa_count += 1
            
    if sample_size > 0:
        if (cwit_count / sample_size) > 0.5:
            return 'CWIT'
        if (cgsa_count / sample_size) > 0.5:
            return 'CGSA'
    return 'STANDARD'

def extract_stack_tier_cgsa(pos):
    """Parse CGSA stack positions: Y-CGSA-{Block} {Bay} {Row} {Tier}
    e.g. Y-CGSA-3A 29 A 2 -> Block=3A, Bay=29, Row=A, Tier=2
    """
    if not pos: return None
    pos = str(pos).strip()
    if not pos.startswith('Y-CGSA-'): return None
    
    match = re.match(r'Y-CGSA-([A-Z0-9]+)\s+(\d+)\s+([A-Z]+)\s+(\d+)', pos)
    if match:
        block, bay, row, tier = match.groups()
        return {
            'FullStack': f"{block}-{bay}-{row}",
            'Block': block,
            'Bays': {bay},
            'Row': row,
            'Tier': int(tier)
        }
    return None

def extract_stack_tier_cwit(pos):
    """Parse CWIT stack positions: Y-CWIT-{Section}{Block}{Bay3}{Row}.{Tier}
    e.g. Y-CWIT-1A003C.5 -> Section=1, Block=A, Bay=003, Row=C, Tier=5
    """
    if not pos: return None
    pos = str(pos).strip()
    if not pos.startswith('Y-CWIT-'): return None
    suffix = pos[7:]  # e.g. '1A003C.5'
    
    match = re.match(r'(\d+)([A-Z])(\d{3})([A-Z])\.(\d+)$', suffix)
    if match:
        section, block, bay, row, tier = match.groups()
        block_id = f"{section}{block}"  # e.g. '1A'
        return {
            'FullStack': f"{block_id}-{bay}-{row}",
            'Block': block_id,
            'Bays': {bay},
            'Row': row,
            'Tier': int(tier)
        }
    return None

def extract_tz_bay_info(pos):
    """Parse CWIT transfer zone position to get block and bay for matching.
    Y-CWIT-1AW026 -> block_id='1A', bay='026'
    """
    if not pos: return None
    pos = str(pos).strip()
    if not pos.startswith('Y-CWIT-'): return None
    suffix = pos[7:]
    match = re.match(r'(\d+)([A-Z])[WL](\d{3})$', suffix)
    if match:
        section, block, bay = match.groups()
        return {'Block': f"{section}{block}", 'Bay': bay}
    return None

def extract_stack_tier(pos):
    if not pos: return None
    pos = str(pos).strip()
    
    # 1. Advanced N4/T2 parsing: Y-Site-Block-Bay(2-4)-Row-Tier
    # Block(any alphanumeric), Bay(2-4 digits), Row(alpha OR 2 digits), Tier(1-2 digits)
    # Added [.]? to handle format like Y-CTB-2B02E.3
    match = re.match(r'Y-.*-([A-Z0-9]+?)(\d{2,4})([A-Z]|\d{2})[.]?(\d+)$', pos)
    if match:
        block, bay_raw, row, tier = match.groups()
        
        # Bay Normalization for 40ft slots (e.g. 0506 -> {05, 06})
        bay_set = set()
        if len(bay_raw) == 4:
            bay_set.add(bay_raw[:2])
            bay_set.add(bay_raw[2:])
        else:
            bay_set.add(bay_raw)
            
        return {
            'FullStack': f"{block}-{bay_raw}-{row}",
            'Block': block,
            'Bays': bay_set,
            'Row': row,
            'Tier': int(tier)
        }
        
    # Fallback to the original generic identifier
    fallback_match = re.match(r'(Y-.*[A-Z])[.]?(\d+)$', pos)
    if fallback_match:
        return {
            'FullStack': fallback_match.group(1),
            'Block': fallback_match.group(1),
            'Bays': {fallback_match.group(1)},
            'Row': 'UNKNOWN',
            'Tier': int(fallback_match.group(2))
        }
        
    return None
