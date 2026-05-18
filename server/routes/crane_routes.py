from __future__ import annotations

import logging

import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from auth.dependencies import get_current_user, require_admin
from db.connection import get_engine
from db.queries import load_from_db

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/crane", tags=["Crane Analytics"])


def _net_active_hours(time_series: pd.Series, idle_threshold_sec: float = 1800) -> float:
    """
    Calculate NET active working hours from a series of timestamps.
    
    Only counts the time between consecutive moves where the gap is
    ≤ idle_threshold_sec (default 30 min). Longer gaps are treated as
    crane idle / off-shift time and excluded.
    
    This gives realistic MPH: a crane making 75 moves with 2-3 minute
    cycles shows ~20+ MPH instead of ~2 MPH (which would include 
    overnight idle time).
    """
    sorted_times = time_series.dropna().sort_values()
    if len(sorted_times) < 2:
        return max(len(sorted_times) * (1 / 60), 0.05)  # ~1 min per move minimum
    
    gaps = sorted_times.diff().dt.total_seconds().dropna()
    # Only count gaps that are within the active working threshold
    active_gaps = gaps[gaps <= idle_threshold_sec]
    
    if active_gaps.empty:
        # All gaps exceed threshold — estimate 3 min per move as minimum
        return len(sorted_times) * (3 / 60)
    
    active_seconds = active_gaps.sum()
    return max(active_seconds / 3600, 0.05)  # floor at ~3 minutes


