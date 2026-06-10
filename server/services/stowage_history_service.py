import logging
from auth.utils import logger
from db.queries import get_vessel_schedule, update_vessel_schedule, load_from_db
import pandas as pd
from typing import Any, List, Optional
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_decoder import parse_vessel_slot
from utils.position_parser import parse_position
from utils.stowage_rules import generate_recommendation, classify_weight_band, classify_deck_position, predict_reshuffle_risk
from services.heatmap_service import _deterministic_layout, calculate_dynamic_proximity
from db.connection import get_engine
from services.stowage_helpers import _normalize_column_name, _normalize_dataframe_columns, _first_existing_value, _safe_str, _dedupe_latest_per_unit, _derive_recommended_tier, _determine_historical_deck, _empty_history_response

def _compute_crane_metrics(
    vessel_id: str,
    yard_id: Optional[str],
    visit_id: Optional[str] = None,
) -> Optional[dict]:
    """
    Computes crane productivity and reshuffle metrics for a specific vessel visit from history.
    """
    if visit_id:
        # Fast path: query crane data directly for this specific visit only
        visit_ids = [str(visit_id)]
    else:
        # General path: derive all visit IDs from history
        history_df = load_from_db("history", vessel_id=vessel_id, yard_id=yard_id, full_load=True)
        if history_df is None or history_df.empty:
            return None
        history_df = _normalize_dataframe_columns(history_df)
        if "actual_outbound_carrier_visit_id" not in history_df.columns:
            return None
        visit_ids = list(history_df["actual_outbound_carrier_visit_id"].dropna().astype(str).unique())

    if not visit_ids:
        return None

    crane_df = load_from_db("crane", vessel_id=visit_ids, yard_id=yard_id)
    if crane_df is None or crane_df.empty:
        return None

    # Safety net: ensure we only have rows for the requested visit(s)
    if "carrier_visit" in crane_df.columns:
        crane_df = crane_df[crane_df["carrier_visit"].astype(str).isin([str(v) for v in visit_ids])].copy()
    if crane_df.empty:
        return None

    crane_df["time_completed"] = pd.to_datetime(crane_df["time_completed"], errors="coerce")

    sort_col = "crane_che" if "crane_che" in crane_df.columns else "crane_id"
    crane_df = crane_df.sort_values([sort_col, "carrier_visit", "time_completed"]).reset_index(drop=True)

    total_moves = int(len(crane_df))
    load_moves = int((crane_df["event_type"] == "UNIT_LOAD").sum())
    discharge_moves = int((crane_df["event_type"] == "UNIT_DISCHARGE").sum())
    restow_moves = int((crane_df["event_type"] == "UNIT_RESTOW").sum())
    productive = load_moves + discharge_moves

    reshuffle_rate = round(
        (restow_moves / productive * 100) if productive > 0 else 0.0, 2
    )

    productive_df = crane_df[
        crane_df["event_type"].isin(["UNIT_LOAD", "UNIT_DISCHARGE"])
    ].copy()
    productive_df["prev_event"] = productive_df.groupby(
        [sort_col, "carrier_visit"]
    )["event_type"].shift(1)
    
    productive_df["prev_time"] = productive_df.groupby(
        [sort_col, "carrier_visit"]
    )["time_completed"].shift(1)
    
    productive_df["gap_mins"] = (
        productive_df["time_completed"] - productive_df["prev_time"]
    ).dt.total_seconds() / 60

    dual_mask = (
        (
            (productive_df["event_type"] == "UNIT_LOAD") &
            (productive_df["prev_event"] == "UNIT_DISCHARGE")
        ) | (
            (productive_df["event_type"] == "UNIT_DISCHARGE") &
            (productive_df["prev_event"] == "UNIT_LOAD")
        )
    ) & (productive_df["gap_mins"] <= 15)
    
    dual_cycle_count = int(dual_mask.sum())
    dual_cycle_rate = round(
        (dual_cycle_count / productive * 100) if productive > 0 else 0.0, 2
    )

    crane_df["prev_time"] = crane_df.groupby(
        [sort_col, "carrier_visit"]
    )["time_completed"].shift(1)

    crane_df["gap_mins"] = (
        crane_df["time_completed"] - crane_df["prev_time"]
    ).dt.total_seconds() / 60
    avg_gap = round(float(crane_df["gap_mins"].dropna().median()), 2) if not crane_df["gap_mins"].dropna().empty else 0.0

    restow_df = crane_df[crane_df["event_type"] == "UNIT_RESTOW"].copy()
    restow_df["from_block"] = restow_df["from_position"].apply(
        lambda p: parse_position(p, yard_id).get("block") if parse_position(p, yard_id) and parse_position(p, yard_id).get("is_yard") else None
    )
    block_counts = (
        restow_df["from_block"].dropna().value_counts().head(10)
    )
    reshuffle_by_block = [
        {
            "block": blk,
            "count": int(cnt),
            "percentage": round(cnt / max(restow_moves, 1) * 100, 1),
        }
        for blk, cnt in block_counts.items()
    ]

    return {
        "totalMoves": total_moves,
        "loadMoves": load_moves,
        "dischargeMoves": discharge_moves,
        "restowMoves": restow_moves,
        "reshuffleRate": reshuffle_rate,
        "dualCycleCount": dual_cycle_count,
        "dualCycleRate": dual_cycle_rate,
        "avgMoveGapMinutes": avg_gap,
        "reshuffleByBlock": reshuffle_by_block,
    }


