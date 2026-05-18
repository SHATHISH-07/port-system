import logging
from typing import Any, Dict, List, Optional

import pandas as pd

from db.queries import load_from_db
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_decoder import parse_vessel_slot, parse_yard_slot
from utils.stowage_rules import generate_recommendation
from utils.weight_classifier import classify_weight_band

logger = logging.getLogger("port_system")


def _normalize_column_name(name: str) -> str:
    import re
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return re.sub(r"_+", "_", name).strip("_")


def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df.columns = [_normalize_column_name(c) for c in df.columns]
    return df


def _first_existing_value(row: pd.Series, candidates: List[str]) -> Any:
    for col in candidates:
        if col in row and pd.notna(row.get(col)) and str(row.get(col)).strip() != "":
            return row.get(col)
    return None


def _safe_str(value: Any, default: str = "") -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return default
    return text


def _empty_history_response() -> dict:
    return {
        "summary": {"totalContainers": 0, "heavyCount": 0, "lightCount": 0, "mediumCount": 0},
        "equipmentClassDistribution": [],
        "dischargePortGrouping": [],
        "weightDistribution": {"aboveDeck": [], "belowDeck": []},
        "historicalVisits": [],
    }


def _empty_planning_response(vessel_id: str, total_requested: int) -> dict:
    return {
        "vesselId": vessel_id,
        "outboundService": vessel_id,
        "visitId": None,
        "summary": {
            "totalRequested": total_requested,
            "resolvedCount": 0,
            "unresolvedCount": total_requested,
        },
        "recommendations": [],
        "map": {"groups": []},
    }


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


def get_historical_stowage_analysis(
    vessel_id: str,
    yard_id: Optional[str] = None,
    visit_id: Optional[str] = None
) -> dict:
    """
    History analysis:
    - vessel-level aggregation
    - optional visit filter
    - deduped unit-based distributions
    """
    df = load_from_db("history", vessel_id=vessel_id, yard_id=yard_id, full_load=True)
    if df is None or df.empty:
        return _empty_history_response()

    df = _normalize_dataframe_columns(df)

    if "record_type" in df.columns:
        df = df[df["record_type"].astype(str).str.lower() == "history"].copy()

    if visit_id and "actual_outbound_carrier_visit_id" in df.columns:
        df = df[df["actual_outbound_carrier_visit_id"].astype(str) == str(visit_id)].copy()

    if "visit_state" in df.columns:
        df = df[df["visit_state"].notna()].copy()

    if df.empty:
        return _empty_history_response()

    unique_df = _dedupe_latest_per_unit(df)
    if unique_df.empty:
        return _empty_history_response()

    def _resolve_weight_band(row: pd.Series) -> str:
        weight = _first_existing_value(row, [
            "unit_weight_in_kg",
            "verified_gross_mass_kg",
            "verified_gross_mass",
            "gross_mass_kg",
            "gross_weight_kg",
        ])
        length = _first_existing_value(row, ["container_length", "equipment_length"])
        return classify_weight_band(weight, length)

    unique_df["weight_band"] = unique_df.apply(_resolve_weight_band, axis=1)

    total_containers = int(len(unique_df))
    heavy_count = int((unique_df["weight_band"] == "HEAVY").sum())
    light_count = int((unique_df["weight_band"] == "LIGHT").sum())
    medium_count = int((unique_df["weight_band"] == "MEDIUM").sum())

    equip_dist: List[dict] = []
    if "equipment_class" in unique_df.columns:
        counts = unique_df["equipment_class"].fillna("unknownEquipmentClass").astype(str).value_counts()
        for eq, count in counts.head(10).items():
            equip_dist.append({
                "equipmentClass": eq,
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
            })

    port_dist: List[dict] = []
    if "port_of_discharge" in unique_df.columns:
        counts = unique_df["port_of_discharge"].fillna("unknownPort").astype(str).value_counts()
        for port, count in counts.head(10).items():
            port_dist.append({
                "port": port,
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
            })

    above_deck: List[dict] = []
    below_deck: List[dict] = []

    if light_count:
        above_deck.append({
            "band": "LIGHT",
            "count": light_count,
            "percentage": round((light_count / max(total_containers, 1)) * 100, 1),
        })

    if heavy_count:
        below_deck.append({
            "band": "HEAVY",
            "count": heavy_count,
            "percentage": round((heavy_count / max(total_containers, 1)) * 100, 1),
        })

    if medium_count:
        half = medium_count // 2
        above_deck.append({
            "band": "MEDIUM",
            "count": half,
            "percentage": round((half / max(total_containers, 1)) * 100, 1),
        })
        below_deck.append({
            "band": "MEDIUM",
            "count": medium_count - half,
            "percentage": round(((medium_count - half) / max(total_containers, 1)) * 100, 1),
        })

    visits: List[dict] = []
    if "actual_outbound_carrier_visit_id" in unique_df.columns:
        for vid, grp in unique_df.groupby("actual_outbound_carrier_visit_id", dropna=True):
            if pd.isna(vid):
                continue

            mct = None
            if "move_complete_time" in grp.columns:
                mct_val = pd.to_datetime(grp["move_complete_time"], errors="coerce").max()
                if pd.notnull(mct_val):
                    mct = mct_val.isoformat()

            visits.append({
                "visitId": str(vid),
                "containerCount": int(grp["unit_id"].nunique()) if "unit_id" in grp.columns else int(len(grp)),
                "moveCompleteTime": mct,
            })

        visits.sort(key=lambda x: x["moveCompleteTime"] or "", reverse=True)

    return {
        "summary": {
            "totalContainers": total_containers,
            "heavyCount": heavy_count,
            "lightCount": light_count,
            "mediumCount": medium_count,
        },
        "equipmentClassDistribution": equip_dist,
        "dischargePortGrouping": port_dist,
        "weightDistribution": {
            "aboveDeck": above_deck,
            "belowDeck": below_deck,
        },
        "historicalVisits": visits,
    }


