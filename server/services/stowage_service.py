from auth.utils import logger
from db.queries import get_vessel_schedule
from db.queries import update_vessel_schedule
import pandas as pd
from typing import Any, List, Optional
from db.queries import load_from_db
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_decoder import parse_vessel_slot
from utils.position_parser import parse_position
from utils.stowage_rules import generate_recommendation, classify_weight_band, classify_deck_position, predict_reshuffle_risk
from services.heatmap_service import _deterministic_layout, calculate_dynamic_proximity
from db.connection import get_engine


def _normalize_column_name(name: str) -> str:
    """
    Normalizes a column name by lowercasing, stripping, and replacing special characters.
    """
    import re
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

def _first_existing_value(row: pd.Series, candidates: List[str]) -> Any:
    """
    Returns the first non-empty value found in the row for a given list of candidate columns.
    """
    for col in candidates:
        if col in row and pd.notna(row.get(col)) and str(row.get(col)).strip() != "":
            return row.get(col)
    return None

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

def _dedupe_latest_per_unit(df: pd.DataFrame) -> pd.DataFrame:
    """
    Deduplicates a DataFrame by unit_id, keeping the latest record based on timestamp columns.
    """
    if df.empty or "unit_id" not in df.columns:
        return df
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

def _determine_historical_deck(position_text: str, weight_band: str) -> str:
    """
    Determines if a vessel position was ABOVE_DECK or BELOW_DECK, falling back to weight heuristics.
    """
    if position_text:
        v_info = parse_vessel_slot(position_text)
        if v_info and v_info.get("decoded"):
            tier_str = v_info["decoded"].get("tier")
            if tier_str and str(tier_str).isdigit():
                return "ABOVE_DECK" if int(tier_str) >= 80 else "BELOW_DECK"
    return classify_deck_position(weight_band)

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

    import logging
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

def _generate_current_planning_insights(block_strategies, pod_groups, baseline_reshuffle, pod_conc, proj_reduction, crane_metrics=None) -> list[str]:
    """
    Generates strategic textual insights about the current yard block groupings and vessel planning.
    """
    insights = []
    
    # 1. Heavy containers close to berth
    close_blocks = [b["block"] for b in block_strategies if b["berthProximity"] == "CLOSE"]
    heavy_in_close = sum(b["heavyCount"] for b in block_strategies if b["berthProximity"] == "CLOSE")
    if close_blocks:
        insights.append(
            f"Yard Strategy: Heavy containers positioned close to berth. Detected {heavy_in_close} HEAVY units assigned to berth-close blocks ({', '.join(close_blocks)})."
        )

    # 2. Light containers upper stack
    light_count = sum(b.get("lightCount", 0) for b in block_strategies)
    if light_count > 0:
        insights.append(f"Yard Strategy: {light_count} LIGHT containers prioritized for upper stack loading.")

    # 3. Group by discharge
    num_ports = len(pod_groups)
    if num_ports > 0:
        insights.append(f"Yard Strategy: Containers grouped by discharge sequence into {num_ports} sequential zones to streamline crane operations.")

    # 4. Reduce reshuffle & Expected Results
    insights.append(
        f"Yard Strategy: Reduce reshuffle requirement. Current POD grouping concentration is {pod_conc*100:.1f}%."
    )
    if baseline_reshuffle > 0:
        insights.append(
            f"Expected Result: Lower reshuffle % (projected {proj_reduction:.1f}% reduction from {baseline_reshuffle:.1f}% baseline)."
        )

    # 5. Dual Cycle and Gap
    if crane_metrics:
        dual_rate = crane_metrics.get("dualCycleRate", 0.0)
        gap_mins = crane_metrics.get("avgMoveGapMinutes", 0.0)
        if dual_rate > 0:
            insights.append(f"Expected Result: Better dual cycle (historical baseline is {dual_rate}%).")
        if gap_mins > 0:
            insights.append(f"Expected Result: Faster crane execution (aiming to reduce {gap_mins} min avg move gap).")
    
    return insights


