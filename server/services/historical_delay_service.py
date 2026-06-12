import logging
import pandas as pd
from db.queries import load_from_db
from services.xml_layout_service import xml_layout_service
from utils.position_parser import parse_position
   
logger = logging.getLogger('port_system.services')

def _calculate_delay_analysis(visit_df) -> list:
    """Analyse potential delay causes from container operation data only."""
    causes = []
    if visit_df is None or visit_df.empty:
        return causes

    if "move_complete_time" in visit_df.columns:
        mct = pd.to_datetime(visit_df["move_complete_time"], errors="coerce").dropna().sort_values()
        if len(mct) >= 2:
            gaps_min = mct.diff().dt.total_seconds().dropna() / 60
            long_gaps = gaps_min[gaps_min > 60]
            if not long_gaps.empty:
                lost_hours = round(long_gaps.sum() / 60, 1)
                causes.append({
                    "factor": "Operational Gaps",
                    "impact": "High" if lost_hours > 5 else "Medium",
                    "reason": f"Detected {len(long_gaps)} move-completion gaps exceeding 60 mins, amounting to a total of {lost_hours} hours of lost crane productivity. Prolonged gaps indicate coordination failures between yard equipment and the quay crane, directly extending the port stay and reducing overall berth throughput.",
                    "recommendation": "Review crane allocation",
                })
        
        # M-Cycle (Dual Cycle) percentage analysis
        mct_df = visit_df.dropna(subset=["move_complete_time"]).copy()
        if not mct_df.empty:
            mct_df["move_complete_time"] = pd.to_datetime(mct_df["move_complete_time"], errors="coerce")
            mct_df = mct_df.dropna(subset=["move_complete_time"]).sort_values("move_complete_time")
            if len(mct_df) > 10:
                f_str_mct = mct_df.get("ctr_from_position", mct_df.get("from_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
                t_str_mct = mct_df.get("ctr_to_position", mct_df.get("to_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
                
                is_load = (~f_str_mct.str.startswith(("V-", "VS-"))) & t_str_mct.str.startswith(("V-", "VS-"))
                is_disc = f_str_mct.str.startswith(("V-", "VS-")) & (~t_str_mct.str.startswith(("V-", "VS-")))
                
                mct_df["op_type"] = "OTHER"
                mct_df.loc[is_load, "op_type"] = "LOAD"
                mct_df.loc[is_disc, "op_type"] = "DISCHARGE"
                
                productive_mask = mct_df["op_type"].isin(["LOAD", "DISCHARGE"])
                if productive_mask.sum() > 10:
                    prod_df = mct_df[productive_mask].copy()
                    prod_df["prev_op"] = prod_df["op_type"].shift(1)
                    prod_df["gap_mins"] = prod_df["move_complete_time"].diff().dt.total_seconds() / 60
                    
                    dual_cycles = (
                        (prod_df["op_type"] != prod_df["prev_op"]) &
                        (prod_df["prev_op"].notna()) &
                        (prod_df["gap_mins"] <= 15)
                    ).sum()
                    
                    productive = len(prod_df)
                    dual_cycle_rate = (dual_cycles / productive) * 100
                    
                    if dual_cycle_rate < 15.0:
                        lost_m_cycles = int(productive * (0.15 - (dual_cycle_rate / 100)))
                        est_lost_hours = round(lost_m_cycles * 3 / 60, 1) # Assuming ~3 mins per missed dual cycle opportunity
                        causes.append({
                            "factor": "Low M-Cycle Percentage",
                            "impact": "High" if est_lost_hours > 3 else "Medium",
                            "reason": f"Only {dual_cycle_rate:.1f}% dual-cycles (M-cycles) detected. Poor interleaving has resulted in an estimated {est_lost_hours} hours of wasted gantry movement. Expanding dual-cycling directly reduces unladen trolley travel time and significantly improves operational efficiency.",
                            "recommendation": "Improve stacking and consolidation",
                        })

    # Fast vectorised restow count
    f_str = visit_df.get("ctr_from_position", visit_df.get("from_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    t_str = visit_df.get("ctr_to_position", visit_df.get("to_position", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    
    f_is_v = f_str.str.startswith(("V-", "VS-"))
    t_is_v = t_str.str.startswith(("V-", "VS-"))
    f_is_y = (f_str != "") & (~f_is_v)
    t_is_y = (t_str != "") & (~t_is_v)
    
    restow_count = int(((f_is_y & t_is_y) | (f_is_v & t_is_v)).sum())
    move_kind = visit_df.get("crane_move_kind", visit_df.get("move_kind", pd.Series(dtype=str))).fillna("").astype(str).str.upper()
    unknowns = ~( (f_is_y & t_is_v) | (f_is_v & t_is_y) | ((f_is_y & t_is_y) | (f_is_v & t_is_v)) )
    if unknowns.any():
        restow_count += int((unknowns & move_kind.isin(["SHIFT", "RESTOW"])).sum())

    if restow_count > 20:
        est_restow_hours = round(restow_count * 3.5 / 60, 1) # ~3.5 mins per restow
        causes.append({
            "factor": "High Restow Rate",
            "impact": "High" if est_restow_hours > 4 else "Medium",
            "reason": f"{restow_count} restow/shift moves detected, extending berth time by an estimated {est_restow_hours} hours. High restow rates typically stem from sub-optimal yard stacking or late changes to the stowage plan, causing significant unproductive crane usage.",
            "recommendation": "Improve stacking and consolidation",
        })

    # Fetch visit_id to get crane data
    visit_id = None
    if "actual_outbound_carrier_visit_id" in visit_df.columns and not visit_df["actual_outbound_carrier_visit_id"].isna().all():
        visit_id = str(visit_df["actual_outbound_carrier_visit_id"].dropna().iloc[0])

    crane_df = pd.DataFrame()
    if visit_id:
        try:
            crane_df = load_from_db("crane", vessel_id=[visit_id])
        except Exception as e:
            print(f"Error loading crane df in delay analysis: {e}")

    # 1. Crane idle time
    if not crane_df.empty and "crane_id" in crane_df.columns and "time_completed" in crane_df.columns:
        crane_mct = crane_df.dropna(subset=["time_completed"]).sort_values(["crane_id", "time_completed"])
        if not crane_mct.empty:
            crane_mct["time_completed"] = pd.to_datetime(crane_mct["time_completed"], errors="coerce")
            crane_mct = crane_mct.dropna(subset=["time_completed"])
            crane_mct["gap_mins"] = crane_mct.groupby("crane_id")["time_completed"].diff().dt.total_seconds() / 60
            idle_gaps = crane_mct[crane_mct["gap_mins"] > 30]
            if not idle_gaps.empty:
                causes.append({
                    "factor": "Crane Idle Time",
                    "impact": "High",
                    "reason": f"Detected {len(idle_gaps)} instances of crane idle time >30 mins. Unplanned crane idle time points to severe bottlenecks in horizontal transport (ITV shortage) or yard crane unreadiness, leading to direct vessel departure delays.",
                    "recommendation": "Review crane allocation",
                })

    # 2. Container availability timing
    if "time_in" in visit_df.columns:
        loads = visit_df[f_is_y & t_is_v]
        if not loads.empty and "move_complete_time" in loads.columns:
            first_load_time = pd.to_datetime(loads["move_complete_time"], errors="coerce").min()
            if pd.notna(first_load_time):
                time_in = pd.to_datetime(visit_df["time_in"], errors="coerce")
                late_arrivals = visit_df[(time_in > first_load_time)]
                if not late_arrivals.empty:
                    causes.append({
                        "factor": "Container not ready",
                        "impact": "High",
                        "reason": f"{len(late_arrivals)} containers arrived after vessel loading started. Late arrivals severely disrupt the planned load sequence, forcing quay cranes to wait or restow units, which critically impacts the operational timeline.",
                        "recommendation": "Improve yard readiness before arrival",
                    })

    # 3. Long unladen travel & ITV congestion
    try:
        xml_distances = xml_layout_service.compute_distances()
        if "block_to_berth" in xml_distances:
         
            load_blocks = f_str[f_is_y & t_is_v].apply(lambda x: parse_position(str(x), "").get("block") if parse_position(str(x), "").get("is_yard") else None).dropna()
            if not load_blocks.empty:
                long_travel_count = 0
                for bk in load_blocks:
                    if bk in xml_distances["block_to_berth"]:
                        berths = xml_distances["block_to_berth"][bk]
                        if berths:
                            b_name = list(berths.keys())[0]
                            dist = berths[b_name].get("distance_m", 0)
                            if dist > 800:
                                long_travel_count += 1
                if long_travel_count > len(load_blocks) * 0.3:
                    causes.append({
                        "factor": "ITV congestion / Long unladen travel",
                        "impact": "Medium",
                        "reason": f"{long_travel_count} load moves originated from blocks >800m from the berth. This extended unladen travel time creates ITV congestion and slows down the cycle time of horizontal transport, reducing the quay crane delivery rate.",
                        "recommendation": "Review corridor planning",
                    })
    except Exception as e:
        print(f"Error computing unladen travel delay: {e}")

    # 4. Crane crossing conflicts
    if not crane_df.empty and "crane_id" in crane_df.columns:
        crane_bays = {}
        for row in crane_df.to_dict('records'):
            cid = row.get("crane_id")
            pos = row.get("from_position") or row.get("to_position")
            if pd.isna(cid) or pd.isna(pos):
                continue
            p_info = parse_position(str(pos), "")
            if p_info and p_info.get("is_vessel"):
                bay = p_info.get("bay")
                if bay and str(bay).isdigit():
                    bay = int(bay)
                    if cid not in crane_bays:
                        crane_bays[cid] = {"min": bay, "max": bay}
                    else:
                        crane_bays[cid]["min"] = min(crane_bays[cid]["min"], bay)
                        crane_bays[cid]["max"] = max(crane_bays[cid]["max"], bay)
        
        c_ids = list(crane_bays.keys())
        crossing_conflicts = 0
        for i in range(len(c_ids)):
            for j in range(i+1, len(c_ids)):
                b1 = crane_bays[c_ids[i]]
                b2 = crane_bays[c_ids[j]]
                if b1["max"] >= b2["min"] and b1["min"] <= b2["max"]:
                    crossing_conflicts += 1
        
        if crossing_conflicts > 0:
            causes.append({
                "factor": "Crane crossing conflicts",
                "impact": "High",
                "reason": f"Detected {crossing_conflicts} instances of crane working zone (bay) overlap. Crane clashes or overlapping work zones require gantry speed reduction and manual intervention, creating significant safety risks and operational delays.",
                "recommendation": "Review crane deployment zones",
            })

    return causes

# Berth table builder
# Dashboard & Heatmap builders
