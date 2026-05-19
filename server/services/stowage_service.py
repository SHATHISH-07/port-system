import pandas as pd
from typing import Any, List, Optional
from db.queries import load_from_db
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_decoder import parse_vessel_slot
from utils.stowage_rules import generate_recommendation, classify_weight_band, classify_deck_position
from utils.position_parser import block_label


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


def _determine_historical_deck(position_text: str, weight_band: str) -> str:
    """
    Prefer the actual vessel slot tier from position data.
    Falls back to weight-band heuristic only when no vessel position is parseable.

    Vessel slot format: V-<visitId>-<BBRRTT>
      Tier >= 80 => ABOVE_DECK (deck cargo / hatch cover)
      Tier <  80 => BELOW_DECK (hold)
    """
    if position_text:
        v_info = parse_vessel_slot(position_text)
        if v_info and v_info.get("decoded"):
            tier_str = v_info["decoded"].get("tier")
            if tier_str and str(tier_str).isdigit():
                return "ABOVE_DECK" if int(tier_str) >= 80 else "BELOW_DECK"
    return classify_deck_position(weight_band)


def get_historical_stowage_analysis(
    vessel_id: str,
    yard_id: Optional[str] = None,
    visit_id: Optional[str] = None,
) -> dict:
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

    def _resolve_attributes(row: pd.Series) -> pd.Series:
        w = _first_existing_value(
            row,
            ["unit_weight_in_kg", "verified_gross_mass_kg", "gross_mass_kg", "gross_weight_kg"],
        )
        l = _first_existing_value(row, ["container_length", "equipment_length"])
        pos = _first_existing_value(
            row,
            ["current_position", "ctr_to_position", "ctr_from_position", "slot_position"],
        )
        wb = classify_weight_band(w, l)
        deck = _determine_historical_deck(_safe_str(pos), wb)
        return pd.Series([wb, deck])

    unique_df[["weight_band", "historical_deck"]] = unique_df.apply(_resolve_attributes, axis=1)

    total_containers = int(len(unique_df))
    heavy_count = int((unique_df["weight_band"] == "HEAVY").sum())
    light_count = int((unique_df["weight_band"] == "LIGHT").sum())
    medium_count = int((unique_df["weight_band"] == "MEDIUM").sum())

    # --- Freight kind distribution ---
    freight_dist = []
    if "freight_kind" in unique_df.columns:
        counts = unique_df["freight_kind"].fillna("UNKNOWN").astype(str).value_counts()
        for fk, count in counts.head(10).items():
            freight_dist.append({
                "freightKind": fk,
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
            })

    # --- Container size distribution ---
    size_dist = []
    if "container_length" in unique_df.columns:
        counts = unique_df["container_length"].fillna("UNKNOWN").astype(str).value_counts()
        for size, count in counts.head(10).items():
            size_dist.append({
                "containerSize": size,
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
            })

    # --- Special cargo ---
    reefer_c = 0
    haz_c = 0
    oog_c = 0

    if "reefer" in unique_df.columns:
        reefer_c = int(
            (unique_df["reefer"].astype(str).str.upper().isin(["TRUE", "Y", "1"])).sum()
        )

    haz_mask = pd.Series(False, index=unique_df.index)
    if "hazardous_flag" in unique_df.columns:
        haz_mask = haz_mask | unique_df["hazardous_flag"].astype(str).str.upper().isin(["TRUE", "Y", "1"])
    if "imdg_code" in unique_df.columns:
        haz_mask = haz_mask | (
            unique_df["imdg_code"].notna()
            & (unique_df["imdg_code"].astype(str).str.strip() != "")
        )
    haz_c = int(haz_mask.sum())

    if "oog_unit" in unique_df.columns:
        oog_c = int(
            (unique_df["oog_unit"].astype(str).str.upper().isin(["TRUE", "Y", "1"])).sum()
        )

    special_cargo = {
        "reeferCount": reefer_c,
        "hazardousCount": haz_c,
        "oogCount": oog_c,
    }

    # --- Discharge port grouping ---
    port_dist = []
    if "port_of_discharge" in unique_df.columns:
        counts = unique_df["port_of_discharge"].fillna("unknownPort").astype(str).value_counts()
        for port, count in counts.head(10).items():
            port_dist.append({
                "port": port,
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
            })

    # --- Weight distribution above / below deck ---
    above_deck = []
    below_deck = []
    for deck_name, target_list in [("ABOVE_DECK", above_deck), ("BELOW_DECK", below_deck)]:
        subset = unique_df[unique_df["historical_deck"] == deck_name]
        deck_total = max(len(subset), 1)
        for band in ["LIGHT", "MEDIUM", "HEAVY"]:
            c = int((subset["weight_band"] == band).sum())
            if c > 0:
                target_list.append({
                    "band": band,
                    "count": c,
                    "percentage": round((c / deck_total) * 100, 1),
                })

    # --- Equipment class distribution (REQ 6.2) ---
    # Combines the normalised equipment_class column (e.g. CONTAINER, REEFER) with
    # the human-readable equipment_type column (e.g. "20ft General", "40ft Hi-Cube General").
    # equipment_class is preferred; equipment_type is the fallback so that the
    # distribution is always populated even when one column is absent.
    equip_class_dist = []
    equip_col = None
    for candidate in ["equipment_class", "equipment_type"]:
        if candidate in unique_df.columns:
            equip_col = candidate
            break

    if equip_col is not None:
        eq_series = unique_df[equip_col].fillna("UNKNOWN").astype(str).str.strip()
        # When both columns exist, combine them as "CLASS | type" for richer labelling
        if "equipment_class" in unique_df.columns and "equipment_type" in unique_df.columns:
            eq_series = (
                unique_df["equipment_class"].fillna("UNKNOWN").astype(str).str.strip()
                + " | "
                + unique_df["equipment_type"].fillna("UNKNOWN").astype(str).str.strip()
            )

        counts = eq_series.value_counts()
        for eq_class, count in counts.head(20).items():
            equip_class_dist.append({
                "equipmentClass": eq_class,
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
            })

    # --- Historical visits ---
    visits = []
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
                "containerCount": (
                    int(grp["unit_id"].nunique()) if "unit_id" in grp.columns else int(len(grp))
                ),
                "moveCompleteTime": mct,
            })
        visits.sort(key=lambda x: x["moveCompleteTime"] or "", reverse=True)

    above_deck_count = 0
    below_deck_count = 0
    if "historical_deck" in unique_df.columns:
        above_deck_count = int((unique_df["historical_deck"] == "ABOVE_DECK").sum())
        below_deck_count = int((unique_df["historical_deck"] == "BELOW_DECK").sum())

    return {
        "summary": {
            "totalContainers": total_containers,
            "heavyCount": heavy_count,
            "lightCount": light_count,
            "mediumCount": medium_count,
            "aboveDeckCount": above_deck_count,
            "belowDeckCount": below_deck_count,
        },
        "freightKindDistribution": freight_dist,
        "containerSizeDistribution": size_dist,
        "specialCargoSummary": special_cargo,
        "dischargePortGrouping": port_dist,
        "weightDistribution": {
            "aboveDeck": above_deck,
            "belowDeck": below_deck,
        },
        # NEW: equipment class distribution added for REQ 6.2
        "equipmentClassDistribution": equip_class_dist,
        "historicalVisits": visits,
    }