def process_current_planning_and_yard_strategy(
    vessel_id: str,
    yard_id: Optional[str],
    container_ids: List[str],
    port_rotation: Optional[List[str]] = None,
) -> dict:
    """
    Analyzes current container locations and generates an optimized loading plan and block strategy.
    """
    cleaned_ids = [str(x).strip() for x in container_ids if str(x).strip()]
    
    if cleaned_ids:
        df = lookup_containers_by_ids(cleaned_ids, yard_id)
    else:
        # Fallback to fetching all containers for this vessel
        df = load_from_db("current", yard_id=yard_id, vessel_id=vessel_id)
        if df.empty:
            df = load_from_db("history", yard_id=yard_id, vessel_id=vessel_id)
        
        if not df.empty:
            v_id_upper = str(vessel_id).strip().upper()
            mask = pd.Series([False] * len(df), index=df.index)
            if "outbound_service" in df.columns:
                mask |= (df["outbound_service"].astype(str).str.strip().str.upper() == v_id_upper)
            if "actual_outbound_carrier_visit_id" in df.columns:
                mask |= (df["actual_outbound_carrier_visit_id"].astype(str).str.strip().str.upper() == v_id_upper)
            df = df[mask].copy()

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
    terminal = "PEB" if (yard_id and "PEB" in str(yard_id).upper()) else "CWIT"

    def resolve_yard_block(row):
        """
        Parses a yard position string to safely extract the block identifier.
        """
        visit_state = _safe_str(row.get("visit_state"), "")
        is_loaded = "DEPARTED" in visit_state.upper()
        pos = _safe_str(row.get("ctr_from_position") if is_loaded else row.get("current_position"), "")
        if not pos:
            pos = _safe_str(row.get("current_position") or row.get("ctr_from_position") or "", "")
        info = parse_position(pos, yard_id)
        return info.get("block") if info and info.get("is_yard") else None

    df["yard_block"] = df.apply(resolve_yard_block, axis=1)
    df["is_loaded"] = (df.get("visit_state", "") == "3DEPARTED") | (df.get("category_id", "") == "EXPRT")
    df["is_in_yard"] = (df.get("visit_state", "") == "IN_YARD")
    
    w_col = next((c for c in ["unit_weight_in_kg", "verified_gross_mass_kg", "gross_mass_kg", "gross_weight_kg"] if c in df.columns), None)
    l_col = next((c for c in ["container_length", "equipment_length"] if c in df.columns), None)
    df["weight_band"] = df.apply(lambda r: classify_weight_band(r.get(w_col) if w_col else None, str(r.get(l_col,"")) if l_col else None), axis=1)

    # 0. Pre-calculate Port Sequence (rank_map) so we can apply LIFO logic during recommendation generation
    temp_counts = df["port_of_discharge"].dropna().astype(str).str.strip().str.upper().value_counts() if "port_of_discharge" in df.columns else {}
    rotation = port_rotation if (port_rotation and len(port_rotation) > 0) else []
    
    if rotation:
        try:
            # If the user explicitly passed a rotation from UI "Apply Changes", permanently save it!
            update_vessel_schedule(get_engine(), str(vessel_id).strip().upper(), rotation)
        except Exception:
            pass
    
    if not rotation:
        try:
            db_schedule = get_vessel_schedule(get_engine(), str(vessel_id).strip().upper())
            if db_schedule:
                rotation = db_schedule
        except Exception:
            pass
            
    current_ports = [p.upper() for p in temp_counts.index if p and p not in ("NAN", "NONE", "NULL", "UNKNOWNPORT")]

    if rotation:
        # Check if there are completely new ports in the current dataset that the DB sequence doesn't know about!
        missing_ports = [p for p in current_ports if p not in rotation]
        if missing_ports:
            from utils.routing import sort_ports_nearest_neighbor
            # Geographically sort the missing ports starting from the last known port in the rotation
            last_port = rotation[-1] if rotation else None
            sorted_missing = sort_ports_nearest_neighbor(missing_ports, start_port=last_port)
            rotation.extend(sorted_missing)
            
            # Since we dynamically found and sequenced new ports, auto-update the DB so it remembers them!
            try:
                update_vessel_schedule(get_engine(), str(vessel_id).strip().upper(), rotation)
            except Exception:
                pass
    else:
        # Fallback to nearest-neighbor geographic sorting if DB schedule is entirely empty
        from utils.routing import sort_ports_nearest_neighbor
        ports_to_sort = current_ports.copy()
        try:
            # Try to include historical ports if available
            history_df = load_from_db("history", vessel_id=vessel_id)
            if history_df is not None and not history_df.empty and "port_of_discharge" in history_df.columns:
                hist_counts = history_df["port_of_discharge"].dropna().astype(str).str.strip().str.upper().value_counts()
                hist_ports = [p for p in hist_counts.index if p and p not in ("NAN", "NONE", "NULL", "UNKNOWNPORT")]
                for hp in hist_ports:
                    if hp not in ports_to_sort:
                        ports_to_sort.append(hp)
        except Exception:
            pass
        
        # Sort ALL discovered ports (current + historical) geographically based on real-world distance
        rotation = sort_ports_nearest_neighbor(ports_to_sort)

    rank_map = {}
    current_rank = 1
    for port in rotation:
        port_str = port.upper()
        if port_str in temp_counts.index and port_str not in rank_map:
            rank_map[port_str] = current_rank
            current_rank += 1
            
    for port in temp_counts.index:
        port_str = port.upper()
        if port_str and port_str != "UNKNOWN" and port_str not in rank_map:
            rank_map[port_str] = current_rank
            current_rank += 1

    # 1. Base Strategy Metrics
    baseline_reshuffle_rate = 0.0
    crane_metrics = _compute_crane_metrics(vessel_id, yard_id)
    if crane_metrics:
        baseline_reshuffle_rate = crane_metrics.get("reshuffleRate", 0.0)

    # 2. Recommendations
    recommendations = []
    from utils.stowage_rules import PositionAllocator
    position_allocator = PositionAllocator()
    
    for _, row in df.iterrows():
        unit_id = _safe_str(row.get("unit_id"), "UNKNOWN")
        weight_kg = row.get(w_col) if w_col else None
        length = row.get(l_col) if l_col else None
        weight_band = classify_weight_band(weight_kg, length)

        port = _safe_str(_first_existing_value(row, ["port_of_discharge"]), "")
        eq_class = _safe_str(_first_existing_value(row, ["equipment_class"]), "unknownEquipmentClass")
        
        is_loaded = row.get("is_loaded", False)
        pos_candidates = ["ctr_from_position", "current_position"] if is_loaded else ["current_position", "current_slot_position", "slot_position", "yard_position"]
        position_text = _safe_str(_first_existing_value(row, pos_candidates), "")
        current_slot_position = _safe_str(row.get("current_slot_position"), position_text or "UNKNOWN")
        
        current_yard_block = _safe_str(row.get("yard_block"), "")
        if not current_yard_block and current_slot_position != "UNKNOWN":
            parsed_pos = parse_position(current_slot_position, yard_id)
            current_yard_block = parsed_pos.get("block") if parsed_pos else "UNKNOWN"
        if not current_yard_block:
            current_yard_block = "UNKNOWN"

        # Current unassigned containers shouldn't show arbitrary old visit IDs
        actual_visit = None
        outbound_svc = vessel_id

        rec = generate_recommendation(
            unit_id=unit_id,
            weight_band=weight_band,
            discharge_port=port if port else None,
            equipment_class=eq_class,
            yard_block=current_yard_block,
            yard_slot=current_slot_position,
            port_rotation_dict=rank_map,
        )
        bay, row_str, tier_str = position_allocator.get_next_position(port if port else "UNKNOWN", rec["recommendedDeck"])
        rec["recommendedBay"] = bay
        rec["recommendedRow"] = row_str
        rec["recommendedTier"] = tier_str
        rec["actualOutboundCarrierVisitId"] = actual_visit or "UNASSIGNED"
        rec["outboundService"] = outbound_svc or vessel_id
        rec["equipmentClass"] = eq_class if eq_class != "unknownEquipmentClass" else "UNKNOWN"
        rec["weightCategory"] = weight_band
        rec["portOfDischarge"] = port if port else "UNKNOWN"
        rec["currentYardBlock"] = current_yard_block or "UNKNOWN"
        rec["currentSlotPosition"] = current_slot_position or "UNKNOWN"

        recommendations.append(rec)

    # 3. Discharge Port Grouping
    port_counts = {}
    port_ids = {}
    for rec in recommendations:
        port = rec.get("portOfDischarge") or "UNKNOWN"
        port_counts[port] = port_counts.get(port, 0) + 1
        port_ids.setdefault(port, []).append(rec["unitId"])

    discharge_port_grouping = []
    sorted_ports = sorted(port_counts.items(), key=lambda x: x[1], reverse=True)
    for port, count in sorted_ports:
        discharge_port_grouping.append({
            "port": port,
            "count": count,
            "percentage": round((count / max(resolved_count, 1)) * 100, 1),
            "containerIds": port_ids.get(port, [])
        })
    discharge_sequence = []
    # rank_map is already built at the top!
    # Just need to format it for the UI response
    sorted_ranks = sorted(rank_map.items(), key=lambda x: x[1])
    for port_str, rank in sorted_ranks:
        if port_str in [p.upper() for p in port_counts.keys()]:
            discharge_sequence.append({
                "port": port_str,
                "dischargeOrder": rank
            })

    # Sort recommendations by discharge order and attach the order directly to the recommendation
    recommendations.sort(key=lambda r: rank_map.get(str(r.get("portOfDischarge")).upper(), 999))
    
    for r in recommendations:
        port_upper = str(r.get("portOfDischarge")).upper()
        if port_upper in rank_map:
            r["dischargeOrder"] = rank_map[port_upper]
        else:
            r["dischargeOrder"] = None

    # 4. Yard Block Summary
    unique_blocks = df["yard_block"].dropna().unique().tolist()
    if "UNKNOWN" in unique_blocks:
        unique_blocks.remove("UNKNOWN")
        
    proximity_map = {}
    try:
        from services.xml_layout_service import xml_layout_service
        from config import settings
        full_layout = xml_layout_service.parse(settings.TERMINAL_XML_PATH)
        distances = xml_layout_service.compute_distances(cached=full_layout)
        
        xml_berths = list(full_layout.get("berths", {}).keys())
        xml_b = xml_berths[0] if xml_berths else None
        
        for blk in unique_blocks:
            if xml_b and blk in distances.get("block_to_berth", {}):
                dist_m = distances["block_to_berth"][blk].get(xml_b, {}).get("distance_m", 500)
                if dist_m < 400:
                    proximity_map[blk] = "CLOSE"
                elif dist_m < 1000:
                    proximity_map[blk] = "MID"
                else:
                    proximity_map[blk] = "FAR"
            else:
                proximity_map[blk] = "MID"
    except Exception as e:
        logger.warning(f"Failed to use XML distances for proximity: {e}")
        from services.heatmap_service import calculate_dynamic_proximity
        proximity_map = calculate_dynamic_proximity(df, block_col="yard_block", weight_col="weight_band")

    block_strategies = []
    
    # Calculate pod concentration score globally
    correct_count = 0
    if "yard_block" in df.columns and "port_of_discharge" in df.columns:
        block_dominant_pod = (
            df.dropna(subset=["yard_block","port_of_discharge"])
            .groupby("yard_block")["port_of_discharge"]
            .agg(lambda s: s.value_counts().index[0])
        ).to_dict()
        for _, row in df.iterrows():
            blk = row.get("yard_block")
            pod = _safe_str(row.get("port_of_discharge"), "")
            if blk and pod and block_dominant_pod.get(blk) == pod:
                correct_count += 1
    pod_concentration = round(correct_count / max(resolved_count, 1), 3)

    for blk, grp in df.groupby("yard_block", dropna=True):
        if str(blk) == "UNKNOWN":
            continue
        prox = proximity_map.get(str(blk), "MID")
        
        discharge_port_groups = []
        dominant_discharge_port = "UNKNOWN"
        if "port_of_discharge" in grp.columns:
            p_counts = grp["port_of_discharge"].dropna().value_counts()
            if not p_counts.empty:
                dominant_discharge_port = p_counts.index[0]
                for p, c in p_counts.items():
                    discharge_port_groups.append({"port": str(p), "count": int(c)})
                    
        loaded = int(grp["is_loaded"].sum()) if "is_loaded" in grp.columns else 0
        in_yard = int(grp["is_in_yard"].sum()) if "is_in_yard" in grp.columns else 0
        avg_w = round(float(grp[w_col].dropna().mean()), 1) if w_col and not grp[w_col].dropna().empty else 0.0

        risks = []
        pos_col = "current_position" if "current_position" in grp.columns else None
        if pos_col:
            for slot in grp[pos_col].dropna().head(50):
                risks.append(predict_reshuffle_risk(str(blk), str(slot), "BELOW_DECK"))
        modal_risk = max(set(risks), key=risks.count) if risks else "MEDIUM"
        
        unit_ids = grp["unit_id"].dropna().astype(str).tolist() if "unit_id" in grp.columns else []

        block_strategies.append({
            "block": str(blk),
            "terminal": terminal,
            "berthProximity": prox,
            "containerCount": int(len(grp)),
            "inYardCount": in_yard,
            "loadedCount": loaded,
            "heavyCount": int((grp["weight_band"] == "HEAVY").sum()),
            "mediumCount": int((grp["weight_band"] == "MEDIUM").sum()),
            "lightCount": int((grp["weight_band"] == "LIGHT").sum()),
            "avgWeightKg": avg_w,
            "dominantDischargePort": str(dominant_discharge_port),
            "dischargePortGroups": discharge_port_groups,
            "reshuffleRisk": modal_risk,
            "containerIds": unit_ids
        })
    block_strategies.sort(key=lambda x: x["block"])

    # 5. Discharge Port Strategy
    discharge_strategies = []
    close_blocks = [b for b, p in proximity_map.items() if p == "CLOSE"]
    mid_blocks   = [b for b, p in proximity_map.items() if p == "MID"]
    far_blocks   = [b for b, p in proximity_map.items() if p == "FAR"]
    
    ports_ranked = [p for p, _ in sorted_ports]

    for rank, port in enumerate(ports_ranked, start=1):
        grp = df[df["port_of_discharge"].astype(str) == port] if "port_of_discharge" in df.columns else pd.DataFrame()
        if grp.empty:
            continue
        
        wb_counts = grp["weight_band"].value_counts()
        dominant_wb = wb_counts.index[0] if not wb_counts.empty else "MEDIUM"
        if dominant_wb == "HEAVY":
            rec_blocks = close_blocks
        elif dominant_wb == "LIGHT":
            rec_blocks = far_blocks
        else:
            rec_blocks = mid_blocks

        if "yard_block" in grp.columns:
            in_rec = grp["yard_block"].isin(rec_blocks).sum()
            current_conc = round(in_rec / max(len(grp), 1), 3)
            current_blocks = grp["yard_block"].dropna().unique().tolist()
        else:
            current_conc = 0.0
            current_blocks = []
            
        unit_ids = grp["unit_id"].dropna().astype(str).tolist() if "unit_id" in grp.columns else []

        discharge_strategies.append({
            "port": port,
            "dischargeOrder": rank,
            "containerCount": int(len(grp)),
            "heavyCount": int((grp["weight_band"] == "HEAVY").sum()),
            "mediumCount": int((grp["weight_band"] == "MEDIUM").sum()),
            "lightCount": int((grp["weight_band"] == "LIGHT").sum()),
            "inYardCount": int(grp["is_in_yard"].sum()) if "is_in_yard" in grp.columns else 0,
            "loadedCount": int(grp["is_loaded"].sum()) if "is_loaded" in grp.columns else 0,
            "currentBlocks": current_blocks,
            "recommendedBlocks": sorted(rec_blocks),
            "concentrationScore": current_conc,
            "containerIds": unit_ids
        })

    # 6. Insights
    projected_reshuffle_reduction = round(baseline_reshuffle_rate * pod_concentration, 2)
    insights = _generate_current_planning_insights(
        block_strategies, discharge_strategies, baseline_reshuffle_rate,
        pod_concentration, projected_reshuffle_reduction, crane_metrics
    )

    reshuffleStats = {
        "baselineRate": baseline_reshuffle_rate,
        "podConcentration": pod_concentration,
        "projectedReduction": projected_reshuffle_reduction
    }

    equip_class_dist = []
    equip_col = None
    for candidate in ["equipment_class", "equipment_type"]:
        if candidate in df.columns:
            equip_col = candidate
            break

    if equip_col is not None:
        eq_series = df[equip_col].fillna("UNKNOWN").astype(str).str.strip()
        if "equipment_class" in df.columns and "equipment_type" in df.columns:
            eq_series = (
                df["equipment_class"].fillna("UNKNOWN").astype(str).str.strip()
                + " | "
                + df["equipment_type"].fillna("UNKNOWN").astype(str).str.strip()
            )

        counts = eq_series.value_counts()
        for eq_class, count in counts.head(20).items():
            equip_class_dist.append({
                "equipmentClass": eq_class,
                "count": int(count),
                "percentage": round((count / max(resolved_count, 1)) * 100, 1),
            })

    # Automatically generate the Housekeeping (Pre-Consolidation) Plan for this vessel
    housekeeping_plan = generate_pre_consolidation_plan(
        vessel_id, yard_id, container_ids, port_rotation=rotation, df=df.copy()
    )

    return {
        "vesselId": vessel_id,
        "outboundService": outbound_service or vessel_id,
        "visitId": visit_id or "UNASSIGNED",
        "terminal": terminal,
        "summary": {
            "totalRequested": int(len(cleaned_ids)),
            "resolvedCount": resolved_count,
            "unresolvedCount": unresolved_count,
        },
        "recommendations": recommendations,
        "dischargePortGrouping": discharge_port_grouping,
        "yardBlockSummary": block_strategies,
        "dischargePortStrategy": discharge_strategies,
        "reshuffleStats": reshuffleStats,
        "dischargeSequence": discharge_sequence,
        "strategyInsights": insights,
        "equipmentClassDistribution": equip_class_dist,
        "housekeepingPlan": housekeeping_plan,
    }

