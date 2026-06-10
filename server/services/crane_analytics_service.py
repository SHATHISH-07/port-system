import logging
import pandas as pd
from config import settings as _settings
from db.queries import load_from_db

logger = logging.getLogger('port_system.services')

def _fetch_crane_for_visit(visit_id: str) -> pd.DataFrame:
    """
    Fetches and normalizes crane operations for a specific visit.
    """
    try:
        df = load_from_db("crane", vessel_id=str(visit_id))
        if df.empty:
            return pd.DataFrame()

        df = df.rename(columns={
            "time_completed": "crane_time",
            "from_position":  "crane_from",
            "to_position":    "crane_to",
            "move_kind":      "crane_move_kind",
        })
        df["crane_time"] = pd.to_datetime(df["crane_time"], errors="coerce")
        return df
    except Exception as exc:
        logger.warning("crane fetch failed for %s: %s", visit_id, exc)
        return pd.DataFrame()


def _fetch_crane_counts_batch(visit_ids: list[str]) -> dict[str, int]:
    """
    Fetch distinct crane counts for multiple visits in a single DB query.
    Returns {visit_id: count}.
    """
    if not visit_ids:
        return {}
    
    try:
        # Load crane operations for all visits
        df = load_from_db("crane", vessel_id=visit_ids)
        if df.empty:
            return {vid: 0 for vid in visit_ids}

        # Filter out excludes
        valid = df[df["exclude"] != "Yes"] if "exclude" in df.columns else df
        if valid.empty or "crane_id" not in valid.columns or "carrier_visit" not in valid.columns:
            return {vid: 0 for vid in visit_ids}

        # Group by carrier_visit and count unique cranes
        counts = valid.groupby("carrier_visit")["crane_id"].nunique().to_dict()
        return {str(vid): int(counts.get(vid, 0)) for vid in visit_ids}
    except Exception as exc:
        logger.warning("Batch crane fetch failed: %s", exc)
    return {vid: 0 for vid in visit_ids}

def _fetch_crane_stats_batch(visit_groups: dict) -> dict:
    """
    Fetches and computes crane statistics for a batch of vessel visits.
    """
    visit_ids = list(visit_groups.keys())
    if not visit_ids:
        return {}
    
    try:
        df = load_from_db("crane", vessel_id=visit_ids)
        if not df.empty:
            df = df.rename(columns={
                "time_completed": "crane_time",
                "from_position":  "crane_from",
                "to_position":    "crane_to",
                "move_kind":      "crane_move_kind",
            })
            df["crane_time"] = pd.to_datetime(df["crane_time"], errors="coerce")
    except Exception as exc:
        logger.warning("batch crane fetch failed: %s", exc)
        df = pd.DataFrame()

    out = {}
    crane_by_visit = {}
    if not df.empty and "carrier_visit" in df.columns:
        crane_by_visit = dict(tuple(df.groupby("carrier_visit")))

    for vid, vdf in visit_groups.items():
        container_count = int(vdf["unit_id"].nunique()) if "unit_id" in vdf.columns else len(vdf)
        crane_df = crane_by_visit.get(vid, pd.DataFrame())
        out[vid] = _compute_crane_stats(crane_df, container_count)
        
    return out

def _compute_crane_stats(crane_df: pd.DataFrame, container_count: int) -> dict:
    """
    Computes crane productivity (moves per hour), duration, and restow ratios for a visit.
    """
    empty_stats = {
        "_crane_move_count":      0,
        "_crane_effective_moves": 0,
        "_crane_count":           0.0,
        "_crane_duration_hours":  0.1,
        "_crane_mphc":            0.0,
        "_crane_intensity":       0.0,
        "_crane_restow_ratio":    0.0,
        "_crane_exclude_ratio":   0.0,
        "_crane_ids":             "[]",
    }
    if crane_df.empty:
        return empty_stats

    total_moves = len(crane_df)
    valid = crane_df[crane_df["exclude"] != "Yes"] if "exclude" in crane_df.columns else crane_df
    if valid.empty:
        return {**empty_stats, "_crane_move_count": total_moves}

    crane_count = int(valid["crane_id"].nunique()) if "crane_id" in valid.columns else 0
    IDLE_THRESHOLD_SEC = _settings.CRANE_IDLE_THRESHOLD_MINUTES * 60

    crane_mphs: list[float] = []
    total_active_hours = 0.0
    for _, cgrp in valid.groupby("crane_id"):
        sorted_times = cgrp["crane_time"].dropna().sort_values()
        if len(sorted_times) == 0:
            continue
        elif len(sorted_times) == 1:
            active_hrs = 3 / 60.0  # Default 3 minutes for a single isolated move
            total_active_hours += active_hrs
            crane_mphs.append(1 / active_hrs)
            continue
            
        gaps = sorted_times.diff().dt.total_seconds().dropna()
        active_gaps = gaps[gaps <= IDLE_THRESHOLD_SEC]
        if active_gaps.empty:
            active_hrs = len(sorted_times) * (3 / 60.0)
        else:
            active_hrs = max(active_gaps.sum() / 3600.0, 0.05)
        total_active_hours += active_hrs
        crane_mphs.append(len(cgrp) / active_hrs)

    eff = len(valid)
    mphc = round(sum(crane_mphs) / max(len(crane_mphs), 1), 2) if crane_mphs else 0.0

    restows = (
        len(valid[valid["crane_move_kind"].isin(["RESTOW", "SHIFT"])])
        if "crane_move_kind" in valid.columns else 0
    )
    crane_ids = valid["crane_id"].dropna().unique().tolist() if "crane_id" in valid.columns else []

    return {
        "_crane_move_count":      total_moves,
        "_crane_effective_moves": eff,
        "_crane_count":           float(crane_count),
        "_crane_duration_hours":  float(total_active_hours),
        "_crane_mphc":            float(mphc),
        "_crane_intensity":       float(eff / max(container_count, 1)),
        "_crane_restow_ratio":    float(restows / eff) if eff > 0 else 0.0,
        "_crane_exclude_ratio":   float((total_moves - eff) / total_moves) if total_moves > 0 else 0.0,
        "_crane_ids":             str(crane_ids[:8]),
    }

# Group enrichment
# Visit detail extraction
