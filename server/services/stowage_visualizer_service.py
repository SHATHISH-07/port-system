# cspell:disable
from __future__ import annotations
import re
import pandas as pd
from typing import Any, List, Optional
from services.heatmap_service import _deterministic_layout
from db.queries import load_from_db
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_decoder import parse_vessel_slot
from utils.position_parser import parse_position
from utils.stowage_rules import generate_recommendation, classify_weight_band, predict_reshuffle_risk

from utils.stowage_rules import PositionAllocator

# Internal helpers
def _normalize_column_name(name: str) -> str:
    """
    Normalizes a column name by lowercasing, stripping, and replacing special characters.
    """
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return re.sub(r"_+", "_", name).strip("_")

def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalizes all column names in a DataFrame.
    """
    if df.empty:
        return df
    df = df.copy()
    df.columns = [_normalize_column_name(c) for c in df.columns]
    return df

def _safe_str(value: Any, default: str = "") -> str:
    """
    Safely converts a value to a string, handling None, NaNs, and explicit null words.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return default
    return text

def _first_existing_value(row: pd.Series, candidates: List[str]) -> Any:
    """
    Returns the first non-empty value found in the row for a given list of candidate columns.
    """
    for col in candidates:
        if col in row and pd.notna(row.get(col)) and str(row.get(col)).strip() != "":
            return row.get(col)
    return None

def _dedupe_latest_per_unit(df: pd.DataFrame) -> pd.DataFrame:
    """
    Deduplicates a DataFrame by unit_id, keeping the latest record based on timestamp columns.
    """
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
    """
    Derives the recommended vessel tier based on weight band and loading priority.
    """
    band = str(weight_band).strip().upper()
    if band == "HEAVY":
        return "02"
    if band == "LIGHT":
        return "08" if loading_priority <= 7 else "10"
    return "04" if loading_priority <= 5 else "06"

