from __future__ import annotations
from models.stay_model import predict_stay_duration_from_metrics
import logging
import pandas as pd
from models.stay_model import predict_vessel_stay_duration
from utils.feature_utils import create_features
from utils.stay_utils import compute_vessel_stay, prepare_visit_data
from config import settings as _settings
from models.stay_model import _compute_raw_visit_stay as _raw_stay

logger = logging.getLogger("port_system")

# Helpers
from services.crane_analytics_service import _fetch_crane_counts_batch
from services.vessel_operations import _visit_details
from services.historical_delay_service import _calculate_delay_analysis

def analyze_vessel_dashboard(
    df: pd.DataFrame,
    vessel_service: str,
    loaded_override: int = None,
    discharged_override: int = None,
    crane_count_override: int = None,
    equipment_breakdown_override: dict = None,
    history_df: pd.DataFrame = None,
    optional_unit_ids: list[str] = None,
) -> dict:
    """
    Analyzes vessel data to predict stay durations, identify bottlenecks, and synthesize operational dashboards.
    """
    if df is None or df.empty:
        return {
            "error": "No data available",
            "vessel": vessel_service,
            "vessel_service": vessel_service,
            "mode": "vessel",
            "actual": {"visits": {}, "avg_hours": 0.0, "max_hours": 0.0, "min_hours": 0.0, "avg_restows": 0.0},
            "predicted": None,
            "delay_analysis": [],
            "suggestions": []
        }

    search_key = str(vessel_service).strip().upper()

    # ── Unit ID filtering (What-If workloads) ──────────────────────────────
    if optional_unit_ids:
        vessel_df = df[df["unit_id"].isin(optional_unit_ids)].copy()
        if (
            "actual_outbound_carrier_visit_id" not in vessel_df.columns
            or vessel_df["actual_outbound_carrier_visit_id"].isna().all()
        ):
            vessel_df["actual_outbound_carrier_visit_id"] = vessel_service
    else:
        vessel_df = pd.DataFrame()
        if "outbound_service" in df.columns:
            vessel_df = df[
                df["outbound_service"].astype(str).str.strip().str.upper() == search_key
            ].copy()

        if vessel_df.empty and "actual_outbound_carrier_visit_id" in df.columns:
            vessel_df = df[
                df["actual_outbound_carrier_visit_id"]
                .astype(str).str.strip().str.upper() == search_key
            ].copy()

    if vessel_df.empty:
        suggestions: list[str] = []
        if "outbound_service" in df.columns:
            all_svcs = df["outbound_service"].dropna().unique().tolist()
            prefix = search_key[:2]
            prefix_matches = sorted(
                [s for s in all_svcs if str(s).upper().startswith(prefix)]
            )[:5]
            suggestions = prefix_matches or sorted([str(s) for s in all_svcs])[:5]
        hint = f" Available similar services: {', '.join(suggestions)}." if suggestions else ""
        return {
            "error": f"No data found for vessel '{vessel_service}'.{hint}",
            "vessel": vessel_service,
            "vessel_service": vessel_service,
            "mode": "vessel",
            "actual": {"visits": {}, "avg_hours": 0.0, "max_hours": 0.0, "min_hours": 0.0, "avg_restows": 0.0},
            "predicted": None,
            "delay_analysis": [],
            "suggestions": suggestions,
        }

    if "actual_outbound_carrier_visit_id" not in vessel_df.columns:
        vessel_df["actual_outbound_carrier_visit_id"] = vessel_service

    # ── Prepare visits ───────────────────────────────────────────────────────
    # visit_groups:    raw DataFrames — used for prediction (unwindowed, full span)
    # prepared_visits: windowed DataFrames — used only for actual stay computation
    visit_groups: dict = {}
    prepared_visits: dict = {}

    for visit_id, group in vessel_df.groupby("actual_outbound_carrier_visit_id"):
        grp = group.copy()
        visit_groups[visit_id] = grp
        prepared_visits[visit_id] = prepare_visit_data(grp)

    # ── Compute actual stay ────────────────────────────────────────────────
    actual_raw = compute_vessel_stay(prepared_visits)

    # A visit has history data when time-based stay can be computed directly.
    is_current_mode = not bool(actual_raw.get("visits"))

    # ── Fetch crane counts from DB for all visits (BATCHED) ──────────────────
    visit_ids = [str(vid) for vid in visit_groups.keys()]
    visit_crane_counts = _fetch_crane_counts_batch(visit_ids)

    # ── Historical baseline for feature template ───────────────────────────
    feature_template: dict = {}
    historical_mph_avg = 0.0
    historical_features_list: list = []

    baseline_vessel = pd.DataFrame()
    if history_df is not None and not history_df.empty:
        baseline_vessel = history_df.copy()
    elif actual_raw.get("visits"):
        baseline_vessel = df.copy()

    if not baseline_vessel.empty and "outbound_service" in baseline_vessel.columns:
        # Relax filter: keep if outbound_service matches OR if it is null/empty 
        # (since load_from_db already filters by vessel_id)
        os_col = baseline_vessel["outbound_service"].astype(str).str.strip().str.upper()
        baseline_vessel = baseline_vessel[
            (os_col == search_key) | (os_col == "NAN") | (os_col == "NONE") | (os_col == "")
        ].copy()

    baseline_prepared: dict = {}
    if not baseline_vessel.empty:
        for vid, grp in baseline_vessel.groupby("actual_outbound_carrier_visit_id"):
            # Use windowed prep so move_span_hours accurately reflects vessel operation time, not yard dwell time
            baseline_prepared[vid] = prepare_visit_data(grp.copy())

    if baseline_prepared:
        historical_features_list = []
        for vid, vdf in baseline_prepared.items():
            f = create_features(vdf)
            if f:
                # Override move_span_hours with actual computed stay when available
                real_stay = actual_raw.get("visits", {}).get(str(vid))
                if real_stay and real_stay > 0:
                    f["move_span_hours"] = float(real_stay)
                else:
                    raw_stay = _raw_stay(vdf)
                    if raw_stay and raw_stay > 0:
                        f["move_span_hours"] = raw_stay
                historical_features_list.append(f)

        if historical_features_list:
            for k in _settings.FEATURE_NAMES:
                vals = [f[k] for f in historical_features_list if k in f]
                if vals:
                    feature_template[k] = sum(vals) / len(vals)

            # historical_mph_avg: moves per hour across the full operational span
            mph_rates = []
            
            # Estimate missing crane counts
            valid_cranes = [v for v in visit_crane_counts.values() if v > 0]
            if valid_cranes:
                avg_hist_cranes = sum(valid_cranes) / len(valid_cranes)
            else:
                # Estimate crane count from historical throughput:
                # total_vessel_mph = total_moves / total_stay_hours
                # cranes ≈ total_vessel_mph / typical_per_crane_mph
                # Industry standard per-crane rate is ~10 MPH
                PER_CRANE_MPH_ESTIMATE = 10.0
                total_m = 0
                total_s = 0
                for vid in baseline_prepared.keys():
                    v_stay = actual_raw.get("visits", {}).get(str(vid), 0)
                    v_moves = len(baseline_prepared[vid])
                    if v_stay > 0 and v_moves > 0:
                        total_m += v_moves
                        total_s += v_stay
                if total_s > 0:
                    total_vessel_mph = total_m / total_s
                    avg_hist_cranes = max(1.0, round(total_vessel_mph / PER_CRANE_MPH_ESTIMATE))
                else:
                    avg_hist_cranes = 1.0

            mph_rates = []
            total_m_weight = 0.0
            for f in historical_features_list:
                span = f.get("move_span_hours", 0)
                moves = f.get("total_moves", 0)
                if span > 0 and moves > 0:
                    rate = (moves / span) / avg_hist_cranes
                    mph_rates.append(rate * moves)
                    total_m_weight += moves
            if mph_rates and total_m_weight > 0:
                historical_mph_avg = sum(mph_rates) / total_m_weight
            elif mph_rates:
                historical_mph_avg = sum(mph_rates) / len(mph_rates)
            else:
                historical_mph_avg = 0.0

    baseline_avg_hours = None
    baseline_actual_raw = {}
    if baseline_prepared:
        baseline_actual_raw = compute_vessel_stay(baseline_prepared)
        baseline_avg_hours = baseline_actual_raw.get("avg_hours")

    # ── Synthesise stay for current mode when no actual stay is available ────
    if not actual_raw:
        if is_current_mode:
            try:
                predicted_init = predict_vessel_stay_duration(
                    visit_groups,  # raw, unwindowed
                    mph_override=historical_mph_avg or None,
                    feature_template=feature_template,
                    crane_counts=visit_crane_counts,
                    historical_avg_stay_hours=baseline_avg_hours,
                )
                if isinstance(predicted_init, dict) and predicted_init:
                    vals = list(predicted_init.values())
                    pred_avg = sum(vals) / len(vals)
                else:
                    pred_avg = None
            except Exception as e:
                logger.error("Failed to predict init: %s", e)
                pred_avg = None

            synthetic_visits: dict = {}
            for vid, vdf in visit_groups.items():
                if vdf is None or vdf.empty:
                    continue
                n_units = len(vdf)
                synthetic_stay = pred_avg if pred_avg else max(8.0, n_units / 25.0)
                synthetic_visits[str(vid)] = synthetic_stay

            if not synthetic_visits:
                return {"error": "No valid visit data found", "vessel": vessel_service}

            vals = list(synthetic_visits.values())
            total_syn_hours = 0.0
            total_syn_weight = 0
            for vid, vdf in visit_groups.items():
                if str(vid) in synthetic_visits:
                    total_syn_hours += synthetic_visits[str(vid)] * len(vdf)
                    total_syn_weight += len(vdf)
            
            avg_hours = round(total_syn_hours / total_syn_weight, 2) if total_syn_weight > 0 else round(sum(vals) / len(vals), 2)
            
            actual_raw = {
                "visits": synthetic_visits,
                "avg_hours": avg_hours,
                "max_hours": round(max(vals), 2),
                "min_hours": round(min(vals), 2),
            }
        else:
            return {"error": "No valid visit data found", "vessel": vessel_service}

    # ── Predict stay duration ────────────────────────────────────────────────
    predicted = None
    try:
        if loaded_override is not None or discharged_override is not None or crane_count_override is not None or equipment_breakdown_override:
            total_loaded = loaded_override if loaded_override is not None else 0
            total_discharged = discharged_override if discharged_override is not None else 0

            total_moves = total_loaded + total_discharged
            estimated_cranes = 1
            if crane_count_override is not None and crane_count_override > 0:
                estimated_cranes = crane_count_override
            elif historical_mph_avg and historical_mph_avg > 0 and actual_raw.get("avg_hours") and actual_raw.get("avg_hours") > 0:
                total_mph = total_moves / actual_raw.get("avg_hours")
                estimated_cranes = max(1, int(round(total_mph / historical_mph_avg)))
            else:
                avg_crane_count = (
                    round(sum(visit_crane_counts.values()) / len(visit_crane_counts))
                    if visit_crane_counts else 0
                )
                estimated_cranes = max(avg_crane_count, 1)
                
            # If the user provides a crane count override, do not cap it at 3 (allow what-if scenarios)
            if crane_count_override is None:
                estimated_cranes = min(3, estimated_cranes) # Cap at physical berth limit
            
            p_res = predict_stay_duration_from_metrics(
                total_loaded,
                total_discharged,
                crane_count=estimated_cranes,
                historical_mph_avg=historical_mph_avg,
                # Do NOT pass historical_avg_stay_hours here! 
                # What-if analysis means we want the physics heuristic to recalculate move_span_hours
                historical_avg_stay_hours=None,
                equipment_breakdown=equipment_breakdown_override,
            )
            p_stay = p_res.get("predicted", {}).get("avg_hours") if isinstance(p_res, dict) else p_res
            predicted = {"avg_hours": p_stay, "visits": 1, "source": "metric_override", "assigned_cranes": estimated_cranes}
    except Exception:
        predicted = None

    # ── Build merged visit details ───────────────────────────────────────────
    visit_details = _visit_details(visit_groups)
    
    # ── FIX: Merging Historical Baseline into Display Payload ────────────────
    if baseline_prepared:
        baseline_visit_details = _visit_details(baseline_prepared)
        if "visits" not in actual_raw:
            actual_raw["visits"] = {}
        for vid in baseline_prepared.keys():
            vid_str = str(vid)
            if vid_str not in actual_raw["visits"]:
                actual_raw["visits"][vid_str] = baseline_actual_raw.get("visits", {}).get(vid_str, 0.0)
            if vid_str not in visit_details:
                visit_details[vid_str] = baseline_visit_details.get(vid_str, {})

    merged_visits: dict = {}

    for vid, stay in actual_raw.get("visits", {}).items():
        details = visit_details.get(str(vid), {})
        detail_stay = details.get("stay_hours", 0.0)
        final_stay = detail_stay if detail_stay > 0 else round(stay, 2)

        merged_visits[str(vid)] = {
            "stay_hours":             final_stay,
            "start_time":             details.get("start_time"),
            "end_time":               details.get("end_time"),
            "loaded_containers":      details.get("loaded_containers", 0),
            "discharged_containers":  details.get("discharged_containers", 0),
            "move_start":             details.get("move_start"),
            "move_end":               details.get("move_end"),
            "restow_count":           details.get("restow_count", 0),
            "avg_weight_kg":          details.get("avg_weight_kg", 0),
            "port_of_discharge_top5": details.get("port_of_discharge_top5", []),
            "assigned_cranes":        details.get("assigned_cranes", 0),
            "cranes_assigned":        details.get("cranes_assigned", []),
            "crane_mph":              details.get("crane_mph", 0.0),
            "crane_mpm":              round(60.0 / details.get("crane_mph"), 1) if details.get("crane_mph") > 0 else 0.0,
        }

    merged_stays = [v["stay_hours"] for v in merged_visits.values() if v.get("stay_hours", 0) > 0]
    merged_avg_hours = 0.0
    if merged_stays:
        total_hours = 0.0
        total_weight = 0
        for v in merged_visits.values():
            stay = v.get("stay_hours", 0)
            if stay > 0:
                weight = max(v.get("loaded_containers", 0) + v.get("discharged_containers", 0), 1)
                total_hours += stay * weight
                total_weight += weight
        merged_avg_hours = round(total_hours / total_weight, 2) if total_weight > 0 else 0.0

    # ── FIX: Extract correct crane counts from merged_visits ─────────────────
    # _fetch_crane_counts_batch may return 0 due to visit ID format mismatch,
    # but _visit_details (via _fetch_crane_stats_batch) correctly gets crane data.
    # Use the merged_visits data as the source of truth for crane counts.
    merged_crane_counts = {}
    for vid, v in merged_visits.items():
        cranes = v.get("assigned_cranes", 0)
        if cranes > 0:
            merged_crane_counts[vid] = cranes
    
    # If merged_visits has better crane data than _fetch_crane_counts_batch, use it
    if merged_crane_counts and not any(v > 0 for v in visit_crane_counts.values()):
        visit_crane_counts = merged_crane_counts
        # Recalculate historical_mph_avg with correct crane count
        valid_cranes = list(merged_crane_counts.values())
        avg_hist_cranes = sum(valid_cranes) / len(valid_cranes) if valid_cranes else 1.0
        if historical_features_list:
            mph_rates = []
            total_m_weight = 0.0
            for f in historical_features_list:
                span = f.get("move_span_hours", 0)
                moves = f.get("total_moves", 0)
                if span > 0 and moves > 0:
                    rate = (moves / span) / avg_hist_cranes
                    mph_rates.append(rate * moves)
                    total_m_weight += moves
            if mph_rates and total_m_weight > 0:
                historical_mph_avg = sum(mph_rates) / total_m_weight

    # ── Run baseline prediction if not already done (override path) ──────────
    if predicted is None and not (loaded_override is not None or discharged_override is not None or crane_count_override is not None or equipment_breakdown_override):
        try:
            predicted = predict_vessel_stay_duration(
                prepared_visits,
                mph_override=historical_mph_avg or None,
                feature_template=feature_template,
                crane_counts=visit_crane_counts,
                historical_avg_stay_hours=baseline_avg_hours or merged_avg_hours or None,
            )
        except Exception:
            predicted = None

    merged_restows = [v.get("restow_count", 0) for v in merged_visits.values()]
    merged_avg_restows = round(sum(merged_restows) / len(merged_restows), 1) if merged_restows else 0.0

    # ── Container Classification Breakdown ───────────────────────────────────
    container_classification = {
        "total": 0,
        "heavy": 0,
        "reefer": 0,
        "hazard": 0,
        "oog": 0,
        "ft40": 0,
        "ft20": 0,
    }
    
    all_visit_groups = {**visit_groups}
    if baseline_prepared:
        all_visit_groups.update(baseline_prepared)

    for vid, vdf in all_visit_groups.items():
        if vdf is None or vdf.empty:
            continue
            
        units = vdf.drop_duplicates(subset=["unit_id"]) if "unit_id" in vdf.columns else vdf
        container_classification["total"] += len(units)
        
        if "unit_weight_in_kg" in units.columns:
            w_col = pd.to_numeric(units["unit_weight_in_kg"], errors='coerce').fillna(0)
            container_classification["heavy"] += int((w_col > 25000).sum())
            
        if "reefer" in units.columns:
            container_classification["reefer"] += int((units["reefer"].fillna("").astype(str).str.upper().isin(["Y", "YES", "TRUE", "1"])).sum())
            
        if "hazardous_flag" in units.columns:
            container_classification["hazard"] += int((units["hazardous_flag"].fillna("").astype(str).str.upper().isin(["Y", "YES", "TRUE", "1"])).sum())
            
        if "oog_unit" in units.columns:
            container_classification["oog"] += int((units["oog_unit"].fillna("").astype(str).str.upper().isin(["Y", "YES", "TRUE", "1"])).sum())
            
        if "container_length" in units.columns:
            lengths = units["container_length"].fillna("").astype(str).str.strip().str.upper()
            equips_col = units["equipment_type"].fillna("").astype(str).str.strip().str.upper() if "equipment_type" in units.columns else lengths
            
            is_40 = lengths.str.contains("40") | equips_col.str.contains("40")
            is_20 = lengths.str.contains("20") | equips_col.str.contains("20")
            
            container_classification["ft40"] += int(is_40.sum())
            container_classification["ft20"] += int((is_20 & ~is_40).sum())
            
        if "equipment_type" in units.columns:
            equips = units["equipment_type"].fillna("Unknown").astype(str).str.strip()
            if "equipment_breakdown" not in container_classification:
                container_classification["equipment_breakdown"] = {}
            for eq in equips:
                if eq:
                    container_classification["equipment_breakdown"][eq] = container_classification["equipment_breakdown"].get(eq, 0) + 1

    actual = {
        "visits":    merged_visits,
        "avg_hours": merged_avg_hours if merged_avg_hours > 0 else actual_raw.get("avg_hours"),
        "max_hours": max(merged_stays) if merged_stays else actual_raw.get("max_hours"),
        "min_hours": min(merged_stays) if merged_stays else actual_raw.get("min_hours"),
        "avg_restows": merged_avg_restows,
        "container_breakdown": container_classification,
    }

    # ── Pick busiest visit ────────────────────────────────────────────────────
    visit_scores: list[tuple] = []
    for vid, vdf in visit_groups.items():
        if vdf is None or vdf.empty:
            continue
        visit_scores.append((vid, len(vdf)))

    if not visit_scores:
        return {"error": "No valid visit data found", "vessel": vessel_service}

    visit_scores.sort(key=lambda x: x[1], reverse=True)
    top_visit_id = visit_scores[0][0]
    visit_df = visit_groups[top_visit_id]

    if visit_df is None or visit_df.empty:
        return {"error": "Top visit has no usable rows", "vessel": vessel_service}

    # ── Count loads / discharges ──────────────────────────────────────────────
    f_str = visit_df.get("ctr_from_position", visit_df.get("from_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    t_str = visit_df.get("ctr_to_position", visit_df.get("to_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    
    f_is_v = f_str.str.startswith(("V-", "VS-"))
    t_is_v = t_str.str.startswith(("V-", "VS-"))
    f_is_y = (f_str != "") & (~f_is_v)
    t_is_y = (t_str != "") & (~t_is_v)
    
    total_loaded = int((f_is_y & t_is_v).sum())
    total_discharged = int((f_is_v & t_is_y).sum())
    
    move_kind = visit_df.get("crane_move_kind", visit_df.get("move_kind", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    unknowns = ~( (f_is_y & t_is_v) | (f_is_v & t_is_y) | ((f_is_y & t_is_y) | (f_is_v & t_is_v)) )
    
    if unknowns.any():
        total_loaded += int((unknowns & (move_kind == "LOAD")).sum())
        total_discharged += int((unknowns & (move_kind == "DISCHARGE")).sum())

    total_visit_units = int(visit_df["unit_id"].nunique()) if "unit_id" in visit_df.columns else len(visit_df)
    if total_loaded == 0 and total_discharged == 0 and total_visit_units > 0:
        total_loaded = total_visit_units

    # Removed unused local variables for hazardous, reefer, oog, total_units, avg_hours, and restow_count
    actual.get("visits", {}).get(str(top_visit_id), {})

    if loaded_override is not None:
        total_loaded = loaded_override
    if discharged_override is not None:
        total_discharged = discharged_override

    delay_analysis = _calculate_delay_analysis(visit_df) if actual else None

    # predicted is returned directly from the model — no post-hoc blending
    # with actual_avg here. The model already handles the actual/ML distinction
    # internally (returns actual stay for historical visits, ML pred for live).

    if predicted and isinstance(predicted, dict):
        if loaded_override is None and discharged_override is None and merged_visits:
            sum_loaded = sum(v.get("loaded_containers", 0) for v in merged_visits.values())
            sum_discharged = sum(v.get("discharged_containers", 0) for v in merged_visits.values())
            n_visits = max(1, len(merged_visits))
            model_loaded = int(round(sum_loaded / n_visits))
            model_discharged = int(round(sum_discharged / n_visits))
        else:
            model_loaded = total_loaded
            model_discharged = total_discharged

        est_cranes = predicted.get("assigned_cranes")
        if not est_cranes:
            # Try to get non-zero crane counts from DB
            valid_crane_counts = {k: v for k, v in visit_crane_counts.items() if v > 0} if visit_crane_counts else {}
            if valid_crane_counts:
                est_cranes = int(round(sum(valid_crane_counts.values()) / len(valid_crane_counts)))
            elif merged_avg_hours and merged_avg_hours > 0 and (model_loaded + model_discharged) > 0:
                # Estimate cranes from: total_moves / (MPH * stay_hours)
                mph = float(historical_mph_avg) if historical_mph_avg and historical_mph_avg > 0 else 17.0
                est_cranes = max(1, int(round((model_loaded + model_discharged) / (mph * merged_avg_hours))))
            else:
                est_cranes = max(1, (model_loaded + model_discharged) // 400)
        
        predicted["model_factors"] = {
            "total_moves": model_loaded + model_discharged,
            "loaded": model_loaded,
            "discharged": model_discharged,
            "crane_count": est_cranes,
            "historical_mph_avg": float(historical_mph_avg) if historical_mph_avg else 0.0,
            "heavy_ratio": feature_template.get("heavy_ratio", 0.3),
            "restow_intensity": feature_template.get("restow_intensity", 1.0),
            "pct_40ft": feature_template.get("pct_40ft", 0.5),
            "reefer_equipment_ratio": feature_template.get("reefer_equipment_ratio", 0.1),
            "block_concentration": feature_template.get("block_concentration", 0.5),
        }

    return {
        "mode":           "vessel",
        "delay_analysis": delay_analysis,
        "vessel":         vessel_service,
        "vessel_service": (
            str(vessel_df["outbound_service"].iloc[0]).strip()
            if "outbound_service" in vessel_df.columns and not vessel_df["outbound_service"].isna().all()
            else vessel_service
        ),
        "actual":    actual,
        "predicted": predicted,
    }