def _empty_history_response() -> dict:
    """
    Returns an empty dictionary structure for history analysis when no data is found.
    """
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
        "equipmentClassDistribution": [],
        "historicalVisits": [],
        "dischargeSequence": [],
        "craneMetrics": {
            "totalMoves": 0, "loadMoves": 0, "dischargeMoves": 0,
            "restowMoves": 0, "reshuffleRate": 0.0,
            "dualCycleCount": 0, "dualCycleRate": 0.0,
            "avgMoveGapMinutes": 0.0, "reshuffleByBlock": []
        },
    }

def _empty_planning_response(vessel_id: str, total_requested: int) -> dict:
    """
    Returns an empty dictionary structure for current planning when no data is found.
    """
    return {
        "vesselId": vessel_id,
        "outboundService": vessel_id,
        "visitId": "UNASSIGNED",
        "terminal": "CWIT",
        "summary": {
            "totalRequested": total_requested,
            "resolvedCount": 0,
            "unresolvedCount": total_requested,
        },
        "recommendations": [],
        "dischargePortGrouping": [],
        "yardBlockSummary": [],
        "dischargePortStrategy": [],
        "reshuffleStats": {"baselineRate": 0.0, "podConcentration": 0.0, "projectedReduction": 0.0},
        "dischargeSequence": [],
        "strategyInsights": [],
        "equipmentClassDistribution": [],
    }