# Map group builder
def _build_map_groups(df: pd.DataFrame, port_rotation_dict: dict, yard_id: str = None) -> List[dict]:
    """
    Groups container positions by discharge port for map visualization.
    """
    map_groups: dict = {}
    
    position_allocator = PositionAllocator()

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

        visit_state = _safe_str(row.get("visit_state"), "")
        category    = _safe_str(row.get("category_id"), "")
        is_loaded   = (visit_state == "3DEPARTED") or (category == "EXPRT")

        # Resolve yard position
        yard_pos_str = ""
        if is_loaded:
            yard_pos_str = _safe_str(row.get("ctr_from_position"), "")
        else:
            yard_pos_str = _safe_str(
                _first_existing_value(row, ["current_position", "ctr_to_position"]), ""
            )

        # Resolve vessel position (only for loaded containers)
        vessel_pos_str = ""
        if is_loaded:
            vessel_pos_str = _safe_str(
                _first_existing_value(row, ["current_position", "ctr_to_position"]), ""
            )

        # Decode yard slot
        yard_block = "UNKNOWN"
        yard_row = yard_col = yard_tier = yard_slot_raw = None
        yard_info = parse_position(yard_pos_str, yard_id)
        if yard_info and yard_info.get("is_yard"):
            yard_block = yard_info.get("block", "UNKNOWN")
            yard_slot_raw = yard_info.get("raw")
            yard_row = yard_info.get("bay")
            yard_col = yard_info.get("row")
            yard_tier = yard_info.get("tier")

        # Decode vessel slot
        vessel_bay = vessel_row_n = vessel_tier = vessel_deck = vessel_visit_id = None
        vessel_info = parse_vessel_slot(vessel_pos_str)
        if vessel_info and vessel_info.get("decoded"):
            d = vessel_info["decoded"]
            try:
                vessel_bay = int(d["bay"])
                vessel_row_n = int(d["row"])
                vessel_tier = int(d["tier"])
                vessel_deck = "ABOVE_DECK" if vessel_tier >= 80 else "BELOW_DECK"
                vessel_visit_id = vessel_info.get("visitId")
            except (KeyError, ValueError, TypeError):
                pass

        status = "LOADED" if is_loaded else "IN_YARD"

        actual_visit = _safe_str(
            _first_existing_value(row, ["actual_outbound_carrier_visit_id"]), None
        )
        outbound_svc = _safe_str(_first_existing_value(row, ["outbound_service"]), None)

        rec = generate_recommendation(
            unit_id=unit_id,
            weight_band=weight_band,
            discharge_port=port if port else None,
            equipment_class=eq_class,
            yard_block=yard_block,
            yard_slot=yard_slot_raw,
            port_rotation_dict=port_rotation_dict,
        )

        rec_bay, rec_row, rec_tier = position_allocator.get_next_position(port if port else "UNKNOWN", rec["recommendedDeck"])

        group_key = port if port else "UNKNOWN"
        group_type = "dischargePort"

        if group_key not in map_groups:
            map_groups[group_key] = {"groupId": group_key, "groupType": group_type, "positions": []}

        try:
            wt_float = float(weight_kg) if weight_kg is not None else None
            if wt_float is not None and pd.isna(wt_float):
                wt_float = None
        except ValueError:
            wt_float = None

        map_groups[group_key]["positions"].append(
            {
                "unitId": unit_id,
                "status": status,
                "weightCategory": weight_band,
                "weightKg": wt_float if wt_float is not None else 0.0,
                "freightKind": _safe_str(row.get("freight_kind"), "UNKNOWN"),
                "equipmentClass": eq_class if eq_class != "unknownEquipmentClass" else "UNKNOWN",
                "containerLength": _safe_str(length, "20") if length else "20",
                "loadingPriority": int(rec["loadingPriority"]),
                "reshuffleRisk": rec["reshuffleRisk"],
                "outboundService": outbound_svc or "UNKNOWN",
                "actualOutboundCarrierVisitId": actual_visit or "UNKNOWN",
                "portOfDischarge": port if port else "UNKNOWN",

                # Yard coordinates
                "yardBlock": yard_block if yard_block != "UNKNOWN" else "UNASSIGNED",
                "yardRow": yard_row or "00",
                "yardCol": yard_col or "00",
                "yardTier": yard_tier or "01",
                "yardSlotRaw": yard_slot_raw or "UNASSIGNED",

                # Vessel coordinates
                "vesselBay": vessel_bay or 0,
                "vesselRow": vessel_row_n or 0,
                "vesselTier": vessel_tier or 0,
                "vesselDeck": vessel_deck or rec["recommendedDeck"],
                "vesselVisitId": vessel_visit_id or "UNASSIGNED",

                # Legacy fields mapping
                "currentYardBlock": yard_block if yard_block != "UNKNOWN" else "UNASSIGNED",
                "currentSlotPosition": yard_slot_raw or "UNASSIGNED",
                "recommendedDeck": rec["recommendedDeck"],
                "recommendedTier": rec_tier,
                "recommendedBay": rec_bay,
                "recommendedRow": rec_row,
                "parsedBay": str(vessel_bay) if vessel_bay is not None else rec_bay,
                "parsedRow": str(vessel_row_n) if vessel_row_n is not None else rec_row,
                "parsedTier": str(vessel_tier) if vessel_tier is not None else rec_tier,
                "parsedBlock": yard_block if yard_block != "UNKNOWN" else "UNASSIGNED",
                "parsedDeck": vessel_deck if vessel_deck else rec["recommendedDeck"],
            }
        )

    final_map_groups = []
    for group in map_groups.values():
        sorted_positions = sorted(
            group["positions"], key=lambda x: (x["loadingPriority"], x["unitId"])
        )
        container_ids = [p["unitId"] for p in sorted_positions]
        final_map_groups.append(
            {
                "groupId": group["groupId"],
                "groupType": group["groupType"],
                "containerCount": len(sorted_positions),
                "containerIds": container_ids,
                "positions": sorted_positions,
            }
        )

    final_map_groups.sort(key=lambda x: (x["groupType"], x["groupId"]))
    return final_map_groups


