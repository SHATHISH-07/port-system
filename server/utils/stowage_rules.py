from typing import Dict, Optional


def classify_weight_band(weight_kg: Optional[float], container_length: Optional[str] = None) -> str:
    """
    Classify weight into LIGHT, MEDIUM, HEAVY.

    Rules:
    - < 10,000 kg  => LIGHT
    - < 24,000 kg  => MEDIUM
    - >= 24,000 kg => HEAVY

    If weight is missing, use container length as fallback:
    - 20ft  => LIGHT
    - 40ft+ => MEDIUM
    """
    try:
        if weight_kg is None:
            if container_length:
                length_str = str(container_length).strip()
                if length_str.startswith("20"):
                    return "LIGHT"
                if length_str.startswith("40") or length_str.startswith("45"):
                    return "MEDIUM"
            return "LIGHT"

        w = float(weight_kg)
        if w < 10000:
            return "LIGHT"
        if w < 24000:
            return "MEDIUM"
        return "HEAVY"
    except (TypeError, ValueError):
        return "LIGHT"


def classify_deck_position(weight_band: str) -> str:
    """
    HEAVY  => BELOW_DECK
    MEDIUM => BELOW_DECK
    LIGHT  => ABOVE_DECK
    """
    band = str(weight_band).strip().upper()
    if band == "HEAVY":
        return "BELOW_DECK"
    if band == "LIGHT":
        return "ABOVE_DECK"
    return "BELOW_DECK"


def _is_early_block(yard_block: Optional[str]) -> bool:
    """
    Return True when the yard block is known to have constrained crane access,
    which increases reshuffle risk.

    Handles both terminal formats:
      - PEB style   : single letter blocks  ('A', 'B')
      - CWIT style  : zone+letter blocks    ('1A', '1B', '2A', '2B', ...)

    The underlying heuristic penalises blocks whose letter component is 'A' or
    'B' — these are typically the innermost rows in a yard block, requiring the
    most reshuffling to access buried containers.
    """
    if not yard_block:
        return False

    block = str(yard_block).strip().upper()

    # PEB-style: pure letter block ('A', 'B')
    if block in {"A", "B"}:
        return True

    # CWIT-style: numeric zone prefix + letter ('1A', '2B', '3A', etc.)
    # Extract the trailing letter component after the leading digits.
    import re
    m = re.match(r"^\d+([A-Z]+)$", block)
    if m and m.group(1) in {"A", "B"}:
        return True

    return False


def predict_reshuffle_risk(
    yard_block: Optional[str],
    yard_slot: Optional[str],
    recommended_deck: str,
) -> str:
    """
    Explainable reshuffle risk heuristic.

    Scoring components
    ------------------
    Deck placement  : BELOW_DECK +30, ABOVE_DECK +5
    Ground tier     : last digit of slot number indicates stack height
                      (1-2 = ground / bottom = hardest to retrieve => +35,
                       3-4 = mid-stack => +15,
                       5+  = top of stack => -5)
    Yard block      : early/inner blocks ('A' or 'B' letter, any zone) => +10

    Final thresholds: > 60 => HIGH, > 30 => MEDIUM, else => LOW
    """
    score = 10

    if recommended_deck == "BELOW_DECK":
        score += 30
    else:
        score += 5

    if yard_slot:
        slot_text = str(yard_slot).strip()
        digits = "".join(ch for ch in slot_text if ch.isdigit())

        if digits:
            last_digit = int(digits[-1])
            if last_digit <= 2:
                score += 35
            elif last_digit <= 4:
                score += 15
            else:
                score -= 5

    if _is_early_block(yard_block):
        score += 10

    score = max(0, min(100, score))

    if score > 60:
        return "HIGH"
    if score > 30:
        return "MEDIUM"
    return "LOW"


def generate_recommendation(
    unit_id: str,
    weight_band: str,
    discharge_port: Optional[str],
    equipment_class: Optional[str],
    yard_block: Optional[str],
    yard_slot: Optional[str],
    port_rotation_dict: Optional[Dict[str, int]] = None,
) -> dict:
    """
    Rule-based stowage recommendation engine.
    """
    recommended_deck = classify_deck_position(weight_band)

    priority = 5
    reasons = []

    band = str(weight_band).strip().upper()
    if band == "HEAVY":
        priority -= 3
        reasons.append("Heavy weight dictates BELOW_DECK placement for stability.")
    elif band == "LIGHT":
        priority += 3
        reasons.append("Light weight dictates ABOVE_DECK placement.")
    else:
        reasons.append("Medium weight uses a stable baseline deck assignment.")

    if equipment_class and "HC" in str(equipment_class).upper():
        reasons.append("High Cube equipment class may require extra slot clearance.")

    if discharge_port:
        port = str(discharge_port).strip().upper()
        if port_rotation_dict and port in port_rotation_dict:
            port_rank = port_rotation_dict[port]
            if port_rank == 1:
                priority += 2
                reasons.append(
                    f"Early discharge port ({port}) prioritized later to reduce overstowage."
                )
            elif port_rank >= 3:
                priority -= 1
                reasons.append(
                    f"Late discharge port ({port}) prioritized earlier in the load plan."
                )
            else:
                reasons.append(f"Mid-voyage discharge port grouping applied for {port}.")
        else:
            reasons.append(f"Grouped by discharge port {port}.")
    else:
        reasons.append("Unknown discharge port grouped conservatively.")

    reshuffle_risk = predict_reshuffle_risk(yard_block, yard_slot, recommended_deck)
    if reshuffle_risk == "HIGH":
        reasons.append("Heuristic predicts high reshuffle risk for yard retrieval.")

    final_priority = max(1, min(10, priority))

    return {
        "unitId": unit_id,
        "recommendedDeck": recommended_deck,
        "recommendedTier": None,
        "loadingPriority": final_priority,
        "reshuffleRisk": reshuffle_risk,
        "recommendedReason": " ".join(reasons),
    }