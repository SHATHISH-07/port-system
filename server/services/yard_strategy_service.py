from services.yard_preparation_service import generate_pre_consolidation_plan
from auth.utils import logger
from db.queries import get_vessel_schedule, update_vessel_schedule, load_from_db
import pandas as pd
from typing import List, Optional
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_parser import parse_position
from utils.stowage_rules import generate_recommendation, classify_weight_band, predict_reshuffle_risk
from services.heatmap_service import calculate_dynamic_proximity
from db.connection import get_engine
from services.stowage_helpers import _normalize_dataframe_columns, _first_existing_value, _safe_str, _dedupe_latest_per_unit, _empty_planning_response
from services.stowage_history_service import _compute_crane_metrics
from utils.stowage_rules import PositionAllocator
from utils.routing import sort_ports_nearest_neighbor
from services.xml_layout_service import xml_layout_service
from config import settings

def _generate_current_planning_insights(block_strategies, pod_groups, baseline_reshuffle, pod_conc, proj_reduction, crane_metrics=None) -> list[str]:
    """
    Generates strategic textual insights about the current yard block groupings and vessel planning.
    """
    insights = []
    
    close_blocks = [b["block"] for b in block_strategies if b["berthProximity"] == "CLOSE"]
    heavy_in_close = sum(b["heavyCount"] for b in block_strategies if b["berthProximity"] == "CLOSE")
    if close_blocks:
        insights.append(
            f"Yard Strategy: Heavy containers positioned close to berth. Detected {heavy_in_close} HEAVY units assigned to berth-close blocks ({', '.join(close_blocks)})."
        )

    light_count = sum(b.get("lightCount", 0) for b in block_strategies)
    if light_count > 0:
        insights.append(f"Yard Strategy: {light_count} LIGHT containers prioritized for upper stack loading.")

    num_ports = len(pod_groups)
    if num_ports > 0:
        insights.append(f"Yard Strategy: Containers grouped by discharge sequence into {num_ports} sequential zones to streamline crane operations.")
    insights.append(
        f"Yard Strategy: Reduce reshuffle requirement. Current POD grouping concentration is {pod_conc*100:.1f}%."
    )
    if baseline_reshuffle > 0:
        insights.append(
            f"Expected Result: Lower reshuffle % (projected {proj_reduction:.1f}% reduction from {baseline_reshuffle:.1f}% baseline)."
        )
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
        if df is not None and not df.empty:
            outbound_col = "outbound_service" if "outbound_service" in df.columns else "actual_outbound_carrier_visit_id"
            if outbound_col in df.columns and "inbound_service" in df.columns:
                df["_outbound_clean"] = df[outbound_col].astype(str).str.strip().replace(["nan", "None", "NaN", ""], pd.NA)
                df["_inbound_clean"] = df["inbound_service"].astype(str).str.strip().replace(["nan", "None", "NaN", ""], pd.NA)
                
                f_str = df.get("ctr_from_position", pd.Series(dtype=str)).fillna("").astype(str).str.upper()
                t_str = df.get("ctr_to_position", pd.Series(dtype=str)).fillna("").astype(str).str.upper()
                
                valid_mask = (
                    df["_outbound_clean"].isna() &
                    df["_inbound_clean"].notna() &
                    f_str.str.startswith("V-") &
                    t_str.str.startswith("Y-")
                )
                df = df[valid_mask].copy()
    else:
        # Fallback to fetching all containers for this vessel
        df = load_from_db("current", yard_id=yard_id, vessel_id=vessel_id)
        if df.empty:
            df = load_from_db("history", yard_id=yard_id, vessel_id=vessel_id)
        
    if df is not None and not df.empty and not cleaned_ids:
        # Only filter by vessel_id if we are doing a general lookup for the vessel.
        # If the user explicitly provided container_ids, we trust they belong to the plan.
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
        pos = _safe_str(row.get("ctr_to_position"), "")
        if not pos:
            pos = _safe_str(row.get("current_position") or "", "")
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
    
    position_allocator = PositionAllocator()
    
    for _, row in df.iterrows():
        unit_id = _safe_str(row.get("unit_id"), "UNKNOWN")
        weight_kg = row.get(w_col) if w_col else None
        length = row.get(l_col) if l_col else None
        weight_band = classify_weight_band(weight_kg, length)

        port = _safe_str(_first_existing_value(row, ["port_of_discharge"]), "")
        eq_class = _safe_str(_first_existing_value(row, ["equipment_class"]), "unknownEquipmentClass")
        
        # Strict fallback prioritizing ctr_to_position
        pos_candidates = ["ctr_to_position", "current_position", "current_slot_position", "slot_position", "yard_position"]
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

