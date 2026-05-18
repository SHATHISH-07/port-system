from typing import Dict, Optional

from utils.position_decoder import classify_deck_position


def predict_reshuffle_risk(
    yard_block: Optional[str],
    yard_slot: Optional[str],
    recommended_deck: str
) -> str:
    """
    Explainable reshuffle risk heuristic.
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

    if yard_block and str(yard_block).upper() in {"A", "B"}:
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
                reasons.append(f"Early discharge port ({port}) prioritized later to reduce overstowage.")
            elif port_rank >= 3:
                priority -= 1
                reasons.append(f"Late discharge port ({port}) prioritized earlier in the load plan.")
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