def process_current_planning(vessel_id: str, yard_id: Optional[str], container_ids: List[str]) -> dict:
    """
    Current planning:
    - resolve DB records from container IDs
    - generate recommendations
    - return one unified map payload
    """
    if not container_ids:
        raise ValueError("containerIds list is required")

    cleaned_ids = [str(x).strip() for x in container_ids if str(x).strip()]
    if not cleaned_ids:
        raise ValueError("containerIds list is required")

    df = lookup_containers_by_ids(cleaned_ids, yard_id)
    if df is None or df.empty:
        return _empty_planning_response(vessel_id, len(cleaned_ids))

    df = _normalize_dataframe_columns(df)
    df = _dedupe_latest_per_unit(df)

    if df.empty:
        return _empty_planning_response(vessel_id, len(cleaned_ids))

    resolved_count = int(len(df))
    unresolved_count = max(0, int(len(cleaned_ids) - resolved_count))

    outbound_service = vessel_id
    visit_id = None

    if "outbound_service" in df.columns:
        svc_vals = df["outbound_service"].dropna().astype(str).str.strip()
        if not svc_vals.empty:
            mode_vals = svc_vals.mode()
            outbound_service = mode_vals.iloc[0] if not mode_vals.empty else svc_vals.iloc[0]

    if "actual_outbound_carrier_visit_id" in df.columns:
        visit_vals = df["actual_outbound_carrier_visit_id"].dropna().astype(str).str.strip()
        if not visit_vals.empty:
            mode_vals = visit_vals.mode()
            visit_id = mode_vals.iloc[0] if not mode_vals.empty else visit_vals.iloc[0]

    port_rotation_dict: Dict[str, int] = {}
    if "port_of_discharge" in df.columns:
        ports = df["port_of_discharge"].dropna().astype(str).str.strip().str.upper()
        for idx, port in enumerate(ports.value_counts().index.tolist(), start=1):
            port_rotation_dict[port] = idx

    recommendations: List[dict] = []
    map_groups: Dict[str, dict] = {}

    for _, row in df.iterrows():
        unit_id = _safe_str(row.get("unit_id"), "UNKNOWN")

        weight_kg = _first_existing_value(row, [
            "unit_weight_in_kg",
            "verified_gross_mass_kg",
            "verified_gross_mass",
            "gross_mass_kg",
            "gross_weight_kg",
        ])
        length = _first_existing_value(row, ["container_length", "equipment_length"])
        weight_band = classify_weight_band(weight_kg, length)

        port = _safe_str(_first_existing_value(row, ["port_of_discharge"]), "")
        eq_class = _safe_str(_first_existing_value(row, ["equipment_class"]), "unknownEquipmentClass")

        position_text = _safe_str(_first_existing_value(row, [
            "current_position",
            "current_slot_position",
            "slot_position",
            "yard_position",
        ]), "")

        current_yard_block = "UNKNOWN"
        current_slot_position = position_text or "UNKNOWN"

        vessel_info = parse_vessel_slot(position_text)
        yard_info = parse_yard_slot(position_text)

        if yard_info:
            current_yard_block = _safe_str(yard_info.get("block"), "UNKNOWN")
            current_slot_position = _safe_str(yard_info.get("slot"), current_slot_position)

        if vessel_info:
            current_slot_position = _safe_str(vessel_info.get("slot"), current_slot_position)

        if "current_yard_block" in row and _safe_str(row.get("current_yard_block")):
            current_yard_block = _safe_str(row.get("current_yard_block"), current_yard_block)

        if "current_slot_position" in row and _safe_str(row.get("current_slot_position")):
            current_slot_position = _safe_str(row.get("current_slot_position"), current_slot_position)

        actual_visit = _safe_str(_first_existing_value(row, ["actual_outbound_carrier_visit_id"]), None)
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

        rec["recommendedTier"] = _derive_recommended_tier(weight_band, rec["loadingPriority"])
        rec["actualOutboundCarrierVisitId"] = actual_visit
        rec["outboundService"] = outbound_svc
        rec["equipmentClass"] = eq_class
        rec["weightCategory"] = weight_band
        rec["portOfDischarge"] = port if port else None
        rec["currentYardBlock"] = current_yard_block
        rec["currentSlotPosition"] = current_slot_position

        recommendations.append(rec)

        group_key = current_yard_block if current_yard_block and current_yard_block != "UNKNOWN" else (
            outbound_svc or actual_visit or "GENERAL"
        )
        group_type = "yardBlock" if current_yard_block and current_yard_block != "UNKNOWN" else (
            "visitId" if actual_visit else "service"
        )

        if group_key not in map_groups:
            map_groups[group_key] = {
                "groupId": group_key,
                "groupType": group_type,
                "positions": []
            }

        map_groups[group_key]["positions"].append({
            "unitId": unit_id,
            "currentYardBlock": current_yard_block,
            "currentSlotPosition": current_slot_position,
            "weightCategory": weight_band,
            "loadingPriority": int(rec["loadingPriority"]),
            "recommendedDeck": rec["recommendedDeck"],
            "recommendedTier": rec["recommendedTier"],
            "reshuffleRisk": rec["reshuffleRisk"],
            "outboundService": outbound_svc,
            "actualOutboundCarrierVisitId": actual_visit,
        })

    final_map_groups = []
    for group in map_groups.values():
        sorted_positions = sorted(
            group["positions"],
            key=lambda x: (x["loadingPriority"], x["unitId"])
        )
        final_map_groups.append({
            "groupId": group["groupId"],
            "groupType": group["groupType"],
            "containerCount": len(sorted_positions),
            "positions": sorted_positions,
        })

    final_map_groups.sort(key=lambda x: (x["groupType"], x["groupId"]))

    return {
        "vesselId": vessel_id,
        "outboundService": outbound_service or vessel_id,
        "visitId": visit_id,
        "summary": {
            "totalRequested": int(len(cleaned_ids)),
            "resolvedCount": resolved_count,
            "unresolvedCount": unresolved_count,
        },
        "recommendations": recommendations,
        "map": {
            "groups": final_map_groups
        }
    }