def _build_yard_grid(df: pd.DataFrame, terminal: str) -> dict:
    """
    Constructs a grid summary of the yard block capacities, proximities, and weight distributions.
    """

    blocks = {}
    for _, row in df.iterrows():
        visit_state = _safe_str(row.get("visit_state"), "")
        category    = _safe_str(row.get("category_id"), "")
        is_loaded   = (visit_state == "3DEPARTED") or (category == "EXPRT")
        
        yard_pos = _safe_str(
            row.get("ctr_from_position") if is_loaded else row.get("current_position"), ""
        )
        yard_info = parse_position(yard_pos, terminal)
        if not yard_info or not yard_info.get("is_yard"):
            continue
        
        blk = yard_info.get("block", "UNKNOWN")
        col = yard_info.get("row")
        
        tier = 1
        try:
            tier_val = yard_info.get("tier")
            if tier_val and str(tier_val).isdigit():
                tier = int(tier_val)
        except Exception:
            pass
        
        w_val = _first_existing_value(
            row, ["unit_weight_in_kg","verified_gross_mass_kg","gross_mass_kg"]
        )
        l_val = _first_existing_value(row, ["container_length","equipment_length"])
        wb = classify_weight_band(w_val, str(l_val) if l_val else None)
        pod = _safe_str(_first_existing_value(row, ["port_of_discharge"]), "UNKNOWN")
        
        if blk not in blocks:
            blocks[blk] = {
                "blockId": blk,
                "zone": "",
                "blockLetter": blk,
                "terminal": terminal,
                "berthProximity": "MID",
                "cols": set(),
                "tierMax": 0,
                "loaded": 0, "in_yard": 0,
                "pod_counts": {},
                "weight_counts": {"HEAVY":0,"MEDIUM":0,"LIGHT":0},
                "reshuffle_risks": [],
            }
        
        b = blocks[blk]
        if col:
            b["cols"].add(col)
        b["tierMax"] = max(b["tierMax"], tier)
        if is_loaded:
            b["loaded"] += 1
        else:
            b["in_yard"] += 1
        b["pod_counts"][pod] = b["pod_counts"].get(pod, 0) + 1
        b["weight_counts"][wb] = b["weight_counts"].get(wb, 0) + 1
        b["reshuffle_risks"].append(
            predict_reshuffle_risk(blk, yard_pos, "BELOW_DECK", terminal)
        )
    
    unique_blocks = [blk for blk in blocks if blk != "UNKNOWN"]
    proximity_map = {}
    if unique_blocks:
        block_scores = {blk: b["loaded"] + b["in_yard"] + (b["weight_counts"].get("HEAVY", 0) * 2) for blk, b in blocks.items() if blk != "UNKNOWN"}
        max_block = max(block_scores, key=block_scores.get) if block_scores else unique_blocks[0]
        layout = _deterministic_layout(unique_blocks)
        max_pos = layout.get(max_block, {"x": 0, "y": 0})
        
        distances = {}
        for blk in unique_blocks:
            pos = layout.get(blk, {"x": 0, "y": 0})
            distances[blk] = abs(pos["x"] - max_pos["x"]) + abs(pos["y"] - max_pos["y"])
            
        if distances:
            min_dist = min(distances.values())
            for blk, dist in distances.items():
                if dist == min_dist:
                    proximity_map[blk] = "CLOSE"
                elif dist <= min_dist + 1:
                    proximity_map[blk] = "MID"
                else:
                    proximity_map[blk] = "FAR"

    block_summaries = []
    loaded_total = 0
    in_yard_total = 0
    for blk, b in sorted(blocks.items()):
        dominant_pod = max(b["pod_counts"], key=b["pod_counts"].get) if b["pod_counts"] else None
        modal_risk = max(set(b["reshuffle_risks"]), key=b["reshuffle_risks"].count) if b["reshuffle_risks"] else "MEDIUM"
        pod_groups = [
            {"port": p, "count": c}
            for p, c in sorted(b["pod_counts"].items(), key=lambda x: -x[1])
        ]
        total_in_block = b["loaded"] + b["in_yard"]
        loaded_total += b["loaded"]
        in_yard_total += b["in_yard"]
        
        block_summaries.append({
            "blockId": blk,
            "zone": b["zone"],
            "blockLetter": b["blockLetter"],
            "terminal": b["terminal"],
            "berthProximity": proximity_map.get(blk, "MID"),
            "colLabels": sorted(b["cols"]),
            "tierMax": b["tierMax"],
            "containerCount": total_in_block,
            "loadedToVessel": b["loaded"],
            "inYard": b["in_yard"],
            "dominantPod": dominant_pod,
            "podGroups": pod_groups,
            "weightProfile": b["weight_counts"],
            "avgReshuffleRisk": modal_risk,
        })
    
    return {
        "blocks": block_summaries,
        "loadedTotal": loaded_total,
        "inYardTotal": in_yard_total,
    }