def process_current_planning(
    vessel_id: str,
    yard_id: Optional[str],
    container_ids: List[str],
) -> dict:
    if not container_ids:
        return _empty_planning_response(vessel_id, 0)

    cleaned_ids = [str(x).strip() for x in container_ids if str(x).strip()]
    if not cleaned_ids:
        return _empty_planning_response(vessel_id, 0)

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
            outbound_service = svc_vals.mode().iloc[0]

    if "actual_outbound_carrier_visit_id" in df.columns:
        visit_vals = df["actual_outbound_carrier_visit_id"].dropna().astype(str).str.strip()
        if not visit_vals.empty:
            visit_id = visit_vals.mode().iloc[0]

    port_rotation_dict = {}
    if "port_of_discharge" in df.columns:
        ports = df["port_of_discharge"].dropna().astype(str).str.strip().str.upper()
        for idx, port in enumerate(ports.value_counts().index.tolist(), start=1):
            port_rotation_dict[port] = idx

    recommendations = []

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
        position_text = _safe_str(
            _first_existing_value(
                row,
                ["current_position", "current_slot_position", "slot_position", "yard_position"],
            ),
            "",
        )

        current_slot_position = _safe_str(
            row.get("current_slot_position"), position_text or "UNKNOWN"
        )
        
        current_yard_block = _safe_str(row.get("current_yard_block"), "")
        if not current_yard_block and current_slot_position != "UNKNOWN":
            from utils.position_parser import parse_position
            parsed_pos = parse_position(current_slot_position)
            current_yard_block = block_label(parsed_pos) or "UNKNOWN"
        if not current_yard_block:
            current_yard_block = "UNKNOWN"

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

        rec["recommendedTier"] = _derive_recommended_tier(weight_band, rec["loadingPriority"])
        rec["actualOutboundCarrierVisitId"] = actual_visit
        rec["outboundService"] = outbound_svc
        rec["equipmentClass"] = eq_class
        rec["weightCategory"] = weight_band
        rec["portOfDischarge"] = port if port else None
        rec["currentYardBlock"] = current_yard_block
        rec["currentSlotPosition"] = current_slot_position

        recommendations.append(rec)

    # Calculate Port of Discharge grouping for the current planning recommendations
    port_counts = {}
    total_recs = len(recommendations)
    for rec in recommendations:
        port = rec.get("portOfDischarge") or "UNKNOWN"
        port_counts[port] = port_counts.get(port, 0) + 1

    discharge_port_grouping = []
    # Sort ports by count descending
    sorted_ports = sorted(port_counts.items(), key=lambda x: x[1], reverse=True)
    for port, count in sorted_ports:
        discharge_port_grouping.append({
            "port": port,
            "count": count,
            "percentage": round((count / max(total_recs, 1)) * 100, 1)
        })

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
        "dischargePortGrouping": discharge_port_grouping,
    }


def _empty_history_response() -> dict:
    return {
        "summary": {"totalContainers": 0, "heavyCount": 0, "lightCount": 0, "mediumCount": 0, "aboveDeckCount": 0, "belowDeckCount": 0},
        "freightKindDistribution": [],
        "containerSizeDistribution": [],
        "specialCargoSummary": {
            "reeferCount": 0,
            "hazardousCount": 0,
            "oogCount": 0,
        },
        "dischargePortGrouping": [],
        "weightDistribution": {"aboveDeck": [], "belowDeck": []},
        # NEW: always include empty list so callers get a consistent shape
        "equipmentClassDistribution": [],
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
        "dischargePortGrouping": [],
    }