def get_historical_stowage_analysis(
    vessel_id: str,
    yard_id: Optional[str] = None,
    visit_id: Optional[str] = None,
) -> dict:
    """
    Retrieves and aggregates historical stowage data, returning a comprehensive analysis.
    """
    df = load_from_db("history", vessel_id=vessel_id, yard_id=yard_id, full_load=True)
    if df is None or df.empty:
        return _empty_history_response()

    logger = logging.getLogger("port_system")
    logger.info(f"[DEBUG] After load_from_db: {len(df)} rows")
    df = _normalize_dataframe_columns(df)

    if "visit_state" in df.columns and df["visit_state"].notna().any():
        df = df[df["visit_state"].notna()].copy()
        logger.info(f"[DEBUG] After visit_state filter: {len(df)} rows")

    if df.empty:
        logger.info(f"[DEBUG] Returning empty because df is empty here")
        return _empty_history_response()

    visits = []
    if "actual_outbound_carrier_visit_id" in df.columns:
        for vid, grp in df.groupby("actual_outbound_carrier_visit_id", dropna=True):
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

    if visit_id and "actual_outbound_carrier_visit_id" in df.columns:
        logger.info(f"[DEBUG] visit_id param: '{visit_id}'")
        logger.info(f"[DEBUG] Unique values in df: {df['actual_outbound_carrier_visit_id'].unique()}")
        df = df[df["actual_outbound_carrier_visit_id"].astype(str) == str(visit_id)].copy()

    if df.empty:
        logger.info(f"[DEBUG] Returning empty because df is empty after actual_outbound_carrier_visit_id filter")
        return _empty_history_response()

    # When querying all history, dedupe by unit_id AND visit_id so containers that visited multiple times are counted for each visit.
    if visit_id:
        unique_df = _dedupe_latest_per_unit(df)
    else:
        if "actual_outbound_carrier_visit_id" in df.columns:
            # Sort to keep latest event per visit for each unit
            df["unit_id"] = df["unit_id"].astype(str).str.strip().str.upper()
            sort_cols = []
            ascending = []
            for col in ["move_complete_time", "updated_at", "created_at"]:
                if col in df.columns:
                    df[col] = pd.to_datetime(df[col], errors="coerce")
                    sort_cols.append(col)
                    ascending.append(False)
            if sort_cols:
                df = df.sort_values(by=sort_cols, ascending=ascending, na_position="last")
            unique_df = df.drop_duplicates(subset=["unit_id", "actual_outbound_carrier_visit_id"], keep="first").reset_index(drop=True)
        else:
            unique_df = _dedupe_latest_per_unit(df)

    if unique_df.empty:
        logger.info(f"[DEBUG] Returning empty because unique_df is empty")
        return _empty_history_response()

    def _resolve_attributes(row: pd.Series) -> pd.Series:
        """
        Derives weight band and historical deck position for a single container row.
        """
        w = _first_existing_value(
            row,
            ["unit_weight_in_kg", "verified_gross_mass_kg", "gross_mass_kg", "gross_weight_kg"],
        )
        length_val = _first_existing_value(row, ["container_length", "equipment_length"])
        pos = _first_existing_value(
            row,
            ["current_position", "ctr_to_position", "ctr_from_position", "slot_position"],
        )
        wb = classify_weight_band(w, length_val)
        deck = _determine_historical_deck(_safe_str(pos), wb)
        return pd.Series([wb, deck])

    unique_df[["weight_band", "historical_deck"]] = unique_df.apply(_resolve_attributes, axis=1)

    total_containers = int(len(unique_df))
    heavy_count = int((unique_df["weight_band"] == "HEAVY").sum())
    light_count = int((unique_df["weight_band"] == "LIGHT").sum())
    medium_count = int((unique_df["weight_band"] == "MEDIUM").sum())

    freight_dist = []
    if "freight_kind" in unique_df.columns:
        counts = unique_df["freight_kind"].fillna("UNKNOWN").astype(str).value_counts()
        for fk, count in counts.head(10).items():
            freight_dist.append({
                "freightKind": fk,
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
            })

    size_dist = []
    if "container_length" in unique_df.columns:
        counts = unique_df["container_length"].fillna("UNKNOWN").astype(str).value_counts()
        for size, count in counts.head(10).items():
            size_dist.append({
                "containerSize": size,
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
            })

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

    port_dist = []
    if "port_of_discharge" in unique_df.columns:
        # Create a normalized series for grouping to avoid duplicate unknownPort entries
        safe_ports = unique_df["port_of_discharge"].astype(str).str.strip().str.lower()
        safe_ports = safe_ports.replace(["none", "nan", "null", ""], "unknownPort")
        safe_ports = unique_df["port_of_discharge"].where(safe_ports != "unknownPort", "unknownPort")
        safe_ports = safe_ports.astype(str).str.strip().str.upper()
        safe_ports = safe_ports.replace("UNKNOWNPORT", "unknownPort")

        for port, group in unique_df.groupby(safe_ports):
            count = len(group)
            unit_ids = group["unit_id"].dropna().astype(str).tolist() if "unit_id" in group.columns else []
            port_dist.append({
                "port": str(port),
                "count": int(count),
                "percentage": round((count / max(total_containers, 1)) * 100, 1),
                "containerIds": unit_ids
            })
        port_dist.sort(key=lambda x: x["count"], reverse=True)
        port_dist = port_dist[:10]
        
    discharge_sequence = []
    if "port_of_discharge" in unique_df.columns:
        pod_counts_series = unique_df["port_of_discharge"].dropna().astype(str).str.strip().str.upper().value_counts()
        for rank, (port_str, cnt) in enumerate(pod_counts_series.items(), start=1):
            if port_str and port_str not in ("NAN", "NONE", ""):
                discharge_sequence.append({
                    "port": port_str,
                    "dischargeOrder": rank
                })

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

    equip_class_dist = []
    equip_col = None
    for candidate in ["equipment_class", "equipment_type"]:
        if candidate in unique_df.columns:
            equip_col = candidate
            break

    if equip_col is not None:
        eq_series = unique_df[equip_col].fillna("UNKNOWN").astype(str).str.strip()
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



    above_deck_count = 0
    below_deck_count = 0
    if "historical_deck" in unique_df.columns:
        above_deck_count = int((unique_df["historical_deck"] == "ABOVE_DECK").sum())
        below_deck_count = int((unique_df["historical_deck"] == "BELOW_DECK").sum())

    crane_metrics = _compute_crane_metrics(vessel_id, yard_id, visit_id)

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
        "equipmentClassDistribution": equip_class_dist,
        "historicalVisits": visits,
        "dischargeSequence": discharge_sequence,
        "craneMetrics": crane_metrics or {
            "totalMoves": 0, "loadMoves": 0, "dischargeMoves": 0,
            "restowMoves": 0, "reshuffleRate": 0.0,
            "dualCycleCount": 0, "dualCycleRate": 0.0,
            "avgMoveGapMinutes": 0.0, "reshuffleByBlock": []
        },
    }