# --- Pre-Consolidation / Housekeeping Engine ---

_WEIGHT_RANK = {"HEAVY": 3, "MEDIUM": 2, "LIGHT": 1}


def generate_pre_consolidation_plan(
    vessel_id: str,
    yard_id,
    container_ids,
    port_rotation=None,
    df: pd.DataFrame = None,
) -> dict:
    """
    Analyses current yard stacks for two types of violations:
      1. Weight Inversion  - a heavier container sits on top of a lighter one.
      2. Discharge Inversion - a container bound for a later port sits on top
         of one bound for an earlier port (LIFO violation).
    Returns a prioritised list of housekeeping moves to correct the yard.
    """
    if df is None:
        if not container_ids:
            return _empty_pre_consolidation(vessel_id, yard_id)

        cleaned_ids = [str(x).strip() for x in container_ids if str(x).strip()]
        
        if cleaned_ids:
            df = lookup_containers_by_ids(cleaned_ids, yard_id)
        else:
            # Fallback to fetching all containers for this vessel
            df = load_from_db("current", yard_id=yard_id, vessel_id=vessel_id)
            if df.empty:
                df = load_from_db("history", yard_id=yard_id, vessel_id=vessel_id)
                
            if not df.empty:
                v_id_upper = str(vessel_id).strip().upper()
                mask = pd.Series([False] * len(df), index=df.index)
                if "outbound_service" in df.columns:
                    mask |= (df["outbound_service"].astype(str).str.strip().str.upper() == v_id_upper)
                if "actual_outbound_carrier_visit_id" in df.columns:
                    mask |= (df["actual_outbound_carrier_visit_id"].astype(str).str.strip().str.upper() == v_id_upper)
                df = df[mask].copy()

    if df is None or df.empty:
        return _empty_pre_consolidation(vessel_id, yard_id)

    df = _normalize_dataframe_columns(df)
    df = _dedupe_latest_per_unit(df)
    if df.empty:
        return _empty_pre_consolidation(vessel_id, yard_id)

    # Resolve port rotation
    rotation = list(port_rotation) if port_rotation else []
    if not rotation:
        try:
            db_schedule = get_vessel_schedule(get_engine(), str(vessel_id).strip().upper())
            if db_schedule:
                rotation = db_schedule
        except Exception:
            pass
    if not rotation:
        temp_counts = (
            df["port_of_discharge"].dropna().astype(str).str.strip().str.upper().value_counts()
            if "port_of_discharge" in df.columns else {}
        )
        current_ports = [
            p for p in (temp_counts.index if hasattr(temp_counts, "index") else [])
            if p and p not in ("NAN", "NONE", "NULL", "UNKNOWNPORT")
        ]
        try:
            from utils.routing import sort_ports_nearest_neighbor
            rotation = sort_ports_nearest_neighbor(current_ports)
        except Exception:
            rotation = current_ports

    rank_map = {}
    for rank, port in enumerate(rotation, start=1):
        key = str(port).strip().upper()
        if key and key not in rank_map:
            rank_map[key] = rank

    # Parse yard positions
    w_col = next(
        (c for c in ["unit_weight_in_kg", "verified_gross_mass_kg", "gross_mass_kg"] if c in df.columns),
        None,
    )
    l_col = next((c for c in ["container_length", "equipment_length"] if c in df.columns), None)

    def _get_pos_and_meta(row):
        pos_raw = _safe_str(row.get("current_position") or row.get("ctr_from_position") or "")
        parsed = parse_position(pos_raw, yard_id) if pos_raw else None
        if not (parsed and parsed.get("is_yard")):
            return None
        weight_kg = row.get(w_col) if w_col else None
        length = str(row.get(l_col, "")) if l_col else None
        wb = classify_weight_band(weight_kg, length)
        pod = _safe_str(row.get("port_of_discharge") or "")
        pod_upper = pod.upper() if pod else None
        discharge_rank = rank_map.get(pod_upper, 999) if pod_upper else 999
        return {
            "unit_id": _safe_str(row.get("unit_id"), "UNKNOWN"),
            "from_position": pos_raw,
            "block": parsed.get("block", ""),
            "bay": parsed.get("bay", "0"),
            "row": parsed.get("row", "0"),
            "tier": parsed.get("tier", "0"),
            "weight_band": wb,
            "weight_rank": _WEIGHT_RANK.get(wb, 2),
            "port_of_discharge": pod_upper,
            "discharge_rank": discharge_rank,
        }

    records = []
    for _, row in df.iterrows():
        meta = _get_pos_and_meta(row)
        if meta:
            records.append(meta)

    if not records:
        return _empty_pre_consolidation(vessel_id, yard_id)

    # Group by stack: (block, bay, row)
    stacks = {}
    for rec in records:
        key = (rec["block"], rec["bay"], rec["row"])
        stacks.setdefault(key, []).append(rec)

    def _tier_sort_key(r):
        try:
            return int(r["tier"])
        except (ValueError, TypeError):
            return 0

    for key in stacks:
        stacks[key].sort(key=_tier_sort_key)

    # Detect violations
    moves = []
    stack_violations = []

    WEIGHT_PRIORITY_SCORE = 80
    DISCHARGE_PRIORITY_SCORE = 60
    COMBINED_PRIORITY_SCORE = 95

    for (block, bay, row), containers in stacks.items():
        w_inversions = 0
        d_inversions = 0

        for i in range(1, len(containers)):
            upper = containers[i]
            lower = containers[i - 1]
            is_weight_inv = upper["weight_rank"] > lower["weight_rank"]
            is_discharge_inv = upper["discharge_rank"] < lower["discharge_rank"]
            if not is_weight_inv and not is_discharge_inv:
                continue

            reasons = []
            score = 0

            if is_weight_inv and is_discharge_inv:
                reasons.append(
                    "Combined violation - " + upper["weight_band"] + " container is above "
                    + lower["weight_band"] + " (weight) and discharges at port rank "
                    + str(upper["discharge_rank"]) + " before rank " + str(lower["discharge_rank"]) + " (discharge)."
                )
                score = COMBINED_PRIORITY_SCORE
                w_inversions += 1
                d_inversions += 1
            elif is_weight_inv:
                reasons.append(
                    "Weight Inversion - " + upper["weight_band"] + " container is stacked "
                    "above a " + lower["weight_band"] + " container in tier " + str(lower["tier"]) + "."
                )
                score = WEIGHT_PRIORITY_SCORE
                w_inversions += 1
            else:
                upper_pod = upper["port_of_discharge"] or "UNKNOWN"
                lower_pod = lower["port_of_discharge"] or "UNKNOWN"
                reasons.append(
                    "Discharge Inversion - container for " + upper_pod
                    + " (rank " + str(upper["discharge_rank"]) + ") is above "
                    + lower_pod + " (rank " + str(lower["discharge_rank"]) + ")."
                )
                score = DISCHARGE_PRIORITY_SCORE
                d_inversions += 1

            priority = "HIGH" if score >= 80 else ("MEDIUM" if score >= 50 else "LOW")
            moves.append({
                "unitId": upper["unit_id"],
                "fromPosition": upper["from_position"],
                "block": block,
                "bay": bay,
                "row": row,
                "tier": upper["tier"],
                "weightBand": upper["weight_band"],
                "portOfDischarge": upper["port_of_discharge"],
                "dischargeOrder": upper["discharge_rank"] if upper["discharge_rank"] != 999 else None,
                "reason": " ".join(reasons),
                "priority": priority,
                "priorityScore": score,
            })

        if w_inversions > 0 or d_inversions > 0:
            stack_violations.append({
                "block": block,
                "bay": bay,
                "row": row,
                "totalContainers": len(containers),
                "weightInversions": w_inversions,
                "dischargeInversions": d_inversions,
                "combinedViolations": min(w_inversions, d_inversions),
            })

    moves.sort(key=lambda m: m["priorityScore"], reverse=True)

    high = sum(1 for m in moves if m["priority"] == "HIGH")
    med  = sum(1 for m in moves if m["priority"] == "MEDIUM")
    low  = sum(1 for m in moves if m["priority"] == "LOW")

    return {
        "vesselId": vessel_id,
        "yardId": yard_id,
        "summary": {
            "totalContainersAnalyzed": len(records),
            "totalStacksAnalyzed": len(stacks),
            "totalMovesRequired": len(moves),
            "highPriorityMoves": high,
            "mediumPriorityMoves": med,
            "lowPriorityMoves": low,
            "weightInversionsFound": sum(sv["weightInversions"] for sv in stack_violations),
            "dischargeInversionsFound": sum(sv["dischargeInversions"] for sv in stack_violations),
        },
        "moves": moves,
        "stackViolations": stack_violations,
    }


def _empty_pre_consolidation(vessel_id: str, yard_id) -> dict:
    return {
        "vesselId": vessel_id,
        "yardId": yard_id,
        "summary": {
            "totalContainersAnalyzed": 0,
            "totalStacksAnalyzed": 0,
            "totalMovesRequired": 0,
            "highPriorityMoves": 0,
            "mediumPriorityMoves": 0,
            "lowPriorityMoves": 0,
            "weightInversionsFound": 0,
            "dischargeInversionsFound": 0,
        },
        "moves": [],
        "stackViolations": [],
    }
