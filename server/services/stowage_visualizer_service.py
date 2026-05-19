import re

import pandas as pd
from typing import Any, List, Optional

from db.queries import load_from_db
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_decoder import parse_yard_slot, parse_vessel_slot
from utils.stowage_rules import generate_recommendation, classify_weight_band, classify_deck_position


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize_column_name(name: str) -> str:
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return re.sub(r"_+", "_", name).strip("_")


def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convert every column header to snake_case so that downstream code can use
    consistent key names regardless of whether the frame came from a CSV upload
    (mixed-case headers like 'Unit Weight in kg') or a DB query (already snake).
    """
    if df.empty:
        return df
    df = df.copy()
    df.columns = [_normalize_column_name(c) for c in df.columns]
    return df


def _safe_str(value: Any, default: str = "") -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return default
    return text


def _first_existing_value(row: pd.Series, candidates: List[str]) -> Any:
    for col in candidates:
        if col in row and pd.notna(row.get(col)) and str(row.get(col)).strip() != "":
            return row.get(col)
    return None


def _dedupe_latest_per_unit(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "unit_id" not in df.columns:
        return df
    sort_cols = []
    ascending = []
    for col in ["move_complete_time", "updated_at", "created_at"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
            sort_cols.append(col)
            ascending.append(False)
    if sort_cols:
        df = df.sort_values(by=sort_cols, ascending=ascending, na_position="last")
    return df.drop_duplicates(subset=["unit_id"], keep="first").reset_index(drop=True)


def _derive_recommended_tier(weight_band: str, loading_priority: int) -> str:
    band = str(weight_band).strip().upper()
    if band == "HEAVY":
        return "02"
    if band == "LIGHT":
        return "08" if loading_priority <= 7 else "10"
    return "04" if loading_priority <= 5 else "06"


# ---------------------------------------------------------------------------
# Map group builder
# ---------------------------------------------------------------------------

def _build_map_groups(df: pd.DataFrame, port_rotation_dict: dict) -> List[dict]:
    """
    Build the list of position groups for the visualization map.

    Expects *df* to have already been column-normalised (snake_case headers).
    """
    map_groups: dict = {}

    for _, row in df.iterrows():
        unit_id = _safe_str(row.get("unit_id"), "UNKNOWN")

        weight_kg = _first_existing_value(
            row,
            ["unit_weight_in_kg", "verified_gross_mass_kg", "gross_mass_kg", "gross_weight_kg"],
        )
        length = _first_existing_value(row, ["container_length", "equipment_length"])
        weight_band = classify_weight_band(weight_kg, length)

        port = _safe_str(_first_existing_value(row, ["port_of_discharge"]), "")
        eq_class = _safe_str(
            _first_existing_value(row, ["equipment_class"]), "unknownEquipmentClass"
        )

        # Position resolution: try current_position first (most accurate live location),
        # then ctr_to_position (last recorded destination), then ctr_from_position.
        position_text = _safe_str(
            _first_existing_value(
                row,
                [
                    "current_position",
                    "current_slot_position",
                    "slot_position",
                    "yard_position",
                    "ctr_to_position",
                    "ctr_from_position",
                ],
            ),
            "",
        )

        current_yard_block = "UNKNOWN"
        current_slot_position = position_text or "UNKNOWN"

        yard_info = parse_yard_slot(position_text)
        vessel_info = parse_vessel_slot(position_text)

        parsed_bay = None
        parsed_row = None
        parsed_tier = None
        parsed_block = None
        parsed_deck = None

        if yard_info:
            # parse_yard_slot now correctly extracts zone+letter blocks for CWIT
            # (e.g. '1A', '2C') and single-letter blocks for PEB (e.g. 'A', 'F').
            current_yard_block = _safe_str(yard_info.get("block"), "UNKNOWN")
            current_slot_position = _safe_str(yard_info.get("slot"), current_slot_position)
            parsed_block = current_yard_block
            if "decoded" in yard_info:
                parsed_bay = yard_info["decoded"].get("bay")
                parsed_row = yard_info["decoded"].get("row")
                parsed_tier = yard_info["decoded"].get("tier")

        if vessel_info:
            current_slot_position = _safe_str(vessel_info.get("slot"), current_slot_position)
            if "decoded" in vessel_info:
                parsed_bay = vessel_info["decoded"].get("bay")
                parsed_row = vessel_info["decoded"].get("row")
                parsed_tier = vessel_info["decoded"].get("tier")
                if parsed_bay:
                    current_yard_block = f"BAY-{parsed_bay}"
                if parsed_tier and str(parsed_tier).isdigit():
                    parsed_deck = "ABOVE_DECK" if int(parsed_tier) >= 80 else "BELOW_DECK"

        # Allow pre-computed columns from an upstream service to override parsed values
        if _safe_str(row.get("current_yard_block")):
            current_yard_block = _safe_str(row.get("current_yard_block"), current_yard_block)
        if _safe_str(row.get("current_slot_position")):
            current_slot_position = _safe_str(
                row.get("current_slot_position"), current_slot_position
            )

        actual_visit = _safe_str(
            _first_existing_value(row, ["actual_outbound_carrier_visit_id"]), None
        )
        outbound_svc = _safe_str(_first_existing_value(row, ["outbound_service"]), None)

        rec = generate_recommendation(
            unit_id=unit_id,
            weight_band=weight_band,
            discharge_port=port if port else None,
            equipment_class=eq_class,
            yard_block=current_yard_block,
            yard_slot=current_slot_position,
            port_rotation_dict=port_rotation_dict,
        )

        rec_tier = _derive_recommended_tier(weight_band, rec["loadingPriority"])

        group_key = port if port else "UNKNOWN"
        group_type = "dischargePort"

        if group_key not in map_groups:
            map_groups[group_key] = {"groupId": group_key, "groupType": group_type, "positions": []}

        map_groups[group_key]["positions"].append(
            {
                "unitId": unit_id,
                "currentYardBlock": current_yard_block,
                "currentSlotPosition": current_slot_position,
                "weightCategory": weight_band,
                "loadingPriority": int(rec["loadingPriority"]),
                "recommendedDeck": rec["recommendedDeck"],
                "recommendedTier": rec_tier,
                "reshuffleRisk": rec["reshuffleRisk"],
                "outboundService": outbound_svc,
                "actualOutboundCarrierVisitId": actual_visit,
                "parsedBay": parsed_bay,
                "parsedRow": parsed_row,
                "parsedTier": parsed_tier,
                "parsedBlock": parsed_block,
                "parsedDeck": parsed_deck,
            }
        )

    final_map_groups = []
    for group in map_groups.values():
        sorted_positions = sorted(
            group["positions"], key=lambda x: (x["loadingPriority"], x["unitId"])
        )
        final_map_groups.append(
            {
                "groupId": group["groupId"],
                "groupType": group["groupType"],
                "containerCount": len(sorted_positions),
                "positions": sorted_positions,
            }
        )

    final_map_groups.sort(key=lambda x: (x["groupType"], x["groupId"]))
    return final_map_groups


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def get_stowage_visualization(
    vessel_id: str,
    yard_id: Optional[str] = None,
    visit_id: Optional[str] = None,
    container_ids: Optional[List[str]] = None,
) -> dict:
    mode = "HISTORICAL" if visit_id else "CURRENT"
    df = pd.DataFrame()
    resolved_count = 0

    if mode == "HISTORICAL":
        df = load_from_db("history", vessel_id=vessel_id, yard_id=yard_id, full_load=True)
        if df is not None and not df.empty:
            # Normalise column names so downstream lookups (unit_id, current_position …)
            # work regardless of whether the DB driver returns raw or snake-case headers.
            df = _normalize_dataframe_columns(df)

            if "record_type" in df.columns:
                df = df[df["record_type"].astype(str).str.lower() == "history"].copy()
            if visit_id and "actual_outbound_carrier_visit_id" in df.columns:
                df = df[
                    df["actual_outbound_carrier_visit_id"].astype(str) == str(visit_id)
                ].copy()
            if "visit_state" in df.columns:
                df = df[df["visit_state"].notna()].copy()
            df = _dedupe_latest_per_unit(df)
            resolved_count = len(df)
    else:
        if container_ids:
            cleaned_ids = [str(x).strip() for x in container_ids if str(x).strip()]
            if cleaned_ids:
                df = lookup_containers_by_ids(cleaned_ids, yard_id)
                if df is not None and not df.empty:
                    # Normalise column names for CSV / lookup results.
                    df = _normalize_dataframe_columns(df)
                    df = _dedupe_latest_per_unit(df)
                    resolved_count = len(df)

    if df is None or df.empty:
        return {
            "mode": mode,
            "vesselId": vessel_id,
            "yardId": yard_id,
            "visitId": visit_id,
            "map": {"groups": []},
            "summary": {
                "totalContainers": len(container_ids) if container_ids else 0,
                "resolvedCount": 0,
            },
        }

    port_rotation_dict: dict = {}
    if "port_of_discharge" in df.columns:
        ports = df["port_of_discharge"].dropna().astype(str).str.strip().str.upper()
        for idx, port in enumerate(ports.value_counts().index.tolist(), start=1):
            port_rotation_dict[port] = idx

    groups = _build_map_groups(df, port_rotation_dict)

    return {
        "mode": mode,
        "vesselId": vessel_id,
        "yardId": yard_id,
        "visitId": visit_id,
        "map": {"groups": groups},
        "summary": {
            "totalContainers": len(container_ids) if container_ids else resolved_count,
            "resolvedCount": resolved_count,
        },
    }