# ─────────────────────────────────────────────────────────────────────────────
# GET /analytics/crane-performance
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/crane-performance")
def get_crane_performance(
    limit:    int  = Query(1000, alias="limit"),
    days:     int  = Query(None, alias="days"),
    crane_id: str  = Query(None, alias="craneId"),
    yard_id:  str  = Query(None, alias="yardId"),
    user:     dict = Depends(get_current_user),
):
    """
    Return crane performance KPIs across all yards.

    Optional filters:
      - days     : only consider moves in the last N days
      - crane_id : filter to a specific crane (craneId)
      - yard_id  : filter to a specific yard (yardId)
      - limit    : max raw move rows returned
    """
    from config import settings
    engine = get_engine()

    if days is None:
        days = settings.CRANE_ANALYTICS_WINDOW_DAYS

    try:
        cols = ["crane_id", "time_completed", "yard_id", "exclude", "carrier_visit", "move_kind"]
        df = load_from_db("crane", days=days, columns=cols)

        if df.empty:
            return _empty_crane_response()

        df["time_completed"] = pd.to_datetime(df["time_completed"], errors="coerce")
        df = df.dropna(subset=["time_completed"])

        if days and days > 0:
            cutoff   = pd.Timestamp.now() - pd.Timedelta(days=days)
            filtered = df[df["time_completed"] >= cutoff]
            if not filtered.empty:
                df = filtered

        if df.empty:
            return _empty_crane_response()

        # All crane IDs (for frontend dropdown, before per-crane filter)
        available_cranes = sorted(df["crane_id"].dropna().unique().tolist())

        if crane_id:
            df = df[df["crane_id"].astype(str).str.strip().str.upper() == crane_id.strip().upper()]
            if df.empty:
                return {**_empty_crane_response(), "available_cranes": available_cranes}

        if yard_id and "yard_id" in df.columns:
            df = df[df["yard_id"].astype(str).str.strip().str.upper() == yard_id.strip().upper()]
            if df.empty:
                return {**_empty_crane_response(), "available_cranes": available_cranes}

        sorted_df = df.sort_values("time_completed", ascending=False).head(limit)
        raw_moves = sorted_df.to_dict(orient="records")

        valid_df     = df[df["exclude"] != "Yes"] if "exclude" in df.columns else df
        total_valid  = len(valid_df)
        total_moves  = len(df)

        summary = {
            "total_moves":           total_moves,
            "effective_moves":       total_valid,
            "anomaly_rate":          round(1.0 - (total_valid / max(total_moves, 1)), 3),
            "active_cranes":         int(valid_df["crane_id"].nunique()),
            "unique_visits_served":  int(valid_df["carrier_visit"].nunique()),
        }

        # ── Yard-level breakdown ──────────────────────────────────────────────
        yard_stats: list[dict] = []
        idle_threshold_sec = settings.CRANE_IDLE_THRESHOLD_MINUTES * 60  # 30 min

        # Precompute Net MPH per (yard, crane, visit) to avoid redundant loops
        net_mph_cache = {}
        if not valid_df.empty and "yard_id" in valid_df.columns:
            for (yard, crane, visit), grp in valid_df.groupby(["yard_id", "crane_id", "carrier_visit"]):
                active_hrs = _net_active_hours(grp["time_completed"], idle_threshold_sec)
                if active_hrs > 0 and len(grp) >= 2:
                    net_mph_cache[(yard, crane, visit)] = len(grp) / active_hrs

        if "yard_id" in valid_df.columns:
            for yard, ygrp in valid_df.groupby("yard_id"):
                ymoves = len(ygrp)
                ycranes = int(ygrp["crane_id"].nunique())
                yvisits = int(ygrp["carrier_visit"].nunique())
                
                # Fetch precomputed MPHs for this yard
                visit_mphs = [mph for (y, c, v), mph in net_mph_cache.items() if y == yard]
                avg_crane_mph = round(sum(visit_mphs) / max(len(visit_mphs), 1), 2) if visit_mphs else 0.0
                
                # Gross Output (Terminal moves per total clock hour)
                ymin_t = ygrp["time_completed"].min()
                ymax_t = ygrp["time_completed"].max()
                ydur = max((ymax_t - ymin_t).total_seconds() / 3600, 1.0) if pd.notna(ymin_t) and pd.notna(ymax_t) else 1.0
                gross_mph = ymoves / ydur
                
                yard_stats.append({
                    "terminal_name": f"{yard.upper()} Terminal",
                    "total_system_moves": ymoves,
                    "active_cranes_count": ycranes,
                    "unique_vessel_visits": yvisits,
                    "gross_terminal_mph": round(gross_mph, 2),
                    "avg_crane_productivity": round(avg_crane_mph, 2)
                })

        # ── Move kind distribution ───────────────────────────────────────────
        move_dist: dict[str, int] = {}
        if "move_kind" in valid_df.columns:
            move_dist = valid_df["move_kind"].value_counts().to_dict()

        # ── Per-crane stats ───────────────────────────────────────────────────
        crane_stats: list[dict] = []
        for (crane, yard), grp in valid_df.groupby(["crane_id", "yard_id"]):
            moves  = len(grp)
            
            # Fetch precomputed MPHs for this crane and yard
            crane_visit_mphs = [mph for (y, c, v), mph in net_mph_cache.items() if c == crane and y == yard]
            
            mphc = round(sum(crane_visit_mphs) / max(len(crane_visit_mphs), 1), 2) if crane_visit_mphs else 0.0
            
            restows = (
                len(grp[grp["move_kind"].isin(["RESTOW", "SHIFT"])])
                if "move_kind" in grp.columns else 0
            )
            target  = settings.CRANE_MOVES_PER_HOUR_TARGET
            rating  = (
                "Optimal"    if mphc >= target
                else "Below Target" if mphc < target * 0.7
                else "Satisfactory"
            )
            
            # Additional detail: most frequent visit for this crane
            top_visit = grp["carrier_visit"].mode().iloc[0] if not grp["carrier_visit"].empty else "N/A"
            
            crane_stats.append({
                "crane_id":           str(crane),
                "total_moves":        moves,
                "moves_per_hour":     round(mphc, 2),
                "productivity_rating": rating,
                "avg_cycle_minutes":  round(60.0 / mphc, 1) if mphc > 0 else 0,
                "restow_ratio":       round(restows / moves, 3),
                "yard_id":            str(yard),
                "primary_visit":      str(top_visit)
            })

        # ── Per-visit allocation ──────────────────────────────────────────────
        visit_alloc: list[dict] = []
        if not valid_df.empty:
            for visit, grp in valid_df.groupby("carrier_visit"):
                visit_alloc.append({
                    "visit_id":    str(visit),
                    "crane_count": int(grp["crane_id"].nunique()),
                    "total_moves": len(grp),
                    "cranes_used": grp["crane_id"].unique().tolist()[:6],
                    "yard_id":     str(grp["yard_id"].iloc[0]) if "yard_id" in grp.columns else "N/A"
                })
        visit_alloc.sort(key=lambda x: x["total_moves"], reverse=True)

        return {
            "summary":                summary,
            "yard_stats":             yard_stats,
            "move_kind_distribution": move_dist,
            "crane_stats":            crane_stats,
            "visit_crane_allocation": visit_alloc,
            "moves":                  raw_moves,
            "available_cranes":       available_cranes,
            "selected_crane":         crane_id,
        }

    except Exception as e:
        logger.error("Error fetching crane performance: %s", e)
        return {**_empty_crane_response(), "error": str(e)}


def _empty_crane_response() -> dict:
    return {
        "summary":                {},
        "crane_stats":            [],
        "visit_crane_allocation": [],
        "hourly_productivity":    [],
        "moves":                  [],
        "available_cranes":       [],
    }


