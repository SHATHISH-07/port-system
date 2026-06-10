from services.stowage_helpers import _WEIGHT_RANK
from db.queries import get_vessel_schedule, load_from_db
import pandas as pd
from utils.current_container_lookup import lookup_containers_by_ids
from utils.position_parser import parse_position
from utils.stowage_rules import classify_weight_band
from db.connection import get_engine
from services.stowage_helpers import _normalize_dataframe_columns, _safe_str, _dedupe_latest_per_unit, _empty_pre_consolidation
from utils.routing import sort_ports_nearest_neighbor

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