# Public entry point
def get_stowage_visualization(
    vessel_id: str,
    yard_id: Optional[str] = None,
    visit_id: Optional[str] = None,
    container_ids: Optional[List[str]] = None,
    port_rotation: Optional[List[str]] = None,
) -> dict:
    """
    Returns a unified data map for the visual deck, including container coordinates and grid summaries.
    """
    mode = "HISTORICAL" if visit_id else "CURRENT"
    df = pd.DataFrame()
    resolved_count = 0

    if mode == "HISTORICAL":
        df = load_from_db("history", vessel_id=vessel_id, yard_id=yard_id, full_load=True)
        if df is not None and not df.empty:
            df = _normalize_dataframe_columns(df)

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
                    df = _normalize_dataframe_columns(df)
                    
                    # We should NOT filter by outbound_service here if the user explicitly provided container_ids.
                    # Active yard containers do not have outbound_service assigned yet.
                        
                    df = _dedupe_latest_per_unit(df)
                    resolved_count = len(df)

    if df is None or df.empty:
        return {
            "mode": mode,
            "vesselId": vessel_id,
            "yardId": yard_id or "UNKNOWN",
            "visitId": visit_id or "UNKNOWN",
            "map": {"groups": []},
            "yardGrid": {"blocks": [], "loadedTotal": 0, "inYardTotal": 0},
            "summary": {
                "totalContainers": len(container_ids) if container_ids else 0,
                "resolvedCount": 0,
            },
            "dischargeSequence": [],
        }

    rotation = []
    if port_rotation and len(port_rotation) > 0:
        rotation = port_rotation
    else:
        try:
            history_df = load_from_db("history", vessel_id=vessel_id)
            if history_df is not None and not history_df.empty and "port_of_discharge" in history_df.columns:
                hist_counts = history_df["port_of_discharge"].dropna().astype(str).str.strip().str.upper().value_counts()
                rotation = [p for p in hist_counts.index if p and p not in ("NAN", "NONE", "NULL", "UNKNOWNPORT")]
        except Exception:
            pass

    discharge_sequence = []
    rank_map = {}
    current_rank = 1
    
    # 1. Assign ranks from rotation list
    for p in rotation:
        if p not in rank_map:
            rank_map[p] = current_rank
            discharge_sequence.append({"port": p, "dischargeOrder": current_rank})
            current_rank += 1
            
    # 2. Append any ports in the current dataframe that aren't in rotation
    if "port_of_discharge" in df.columns:
        df_ports = df["port_of_discharge"].dropna().astype(str).str.strip().str.upper().value_counts().index.tolist()
        for p in df_ports:
            if p and p not in ("NAN", "NONE", "NULL", "UNKNOWNPORT") and p not in rank_map:
                rank_map[p] = current_rank
                discharge_sequence.append({"port": p, "dischargeOrder": current_rank})
                current_rank += 1

    port_rotation_dict = rank_map

    groups = _build_map_groups(df, port_rotation_dict)
    
    terminal = "PEB" if (yard_id and "PEB" in str(yard_id).upper()) else "CWIT"
    yard_grid = _build_yard_grid(df, terminal)

    return {
        "mode": mode,
        "vesselId": vessel_id,
        "yardId": yard_id,
        "visitId": visit_id,
        "map": {"groups": groups},
        "yardGrid": yard_grid,
        "summary": {
            "totalContainers": len(container_ids) if container_ids else resolved_count,
            "resolvedCount": resolved_count,
        },
        "dischargeSequence": discharge_sequence,
    }
