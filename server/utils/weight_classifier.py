from typing import Optional


def classify_weight_band(weight_kg: Optional[float], container_length: Optional[str] = None) -> str:
    """
    Classify weight into LIGHT, MEDIUM, HEAVY.

    Rules:
    - < 10,000 kg  => LIGHT
    - < 24,000 kg  => MEDIUM
    - >= 24,000 kg  => HEAVY

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