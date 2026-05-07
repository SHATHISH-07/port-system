"""
Dynamic Schema Mapping Engine
------------------------------
Detects dataset type, fuzzy-matches raw field names to canonical fields,
and persists confirmed mappings so future uploads from the same source
are processed automatically.

Dependencies: rapidfuzz
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from rapidfuzz import fuzz, process as rfprocess
from sqlalchemy import text

from db.connection import get_engine

logger = logging.getLogger("port_system")

# ---------------------------------------------------------------------------
# Canonical field registries per dataset type
# ---------------------------------------------------------------------------

CANONICAL_CONTAINER_FIELDS: dict[str, list[str]] = {
    "canonical_unit_id":            ["unit_id", "unit_nbr", "unit number", "container_id", "container id"],
    "actual_outbound_carrier_visit_id": ["actual_outbound_carrier_visit_id", "carrier_visit", "vessel_visit", "visit_id"],
    "outbound_service":             ["outbound_service", "service", "line_service", "vessel_service"],
    "move_complete_time":           ["move_complete_time", "time_completed", "completed_time", "completion_time", "move_completed_at"],
    "time_in":                      ["time_in", "arrival_time", "gate_in_time", "timein"],
    "time_out":                     ["time_out", "departure_time", "gate_out_time", "timeout"],
    "ctr_from_position":            ["ctr_from_position", "from_position", "from_pos", "current_position"],
    "ctr_to_position":              ["ctr_to_position", "to_position", "to_pos"],
    "verified_gross_mass_kg":       ["verified_gross_mass_kg", "vgm", "verified_gross_mass", "vgm_kg"],
    "unit_weight_in_kg":            ["unit_weight_in_kg", "unit_weight_kg", "weight_kg", "unit weight in kg"],
    "reefer":                       ["reefer", "reefer_flag", "is_reefer", "refrigerated"],
    "hazardous_flag":               ["hazardous_flag", "hazardous", "is_hazardous", "hazardous flag"],
    "oog_unit":                     ["oog_unit", "oog", "is_oog", "out_of_gauge", "oog unit"],
    "port_of_discharge":            ["port_of_discharge", "pod", "discharge_port", "destination_port"],
    "inbound_service":              ["inbound_service", "feeder_service"],
    "actual_inbound_carrier_visit_id": ["actual_inbound_carrier_visit_id", "inbound_visit"],
}

CANONICAL_CRANE_FIELDS: dict[str, list[str]] = {
    "canonical_crane_id":   ["crane_che", "crane_id", "crane", "che", "crane che"],
    "canonical_unit_id":    ["unit_nbr", "unit_id", "unit number", "container_id"],
    "carrier_visit":        ["carrier_visit", "vessel_visit", "visit"],
    "move_kind":            ["move_kind", "move_type", "event_type", "operation_type"],
    "from_position":        ["from_position", "ctr_from_position", "from_pos", "origin"],
    "to_position":          ["to_position", "ctr_to_position", "to_pos", "destination"],
    "time_completed":       ["time_completed", "move_complete_time", "completion_time", "time completed"],
    "line_op":              ["line_op", "line_operator", "shipping_line"],
    "excluded":             ["exclude", "excluded", "is_excluded"],
}

DATASET_TYPE_SIGNATURES: dict[str, list[str]] = {
    "container_inventory": [
        "outbound_service", "actual_outbound_carrier_visit_id", "unit_id",
        "move_complete_time", "ctr_from_position", "ctr_to_position",
    ],
    "crane_moves": [
        "crane_che", "move_kind", "unit_nbr", "carrier_visit", "time_completed",
    ],
}

CANONICAL_FIELDS_BY_TYPE = {
    "container_inventory": CANONICAL_CONTAINER_FIELDS,
    "crane_moves":         CANONICAL_CRANE_FIELDS,
}


# ---------------------------------------------------------------------------
# Dataset type detection
# ---------------------------------------------------------------------------

def _normalise(name: str) -> str:
    """Lowercase + replace spaces/hyphens with underscores for comparison."""
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def detect_dataset_type(columns: list[str], source_profile: Optional[dict] = None) -> dict:
    """
    Classify an uploaded dataset as container_inventory, crane_moves, or unknown.

    Returns:
        {
            "dataset_type": str,
            "confidence": float (0-100),
            "scores": {"container_inventory": float, "crane_moves": float}
        }
    """
    norm_cols = {_normalise(c) for c in columns}
    scores: dict[str, float] = {}

    for dtype, signature in DATASET_TYPE_SIGNATURES.items():
        matched = sum(1 for sig_field in signature if _normalise(sig_field) in norm_cols)
        scores[dtype] = round(matched / len(signature) * 100, 1)

    # Override with source profile rules if provided
    if source_profile and source_profile.get("detection_rules"):
        rules = source_profile["detection_rules"]
        forced_type = rules.get("force_dataset_type")
        if forced_type:
            return {"dataset_type": forced_type, "confidence": 100.0, "scores": scores}

    best_type = max(scores, key=lambda k: scores[k])
    best_score = scores[best_type]

    return {
        "dataset_type": best_type if best_score >= 50 else "unknown",
        "confidence": best_score,
        "scores": scores,
    }


# ---------------------------------------------------------------------------
# Field mapping suggestion
# ---------------------------------------------------------------------------

def suggest_mappings(
    raw_columns: list[str],
    dataset_type: str,
    source_profile: Optional[dict] = None,
    confidence_threshold: float = 55.0,
) -> list[dict]:
    """
    Suggest canonical mappings for raw_columns using:
      1. Exact match from source_profile alias_map (confidence = 100)
      2. Exact match against canonical aliases (confidence = 100)
      3. RapidFuzz token_sort_ratio fuzzy match (confidence = score)

    Returns a list of:
        {
            "raw_field": str,
            "canonical_field": str | None,
            "confidence": float,
            "match_method": "alias_exact" | "canonical_exact" | "fuzzy" | "no_match",
            "is_unmapped": bool
        }
    """
    canonical_map = CANONICAL_FIELDS_BY_TYPE.get(dataset_type, CANONICAL_CONTAINER_FIELDS)
    alias_map: dict = (source_profile or {}).get("alias_map", {})

    # Build lookup: normalised canonical alias → canonical field name
    canonical_lookup: dict[str, str] = {}
    for canonical_field, aliases in canonical_map.items():
        for alias in aliases:
            canonical_lookup[_normalise(alias)] = canonical_field
        canonical_lookup[_normalise(canonical_field)] = canonical_field

    # All candidate canonical field names (for fuzzy)
    all_canonical_names = list(canonical_map.keys())

    suggestions = []
    for raw_field in raw_columns:
        norm_raw = _normalise(raw_field)

        # 1. Source profile alias_map (highest priority)
        if norm_raw in {_normalise(k): v for k, v in alias_map.items()}:
            mapped = alias_map.get(raw_field) or alias_map.get(norm_raw)
            if mapped:
                suggestions.append({
                    "raw_field": raw_field,
                    "canonical_field": mapped,
                    "confidence": 100.0,
                    "match_method": "alias_exact",
                    "is_unmapped": False,
                })
                continue

        # 2. Exact match against canonical aliases
        if norm_raw in canonical_lookup:
            suggestions.append({
                "raw_field": raw_field,
                "canonical_field": canonical_lookup[norm_raw],
                "confidence": 100.0,
                "match_method": "canonical_exact",
                "is_unmapped": False,
            })
            continue

        # 3. Fuzzy match
        result = rfprocess.extractOne(
            norm_raw,
            [_normalise(c) for c in all_canonical_names],
            scorer=fuzz.token_sort_ratio,
        )
        if result and result[1] >= confidence_threshold:
            matched_canonical = all_canonical_names[result[2]]
            suggestions.append({
                "raw_field": raw_field,
                "canonical_field": matched_canonical,
                "confidence": round(result[1], 1),
                "match_method": "fuzzy",
                "is_unmapped": False,
            })
        else:
            suggestions.append({
                "raw_field": raw_field,
                "canonical_field": None,
                "confidence": 0.0,
                "match_method": "no_match",
                "is_unmapped": True,
            })

    return suggestions


# ---------------------------------------------------------------------------
# Apply confirmed mappings to a DataFrame
# ---------------------------------------------------------------------------

def apply_mappings(df, confirmed_mappings: list[dict], canonical_fields: Optional[list] = None) -> tuple:
    """
    Rename DataFrame columns per confirmed_mappings.
    Unmapped columns are collected into a 'dynamic_attributes' column (JSONB-ready).

    Returns: (transformed_df, dynamic_attr_series)
    """
    import pandas as pd

    rename_map = {
        m["raw_field"]: m["canonical_field"]
        for m in confirmed_mappings
        if m.get("canonical_field") and not m.get("is_unmapped", False)
    }
    unmapped_fields = [
        m["raw_field"] for m in confirmed_mappings if m.get("is_unmapped", False)
    ]

    df = df.copy()

    # Extract dynamic attributes from unmapped columns
    dynamic_attrs = df[unmapped_fields].apply(
        lambda row: {col: row[col] for col in unmapped_fields if col in row.index and not pd.isna(row[col])},
        axis=1,
    ) if unmapped_fields else None

    df = df.rename(columns=rename_map)

    # Drop unmapped columns from main df (they go to dynamic_attributes)
    df = df.drop(columns=[c for c in unmapped_fields if c in df.columns], errors="ignore")

    return df, dynamic_attrs


# ---------------------------------------------------------------------------
# Persist confirmed mappings to DB
# ---------------------------------------------------------------------------

def persist_mappings(source_profile_id: int, mappings: list[dict], confirmed_by: int) -> int:
    """
    Save confirmed mappings to schema_mappings table.
    UPSERT — updates existing entries for the same (source_profile_id, raw_field).

    Returns number of rows upserted.
    """
    engine = get_engine()
    now = datetime.now(timezone.utc)
    count = 0

    with engine.begin() as conn:
        for m in mappings:
            conn.execute(text("""
                INSERT INTO schema_mappings
                    (source_profile_id, raw_field, canonical_field, confidence,
                     match_method, is_confirmed, confirmed_by, confirmed_at,
                     created_at, updated_at)
                VALUES
                    (:spid, :raw, :canonical, :conf, :method, TRUE, :by, :at, :now, :now)
                ON CONFLICT (source_profile_id, raw_field)
                DO UPDATE SET
                    canonical_field = EXCLUDED.canonical_field,
                    confidence      = EXCLUDED.confidence,
                    match_method    = EXCLUDED.match_method,
                    is_confirmed    = TRUE,
                    confirmed_by    = EXCLUDED.confirmed_by,
                    confirmed_at    = EXCLUDED.confirmed_at,
                    updated_at      = EXCLUDED.updated_at
            """), {
                "spid":     source_profile_id,
                "raw":      m["raw_field"],
                "canonical": m.get("canonical_field", ""),
                "conf":     m.get("confidence", 0),
                "method":   m.get("match_method", "manual"),
                "by":       confirmed_by,
                "at":       now,
                "now":      now,
            })
            count += 1

    logger.info(f"[SchemaMapper] Persisted {count} mappings for source_profile_id={source_profile_id}")
    return count


def load_confirmed_mappings(source_profile_id: int) -> list[dict]:
    """Load previously confirmed mappings for a source profile."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT raw_field, canonical_field, confidence, match_method
            FROM schema_mappings
            WHERE source_profile_id = :spid AND is_confirmed = TRUE
        """), {"spid": source_profile_id}).fetchall()
    return [
        {
            "raw_field":       r[0],
            "canonical_field": r[1],
            "confidence":      float(r[2]),
            "match_method":    r[3],
            "is_unmapped":     not bool(r[1]),
        }
        for r in rows
    ]


def get_default_terminal_id() -> int:
    """Returns the ID of the default terminal (T001). Returns 1 as fallback if schema not yet initialized."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text(
                "SELECT id FROM terminals WHERE code = 'T001' LIMIT 1"
            )).fetchone()
        return row[0] if row else 1
    except Exception:
        return 1
