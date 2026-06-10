from services.vessel_operations import _is_yes
from utils.position_parser import block_label
from utils.position_parser import parse_position
from collections import defaultdict
import logging
import pandas as pd
from config import settings as _settings
from services.xml_layout_service import xml_layout_service
from config import settings
from db.queries import load_from_db
from services.vessel_service import analyze_vessel_dashboard
import re
from services.heatmap_service import _deterministic_layout

logger = logging.getLogger('port_system.services')

def get_yard_heatmap_data(
    unit_ids: list[str],
    yard_id: str = None,
    vessel_id: str = None,
    load_moves: int = None,
    discharge_moves: int = None,
) -> dict:
    """
    Unified endpoint for all map/heatmap/terminal visualization data.
    """
    visit_id = ""

    if unit_ids:
        from utils.current_container_lookup import lookup_containers_by_ids
        full_df = lookup_containers_by_ids(unit_ids, yard_id)
        df = full_df.copy() if full_df is not None else pd.DataFrame()
        if not df.empty:
            df["unit_id"] = df["unit_id"].astype(str).str.strip().str.upper()
            
            # Extract active containers specifically matching the criteria:
            # - Outbound service is null
            # - Inbound service is not null
            # - Ctr From Position starts with V-
            # - Ctr To Position starts with Y-
            outbound_col = "outbound_service" if "outbound_service" in df.columns else "actual_outbound_carrier_visit_id"
            if outbound_col in df.columns and "inbound_service" in df.columns:
                df["_outbound_clean"] = df[outbound_col].astype(str).str.strip().replace(["nan", "None", "NaN", ""], pd.NA)
                df["_inbound_clean"] = df["inbound_service"].astype(str).str.strip().replace(["nan", "None", "NaN", ""], pd.NA)
                
                f_str = df.get("ctr_from_position", pd.Series(dtype=str)).fillna("").astype(str).str.upper()
                t_str = df.get("ctr_to_position", pd.Series(dtype=str)).fillna("").astype(str).str.upper()
                
                valid_mask = (
                    df["_outbound_clean"].isna() &
                    df["_inbound_clean"].notna() &
                    f_str.str.startswith(("V-", "VS-")) &
                    t_str.str.startswith("Y-")
                )
                df = df[valid_mask].copy()

            if "actual_outbound_carrier_visit_id" in df.columns:
                valid_visits = df["actual_outbound_carrier_visit_id"].dropna()
                if not valid_visits.empty:
                    visit_id = str(valid_visits.iloc[0])
            
    else:
        return {"error": "Must provide unit_ids"}

    if not df.empty:
        if "unit_id" in df.columns:
            df["unit_id"] = df["unit_id"].astype(str).str.strip().str.upper()
            sort_cols = [c for c in ["updated_at", "time_in", "created_at"] if c in df.columns]
            if sort_cols:
                df = df.sort_values(sort_cols, ascending=False)
            df = df.drop_duplicates(subset=["unit_id"], keep="first")
        
        if not df.empty and "actual_outbound_carrier_visit_id" in df.columns:
            valid_visits = df["actual_outbound_carrier_visit_id"].dropna()
            if not valid_visits.empty:
                visit_id = str(valid_visits.iloc[0])

    if df.empty:
        return {
            "vessel": vessel_id or "",
            "visit_id": "",
            "yard_id": yard_id,
            "error": f"No containers found for request",
            "blocks": [],
            "summary": {
                "total_containers": 0,
                "total_blocks": 0,
                "reefer_total": 0,
                "hazmat_total": 0,
                "oog_total": 0,
            },
            "infrastructure": _get_infrastructure([]),
            "berth_analysis": [],
            "conflict_table": [],
            "primary_berth": {},
        }

    if unit_ids and "unit_id" in df.columns:
        unit_ids_upper = [u.strip().upper() for u in unit_ids]
        df = df[df["unit_id"].astype(str).str.strip().str.upper().isin(unit_ids_upper)].copy()

    if df.empty:
        return {
            "vessel": vessel_id,
            "visit_id": "",
            "yard_id": yard_id,
            "error": "No matching containers found in the yard",
            "blocks": [],
            "summary": {
                "total_containers": 0,
                "total_blocks": 0,
                "reefer_total": 0,
                "hazmat_total": 0,
                "oog_total": 0,
            },
            "infrastructure": _get_infrastructure([]),
            "berth_analysis": [],
            "conflict_table": [],
            "primary_berth": {},
        }

    blocks = defaultdict(lambda: {
        "density": 0,
        "reefer": 0,
        "hazmat": 0,
        "oog": 0,
        "stack_heights": [],
        "max_stack": 0,
        "unit_rows": [],
    })

    for row in df.to_dict('records'):
        # Get position strictly from ctr_to_position as requested for active in-yard containers
        pos_str = str(row.get("ctr_to_position", ""))
        if not pos_str or str(pos_str) == "nan":
            pos_str = str(row.get("current_position") or "")
        
        if not pos_str:
            continue

        pos_info = parse_position(pos_str, yard_id)
        if not pos_info or not pos_info["is_yard"]:
            continue

        bk = block_label(pos_info) or "UNKNOWN"
        b = blocks[bk]
        b["density"] += 1

        if _is_yes(row.get("reefer")):
            b["reefer"] += 1
        if _is_yes(row.get("hazardous_flag")):
            b["hazmat"] += 1
        if _is_yes(row.get("oog_unit")):
            b["oog"] += 1

        tier = pos_info.get("tier")
        try:
            h = int(tier) if tier and str(tier).isdigit() else 1
            b["stack_heights"].append(h)
            if h > b["max_stack"]:
                b["max_stack"] = h
        except Exception:
            pass

        b["unit_rows"].append(row)

    block_list = []
    max_density = max((b["density"] for b in blocks.values()), default=1)

    for bk, data in blocks.items():
        avg_h = sum(data["stack_heights"]) / len(data["stack_heights"]) if data["stack_heights"] else 1
        density_pct = round(data["density"] / max(max_density, 1), 4)

        # FIX: concentration label per block (Red/Orange/Green)
        concentration_label = (
            "Red" if density_pct >= 0.7
            else "Orange" if density_pct >= 0.4
            else "Green"
        )

        block_list.append({
            "block_id": bk,
            "total_containers": data["density"],
            "reefer_count": data["reefer"],
            "hazmat_count": data["hazmat"],
            "oog_count": data["oog"],
            "density_pct": density_pct,
            "concentration_label": concentration_label,
            "avg_stack_height": round(avg_h, 1),
            "distance_to_berth_m": None,  # populated after XML distance calc
            "containers": []
        })

        for u in data["unit_rows"]:
            c_pos = str(u.get("ctr_to_position", ""))
            if not c_pos or str(c_pos) == "nan":
                c_pos = str(u.get("current_position") or "")

            p_info = parse_position(c_pos, yard_id)

            # FIX: derive weight_class from unit_weight_in_kg or verified_gross_mass
            raw_weight = u.get("unit_weight_in_kg") or u.get("verified_gross_mass_kg")
            try:
                w_kg = float(raw_weight) if raw_weight and str(raw_weight) not in ("nan", "None", "") else 0
            except (ValueError, TypeError):
                w_kg = 0
            weight_class = (
                "HEAVY" if w_kg >= 20000
                else "MEDIUM" if w_kg >= 10000
                else "LIGHT"
            )

            block_list[-1]["containers"].append({
                "unit_id": u.get("unit_id"),
                "position": c_pos,
                "bay": p_info.get("bay") if p_info else "-",
                "row": p_info.get("row") if p_info else "-",
                "tier": p_info.get("tier") if p_info else "-",
                "freight_kind": u.get("freight_kind"),
                "outbound_service": u.get("outbound_service"),
                "category": u.get("category_id"),
                "hazardous": _is_yes(u.get("hazardous_flag")),
                "reefer": _is_yes(u.get("reefer")),
                "oog": _is_yes(u.get("oog_unit")),
                "equipment_class": u.get("equipment_class") or "CONTAINER",
                "container_length": u.get("container_length"),
                "weight_class": weight_class,
            })

    summary = {
        "total_containers": sum(b["total_containers"] for b in block_list),
        "total_blocks": len(block_list),
        "reefer_total": sum(b["reefer_count"] for b in block_list),
        "hazmat_total": sum(b["hazmat_count"] for b in block_list),
        "oog_total": sum(b["oog_count"] for b in block_list),
    }

    unique_blocks = [b["block_id"] for b in block_list]
    
   
    full_layout = None
    try:
        
        full_layout = xml_layout_service.parse(settings.TERMINAL_XML_PATH)
    except Exception:
        pass

    berth_analysis: list[dict] = []
    conflict_table: list[dict] = []
    primary_berth: dict = {}

    total_all = summary["total_containers"] or 1
    
    # 1. Get XML Berths
    berths_data = full_layout.get("berths", {}) if full_layout else {}
    if not berths_data:
        berths_data = {"Berth 1": {"name": "Berth 1", "center": (0.185, 0.55)}}
        
    yard_w = full_layout.get("bbox", {}).get("width", 1500) if full_layout else 1500
    yard_h = full_layout.get("bbox", {}).get("height", 800) if full_layout else 800
    NEAR_THRESHOLD_M = 600

    xml_distances = {}
    if full_layout:
        try:
            
            xml_distances = xml_layout_service.compute_distances(cached=full_layout)
        except Exception as e:
            logger.error(f"Failed to compute xml distances: {e}")

    # 2. Calculate Berth Metrics
    primary_block_id = None
    max_block_count = -1
    for bk_data in block_list:
        if bk_data["total_containers"] > max_block_count:
            max_block_count = bk_data["total_containers"]
            primary_block_id = bk_data["block_id"]

    berth_metrics = []
    for berth_id, berth_info in berths_data.items():
        berth_name = berth_info.get("name", berth_id)
        berth_cx, berth_cy = berth_info.get("center", (0.185, 0.55))
        
        near_count = 0
        near_blocks = set()
        total_laden = 0
        corridors = set()
        equipment = set()
        
        block_distances = {}
        
        for bk_data in block_list:
            bk_id = bk_data["block_id"]
            bk_count = bk_data["total_containers"]
            
            dist_m = 0
            
            if full_layout:
                if bk_id in xml_distances.get("block_to_berth", {}):
                    if berth_id in xml_distances["block_to_berth"][bk_id]:
                        d_info = xml_distances["block_to_berth"][bk_id][berth_id]
                        dist_m = d_info.get("distance_m", 0)
                        for node in d_info.get("route", []):
                            corridors.add(node)
                
                # If still 0, calculate based on XML center coordinates
                if dist_m == 0:
                    bk_info = full_layout.get("blocks", {}).get(bk_id, {})
                    b_cx, b_cy = bk_info.get("center", (0.5, 0.5))
                    dx_norm = abs(b_cx - berth_cx)
                    dy_norm = abs(b_cy - berth_cy)
                    dist_m = (dx_norm * yard_w + dy_norm * yard_h)
                
                bk_info = full_layout.get("blocks", {}).get(bk_id, {})
                if bk_info.get("type"):
                    equipment.add(bk_info["type"])
            else:
                # Fallback to math
                b_cx, b_cy = 0.5, 0.5
                dx_norm = abs(b_cx - berth_cx)
                dy_norm = abs(b_cy - berth_cy)
                dist_m = int((dx_norm * yard_w + dy_norm * yard_h) / 100)
            
            # The routing distance is exactly in metres
            dist_m = int(dist_m)
            block_distances[bk_id] = dist_m

            if dist_m <= NEAR_THRESHOLD_M:
                near_count += bk_count
                near_blocks.add(bk_id)
                
            total_laden += bk_count * dist_m
            
            if bk_id == primary_block_id:
                primary_block_dist_m = dist_m

        concentration_pct = round((near_count / total_all) * 100, 2)
        avg_dist = int(total_laden / total_all) if total_all > 0 else 0

        # FIX: unladen travel = return trips (empty trucks), ~85% of laden distance
        total_unladen = int(total_laden * 0.85)

        berth_metrics.append({
            "berth_name": berth_name,
            "concentration_pct": concentration_pct,
            "near_count": near_count,
            "avg_dist": avg_dist,
            "total_laden": total_laden,
            "total_unladen": total_unladen,
            "near_blocks": near_blocks,
            "corridors": corridors,
            "equipment": equipment,
            "block_distances": block_distances,
            "primary_block_dist_m": primary_block_dist_m if 'primary_block_dist_m' in locals() else 0
        })
        
    # Sort: Optimal berth is strictly the shortest travel distance from the primary block
    berth_metrics.sort(key=lambda x: x["primary_block_dist_m"])

    final_load = load_moves if load_moves is not None else total_all
    final_discharge = discharge_moves if discharge_moves is not None else 0

    estimated_stay = 0.0
    recommended_cranes = 1
    avg_crane_mph = 25.0

    try:
        df_curr = load_from_db("current", vessel_id=vessel_id) if vessel_id else pd.DataFrame()
        df_hist = load_from_db("history", vessel_id=vessel_id) if vessel_id else pd.DataFrame()
        
        analysis_result = analyze_vessel_dashboard(
            df_curr,
            vessel_id or "UNKNOWN",
            loaded_override=final_load,
            discharged_override=final_discharge,
            history_df=df_hist,
        )
        
        if "error" in analysis_result and not df_hist.empty:
            analysis_result = analyze_vessel_dashboard(
                df_hist,
                vessel_id or "UNKNOWN",
                loaded_override=final_load,
                discharged_override=final_discharge,
            )
            
        predicted = analysis_result.get("predicted", {})
        if isinstance(predicted, dict):
            estimated_stay = predicted.get("avg_hours", 0.0)
            if "assigned_cranes" in predicted:
                recommended_cranes = predicted.get("assigned_cranes", 1)
        elif isinstance(predicted, float):
            estimated_stay = predicted
            
        actual = analysis_result.get("actual", {})
        if "visits" in actual and actual["visits"]:
            visit_vals = list(actual["visits"].values())
            if visit_vals:
                first_visit = visit_vals[0]
                if "crane_mph" in first_visit and first_visit.get("crane_mph", 0) > 0:
                    avg_crane_mph = first_visit.get("crane_mph", 25.0)

        if estimated_stay <= 0.0:
            estimated_stay = round((final_load + final_discharge) / (recommended_cranes * avg_crane_mph), 1) if (recommended_cranes * avg_crane_mph) > 0 else 0.0

    except Exception as e:
        logging.getLogger("port_system").error(f"Error calling analyze_vessel_dashboard from heatmap: {e}")
        estimated_stay = round((final_load + final_discharge) / (recommended_cranes * avg_crane_mph), 1) if (recommended_cranes * avg_crane_mph) > 0 else 0.0

    for idx, b in enumerate(berth_metrics, start=1):
        dist_m = b["avg_dist"]
        travel_distance_label = "Short" if dist_m < 500 else "Moderate" if dist_m < 1200 else "Long"
        
        risk = (
            "High" if b["concentration_pct"] >= _settings.BERTH_HIGH_RISK_SHARE_PCT
            else "Medium" if b["concentration_pct"] >= _settings.BERTH_MEDIUM_RISK_SHARE_PCT
            else "Low"
        )
        
        # FIX: unladen distance is separate from laden
        unladen_dist = int(b["total_unladen"] / total_all) if total_all > 0 else 0
        

        berth_analysis.append({
            "rank":                    idx,
            "berth":                   b["berth_name"],
            "terminal":                yard_id or "YARD",
            "near_blocks":             sorted(list(b["near_blocks"])),
            "total_moves":             total_all,
            "load_moves":              b["near_count"],
            "discharge_moves":         0,
            "cargo_concentration_pct": b["concentration_pct"],
            "intensity":               round(b["concentration_pct"] / 100, 4),
            "recommended_cranes":      recommended_cranes,
            "avg_crane_productivity_mph": round(avg_crane_mph, 1),
            "estimated_port_stay_hours": estimated_stay,
            "congestion_risk":         risk,
            "hazardous":               summary.get("hazmat_total", 0),
            "reefer":                  summary.get("reefer_total", 0),
            "oog":                     summary.get("oog_total", 0),
            "unique_containers":       b["near_count"],
            "impact_score":            dist_m,
            "travel_distance_score":   dist_m,
            "travel_distance_label":   travel_distance_label,
            "laden_travel_distance_m": dist_m,
            "unladen_travel_distance_m": unladen_dist,
            "avg_laden_distance_m":    b["avg_dist"],
            "avg_unladen_distance_m":  unladen_dist,
            "block_distances":         b["block_distances"],
            "corridor_congestion": (
                "High" if b["concentration_pct"] > 80
                else "Moderate" if b["concentration_pct"] > 40
                else "Low"
            ),
            "mitigation": (
                "Deploy additional transport units"
                if dist_m >= 500 else "Standard operations"
            ),
            "_near_blocks_set": b["near_blocks"],
            "_corridors_set": b.get("corridors", set()),
            "_equipment_set": b.get("equipment", set()),
        })

    if berth_analysis:
        # 1. Target Vessel Window
        target_visit_id = str(visit_id) if visit_id else ""
        min_time, max_time = pd.NaT, pd.NaT
        if not df.empty and "move_complete_time" in df.columns:
            mct = pd.to_datetime(df["move_complete_time"], errors="coerce").dropna()
            if not mct.empty:
                min_time = mct.min()
                max_time = mct.max()
        
        # 2. Query Concurrent Vessels
        concurrent_vessels = {}  # visit_id -> {"service": str, "blocks": set()}
        try:
            cdf = pd.DataFrame()
            if "full_df" in locals() and full_df is not None and not full_df.empty:
                if "outbound_service" in full_df.columns:
                    target = str(vessel_id).strip().upper() if vessel_id else ""
                    mask = (
                        (full_df["outbound_service"].astype(str).str.strip().str.upper() != target) &
                        (full_df["outbound_service"].notna()) &
                        (full_df["outbound_service"].astype(str).str.strip() != "") &
                        (~full_df["outbound_service"].astype(str).str.strip().str.upper().isin(['NAN', 'NONE', 'UNKNOWN']))
                    )
                    cdf = full_df[mask].copy()

            for crow in cdf.to_dict('records'):
                v_id = crow.get("actual_outbound_carrier_visit_id") or crow.get("outbound_service")
                if v_id not in concurrent_vessels:
                    concurrent_vessels[v_id] = {"service": crow.get("outbound_service"), "blocks": set()}
                
                visit_state = str(crow.get("visit_state", "") or "").upper()
                is_loaded = "DEPARTED" in visit_state
                c_pos = str(crow.get("ctr_from_position", "")) if is_loaded else str(crow.get("current_position", ""))
                
                if c_pos and c_pos.lower() not in ('nan', 'none'):
                    cp_info = parse_position(str(c_pos), yard_id)
                    if cp_info and cp_info.get("is_yard"):
                        cbk = block_label(cp_info)
                        if cbk:
                            concurrent_vessels[v_id]["blocks"].add(cbk)
        except Exception as e:
            print(f"Error querying concurrent vessels: {e}")

        # Fetch Cranes for Target and Concurrent Vessels
        vessel_crane_map = {}
        target_cranes = []
        try:
            all_vids = [target_visit_id] + list(concurrent_vessels.keys())
            crane_df = load_from_db("crane", vessel_id=all_vids)
            if not crane_df.empty and "crane_id" in crane_df.columns and "carrier_visit" in crane_df.columns:
                for cv, grp in crane_df.groupby("carrier_visit"):
                    c_ids = grp["crane_id"].dropna().unique().tolist()
                    nums = []
                    for cid in c_ids:
                        m = re.search(r'\d+', str(cid))
                        if m:
                            nums.append(int(m.group()))
                    vessel_crane_map[str(cv)] = sorted(nums)
            
            target_cranes = vessel_crane_map.get(target_visit_id, [])
        except Exception as e:
            print(f"Error querying cranes for conflicts: {e}")

        # Enrich concurrent vessels with XML corridors and equipment
        for v_id, v_data in concurrent_vessels.items():
            v_data["corridors"] = set()
            v_data["equipment"] = set()
            if full_layout:
                for bk in v_data["blocks"]:
                    if bk in xml_distances.get("block_to_berth", {}):
                        xml_berth_names = list(xml_distances["block_to_berth"][bk].keys())
                        xml_b = xml_berth_names[0] if xml_berth_names else None
                        if xml_b:
                            for node in xml_distances["block_to_berth"][bk][xml_b].get("route", []):
                                v_data["corridors"].add(node)
                    bk_info = full_layout.get("blocks", {}).get(bk, {})
                    if bk_info.get("type"):
                        v_data["equipment"].add(bk_info["type"])

        for row in berth_analysis:
            conflicts: list[dict] = []
            row_berth = row["berth"]
            # FIX: use internal keys then remove them, keeping near_blocks in response
            near_blocks = row.pop("_near_blocks_set", set())
            corridors = row.pop("_corridors_set", set())
            equipment = row.pop("_equipment_set", set())
            
            for v_id, v_data in concurrent_vessels.items():
                shared_blocks = list(near_blocks.intersection(v_data["blocks"]))
                shared_corridors = list(corridors.intersection(v_data["corridors"]))
                shared_equipment = list(equipment.intersection(v_data["equipment"]))
                print(f"DEBUG: berth={row_berth}, v_id={v_id}, near_blocks={near_blocks}, v_data_blocks={v_data['blocks']}, shared={shared_blocks}")
                
                conflict_types = []
                if shared_blocks: 
                    conflict_types.append("Block Overlap")
                if len(shared_corridors) >= 2: 
                    conflict_types.append("Corridor Overlap")
                if "TRANSTAINER" in shared_equipment: 
                    conflict_types.append("Equipment Competition")
                
                # Check for Crane Rail / Working Zone Overlap
                c_cranes = vessel_crane_map.get(str(v_id), [])
                if target_cranes and c_cranes:
                    shared_c = set(target_cranes).intersection(c_cranes)
                    if shared_c:
                        conflict_types.append("Crane Rail Overlap")
                    else:
                        t_min, t_max = min(target_cranes), max(target_cranes)
                        c_min, c_max = min(c_cranes), max(c_cranes)
                        if t_max > c_min and t_min < c_max:
                            conflict_types.append("Crane Rail Overlap")
                
                if conflict_types:
                    overlap_hours = round((max_time - min_time).total_seconds() / 3600, 1) if pd.notna(max_time) and pd.notna(min_time) else round(estimated_stay, 1)
                    shared_block_pct = round((len(shared_blocks) / len(near_blocks)) * 100, 1) if near_blocks else 0
                    conflicts.append({
                        "vessel_service": str(v_data["service"]),
                        "visit_id": str(v_id),
                        "shared_blocks": shared_blocks,
                        "shared_block_pct": shared_block_pct,
                        "shared_corridors": shared_corridors,
                        "shared_equipment": shared_equipment,
                        "conflict_types": conflict_types,
                        "overlap_hours": overlap_hours
                    })

            reason = (
                f"High concentration â€” {row['cargo_concentration_pct']}% of cargo located nearby."
                if row["cargo_concentration_pct"] > 60
                else f"Moderate load â€” {row['cargo_concentration_pct']}% of cargo nearby."
                if row["cargo_concentration_pct"] > 30
                else f"{row['cargo_concentration_pct']}% of cargo located nearby."
            )
            
            if conflicts:
                svc = conflicts[0]["vessel_service"]
                hrs = conflicts[0]["overlap_hours"]
                ctype = conflicts[0]["conflict_types"][0] if conflicts[0].get("conflict_types") else "Operational Conflict"
                
                mitigation = "Standard operations"
                if "Crane Rail Overlap" in conflicts[0]["conflict_types"]:
                    mitigation = "Adjust crane allocation"
                elif "Block Overlap" in conflicts[0]["conflict_types"]:
                    mitigation = "Pre-consolidate yard cargo"
                
                if len(conflicts[0]["conflict_types"]) > 1 or len(conflicts) > 1:
                    mitigation = "Change berth"

                # FIX: Granular risk classification based on conflict severity
                total_conflict_types = set()
                max_shared_pct = 0
                for c in conflicts:
                    total_conflict_types.update(c["conflict_types"])
                    max_shared_pct = max(max_shared_pct, c.get("shared_block_pct", 0))

                if (len(total_conflict_types) >= 3
                    or "Crane Rail Overlap" in total_conflict_types
                    or max_shared_pct >= 50
                    or len(conflicts) >= 3):
                    conflict_risk = "High"
                elif (len(total_conflict_types) >= 2
                      or max_shared_pct >= 25
                      or len(conflicts) >= 2):
                    conflict_risk = "Medium"
                else:
                    conflict_risk = "Low"

                row["congestion_risk"] = conflict_risk
                reason = f"Berth {row_berth} is shared with vessel {svc} for {hrs} hrs â€” {conflict_risk} clash risk ({ctype})."

                # FIX: collect all contested blocks across all conflicts
                all_contested_blocks = set()
                for c in conflicts:
                    all_contested_blocks.update(c.get("shared_blocks", []))

                conflict_table.append({
                    "berth":         row["berth"],
                    "contested_blocks": sorted(list(all_contested_blocks)),
"conflict_risk": conflict_risk,
                    "conflict_with": conflicts[:4],
                    "impact_score":  row["impact_score"],
                    "reason":        reason,
                    "mitigation":    mitigation,
                })

        if berth_analysis:
            primary_berth = berth_analysis[0]
            # Update each block's distance to this specific optimal berth
            optimal_berth_name = primary_berth["berth"]
            optimal_berth_id = next((k for k, v in berths_data.items() if v.get("name", k) == optimal_berth_name), None)
            
            if optimal_berth_id:
                for bl in block_list:
                    bk_id = bl["block_id"]
                    dist_m = 500
                    if full_layout and bk_id in xml_distances.get("block_to_berth", {}) and optimal_berth_id in xml_distances["block_to_berth"][bk_id]:
                        dist_m = xml_distances["block_to_berth"][bk_id][optimal_berth_id].get("distance_m", 500)
                    else:
                        b_cx, b_cy = 0.5, 0.5
                        berth_cx, berth_cy = berths_data[optimal_berth_id].get("center", (0.185, 0.55))
                        dist_m = int((abs(b_cx - berth_cx) * yard_w + abs(b_cy - berth_cy) * yard_h) / 100)
                    bl["distance_to_berth_m"] = int(dist_m)
            primary_berth["recommendation_reason"] = (
                f"{primary_berth['cargo_concentration_pct']}% of loading cargo located in blocks near {primary_berth['berth']}. "
                f"Lowest operational impact based on travel distance."
            )

    if full_layout:
        # For AECY, we only return the normalized block layout for backward compatibility
        layout = xml_layout_service.get_normalized_layout(unique_blocks, cached=full_layout)
    else:
        layout = _deterministic_layout(unique_blocks)

    terminal_layout = full_layout

    return {
        "vessel": vessel_id,
        "visit_id": visit_id,
        "yard_id": yard_id,
        "blocks": block_list,
        "summary": summary,
        "infrastructure": _get_infrastructure(block_list),
        "berth_analysis": berth_analysis,
        "conflict_table": conflict_table,
        "primary_berth": primary_berth,
        "layout": layout,
        "terminal_layout": terminal_layout,
        "timestamp": pd.Timestamp.now().isoformat(),
    }

def _get_infrastructure(block_list: list = None) -> dict:
    """Terminal infrastructure data dynamically constructed from block list."""
    if not block_list:
        return {"berths": [], "lanes": []}
    
    # Generate abstract berths based on the active blocks (e.g. A, B, C)
    berths = []
    lanes = []
    
    block_letters = list(dict.fromkeys(b["block_id"][0] if b["block_id"] else "Z" for b in block_list))
    for i, letter in enumerate(block_letters[:3]):  # Show up to 3 berths for visualization
        berths.append({
            "id": f"Berth-{letter}",
            "slots": [1, 2, 3],
            "status": "available" if i % 2 == 0 else "occupied"
        })
        
    for i, b in enumerate(block_list[:3]):
        lanes.append({
            "id": f"Lane-{b['block_id']}",
            "occupancy": round(b.get("density_pct", 0.0), 2)
        })
        
    return {
        "berths": berths,
        "lanes": lanes,
    }