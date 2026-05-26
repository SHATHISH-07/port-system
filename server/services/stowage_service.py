from db.queries import get_vessel_schedule
from db.queries import update_vessel_schedule
import pandas as pd
from typing import Any, List, Optional
from db.queries import load_from_db
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_decoder import parse_vessel_slot
from utils.position_parser import parse_position
from utils.stowage_rules import generate_recommendation, classify_weight_band, classify_deck_position, predict_reshuffle_risk
from services.heatmap_service import _deterministic_layout
from db.connection import get_engine


_CWIT_PROXIMITY = {
    "1A": "CLOSE", "1C": "CLOSE",
    "2B": "MID",   "2C": "MID",
    "3D": "MID",
    "4D": "FAR",   "5D": "FAR",
}
_PEB_PROXIMITY = {
    "A": "CLOSE",
    "C": "MID",   "D": "MID",
    "F": "FAR",   "G": "FAR",  "H": "FAR",
}

def _normalize_column_name(name: str) -> str:
    """
    Executes _normalize_column_name logic and processing.
    """
    import re
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return re.sub(r"_+", "_", name).strip("_")

def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Executes _normalize_dataframe_columns logic and processing.
    """
    if df.empty:
        return df
    df = df.copy()
    df.columns = [_normalize_column_name(c) for c in df.columns]
    return df

def _first_existing_value(row: pd.Series, candidates: List[str]) -> Any:
    """
    Executes _first_existing_value logic and processing.
    """
    for col in candidates:
        if col in row and pd.notna(row.get(col)) and str(row.get(col)).strip() != "":
            return row.get(col)
    return None

def _safe_str(value: Any, default: str = "") -> str:
    """
    Executes _safe_str logic and processing.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return default
    return text

def _dedupe_latest_per_unit(df: pd.DataFrame) -> pd.DataFrame:
    """
    Executes _dedupe_latest_per_unit logic and processing.
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
    Executes _derive_recommended_tier logic and processing.
    """
    band = str(weight_band).strip().upper()
    if band == "HEAVY":
        return "02"
    if band == "LIGHT":
        return "08" if loading_priority <= 7 else "10"
    return "04" if loading_priority <= 5 else "06"

def _determine_historical_deck(position_text: str, weight_band: str) -> str:
    """
    Executes _determine_historical_deck logic and processing.
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
    Executes _compute_crane_metrics logic and processing.
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
        lambda p: parse_position(p).get("block") if parse_position(p) and parse_position(p).get("is_yard") else None
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
    Executes get_historical_stowage_analysis logic and processing.
    """
    df = load_from_db("history", vessel_id=vessel_id, yard_id=yard_id, full_load=True)
    if df is None or df.empty:
        return _empty_history_response()

    df = _normalize_dataframe_columns(df)

    if "record_type" in df.columns:
        df = df[df["record_type"].astype(str).str.lower() == "history"].copy()

    if "visit_state" in df.columns:
        df = df[df["visit_state"].notna()].copy()

    if df.empty:
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
        df = df[df["actual_outbound_carrier_visit_id"].astype(str) == str(visit_id)].copy()

    if df.empty:
        return _empty_history_response()

    # When querying all history, dedupe by unit_id AND visit_id so containers that visited multiple times are counted for each visit.
    if visit_id:
        unique_df = _dedupe_latest_per_unit(df)
    else:
        if "actual_outbound_carrier_visit_id" in df.columns:
            # Sort to keep latest event per visit for each unit
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
        return _empty_history_response()

    def _resolve_attributes(row: pd.Series) -> pd.Series:
        """
        Executes _resolve_attributes logic and processing.
        """
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
        "craneMetrics": crane_metrics,
    }

def _generate_current_planning_insights(block_strategies, pod_groups, baseline_reshuffle, pod_conc, proj_reduction, crane_metrics=None) -> list[str]:
    """
    Executes _generate_current_planning_insights logic and processing.
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
    Executes process_current_planning_and_yard_strategy logic and processing.
    """
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
    terminal = "PEB" if (yard_id and "PEB" in str(yard_id).upper()) else "CWIT"

    # Assign yard_block, weight_band, is_loaded
    def resolve_yard_block(row):
        """
        Executes resolve_yard_block logic and processing.
        """
        visit_state = _safe_str(row.get("visit_state"), "")
        category = _safe_str(row.get("category_id"), "")
        is_loaded = visit_state == "3DEPARTED" or category == "EXPRT"
        pos = _safe_str(row.get("ctr_from_position") if is_loaded else row.get("current_position"), "")
        info = parse_position(pos)
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

        # Fallback to historical guessing if DB schedule is empty
        if not rotation:
            try:
                history_df = load_from_db("history", vessel_id=vessel_id)
                if history_df is not None and not history_df.empty and "port_of_discharge" in history_df.columns:
                    hist_counts = history_df["port_of_discharge"].dropna().astype(str).str.strip().str.upper().value_counts()
                    rotation = [p for p in hist_counts.index if p and p not in ("NAN", "NONE", "NULL", "UNKNOWNPORT")]
            except Exception:
                rotation = [p for p in temp_counts.index if p and p not in ("NAN", "NONE", "NULL", "UNKNOWNPORT")]

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
            parsed_pos = parse_position(current_slot_position)
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
        rec["actualOutboundCarrierVisitId"] = actual_visit
        rec["outboundService"] = outbound_svc
        rec["equipmentClass"] = eq_class
        rec["weightCategory"] = weight_band
        rec["portOfDischarge"] = port if port else None
        rec["currentYardBlock"] = current_yard_block
        rec["currentSlotPosition"] = current_slot_position

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
        
    rotation_msg = "Discharge sequence built using Master Vessel Schedule and historical fallbacks." if not port_rotation else "Discharge sequence manually overridden by user."
    
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
    if unique_blocks:
        # Fallback local calculation
        block_scores = {}
        for blk, grp in df[df["yard_block"] != "UNKNOWN"].groupby("yard_block"):
            count = len(grp)
            heavy = (grp["weight_band"] == "HEAVY").sum()
            block_scores[blk] = count + (heavy * 2)
            
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
        if str(blk) == "UNKNOWN": continue
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
        if grp.empty: continue
        
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
    if rotation_msg:
        insights.append(rotation_msg)

    reshuffleStats = {
        "baselineRate": baseline_reshuffle_rate,
        "podConcentration": pod_concentration,
        "projectedReduction": projected_reshuffle_reduction
    }

    return {
        "vesselId": vessel_id,
        "outboundService": outbound_service or vessel_id,
        "visitId": visit_id,
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
    }


def _empty_history_response() -> dict:
    """
    Executes _empty_history_response logic and processing.
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
    }

def _empty_planning_response(vessel_id: str, total_requested: int) -> dict:
    """
    Executes _empty_planning_response logic and processing.
    """
    return {
        "vesselId": vessel_id,
        "outboundService": vessel_id,
        "visitId": None,
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
        "reshuffleStats": {},
        "dischargeSequence": [],
        "strategyInsights": [],
    }
