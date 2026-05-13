from __future__ import annotations

import logging

import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy import text

from auth.dependencies import get_current_user, require_admin
from db.connection import get_engine
from db.queries import load_from_db

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ─────────────────────────────────────────────────────────────────────────────
# GET /analytics/crane-performance
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/crane-performance")
def get_crane_performance(
    limit:    int  = 1000,
    days:     int  = None,
    crane_id: str  = None,
    user:     dict = Depends(get_current_user),
):
    """
    Return crane performance KPIs across all yards.

    Optional filters:
      - days     : only consider moves in the last N days
      - crane_id : filter to a specific crane
      - limit    : max raw move rows returned
    """
    from config import settings
    engine = get_engine()

    if days is None:
        days = settings.CRANE_ANALYTICS_WINDOW_DAYS

    try:
        df = load_from_db("crane")

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
            df = df[df["crane_id"].astype(str).str.strip() == crane_id.strip()]
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
        if "yard_id" in valid_df.columns:
            for yard, ygrp in valid_df.groupby("yard_id"):
                ymoves = len(ygrp)
                ycranes = int(ygrp["crane_id"].nunique())
                yvisits = int(ygrp["carrier_visit"].nunique())
                
                # High-precision crane-hour calculation
                total_crane_hours = 0.0
                for _, cgrp in ygrp.groupby("crane_id"):
                    cmin = cgrp["time_completed"].min()
                    cmax = cgrp["time_completed"].max()
                    if pd.notna(cmin) and pd.notna(cmax):
                        # Use actual duration, floor at 6 minutes (0.1h) for single-move instances
                        total_crane_hours += max((cmax - cmin).total_seconds() / 3600, 0.1)
                
                # Gross Output (Terminal moves per total clock hour)
                ymin_t = ygrp["time_completed"].min()
                ymax_t = ygrp["time_completed"].max()
                ydur = max((ymax_t - ymin_t).total_seconds() / 3600, 1.0) if pd.notna(ymin_t) and pd.notna(ymax_t) else 1.0
                gross_mph = ymoves / ydur
                
                # Average asset efficiency
                avg_crane_mph = ymoves / max(total_crane_hours, 0.1)
                
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
        for crane, grp in valid_df.groupby("crane_id"):
            moves  = len(grp)
            min_t  = grp["time_completed"].min()
            max_t  = grp["time_completed"].max()
            dur    = (
                max((max_t - min_t).total_seconds() / 3600, 0.1)
                if pd.notna(min_t) and pd.notna(max_t) else 0.1
            )
            mphc    = min(moves / dur, 999.0)
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
                "yard_id":            str(grp["yard_id"].iloc[0]) if "yard_id" in grp.columns else "N/A",
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


# ─────────────────────────────────────────────────────────────────────────────
# GET /analytics/summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/summary")
def get_system_summary(admin: dict = Depends(require_admin)):
    """
    System-wide record counts for all yards and support tables.

    History rows are counted from the *_history_containers_core tables
    (one row per container per visit, regardless of the split into
    cargo / position tables).
    """
    engine = get_engine()
    counts: dict = {}

    with engine.connect() as conn:

        # ── History/Operational containers ────────────────────────────────────
        try:
            ops_tbls = conn.execute(text("""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_container_operations'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            total_history = 0
            for (tbl,) in ops_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl} WHERE record_type = 'history'")).scalar()
                    total_history += (n or 0)
                except Exception:
                    pass
            counts["history_containers"] = total_history
        except Exception:
            counts["history_containers"] = 0

        # ── Current containers (Dynamic Extraction count) ─────────────────────
        try:
            total_current = 0
            for (tbl,) in ops_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl} WHERE time_out IS NULL")).scalar()
                    total_current += (n or 0)
                except Exception:
                    pass
            counts["current_containers"] = total_current
        except Exception:
            counts["current_containers"] = 0


        # ── Crane movements ───────────────────────────────────────────────────
        try:
            crane_tbls = conn.execute(text("""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_crane_operations'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            total_crane = 0
            for (tbl,) in crane_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                    total_crane += (n or 0)
                except Exception:
                    pass
            counts["crane_movements"] = total_crane
        except Exception:
            counts["crane_movements"] = 0

        # ── Vessel visits ─────────────────────────────────────────────────────
        try:
            vv_tbls = conn.execute(text("""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_vessel_visits'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            total_vv = 0
            for (tbl,) in vv_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                    total_vv += (n or 0)
                except Exception:
                    pass
            counts["vessel_visits"] = total_vv
        except Exception:
            counts["vessel_visits"] = 0

        # ── Support tables ────────────────────────────────────────────────────
        for table in ["ingestion_logs", "rejection_logs", "users", "training_metadata"]:
            try:
                counts[table] = conn.execute(
                    text(f"SELECT COUNT(*) FROM {table}")
                ).scalar()
            except Exception:
                counts[table] = 0

        # ── Discovered yards ──────────────────────────────────────────────────
        try:
            yard_rows = conn.execute(text("""
                SELECT DISTINCT
                    replace(relname, '_container_operations', '') AS yard_id
                FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_container_operations'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
                ORDER BY 1
            """)).fetchall()
            counts["yards"] = [r[0] for r in yard_rows]
        except Exception:
            counts["yards"] = []

        # ── Recent ingestion log ──────────────────────────────────────────────
        try:
            recent_logs = conn.execute(text("""
                SELECT id, filename, dataset_type, status,
                       records_total, completed_at
                FROM ingestion_logs
                ORDER BY created_at DESC
                LIMIT 5
            """)).fetchall()
        except Exception:
            recent_logs = []

    return {
        "counts":            counts,
        "recent_ingestions": [dict(r._mapping) for r in recent_logs],
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /analytics/yards
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/yards")
def list_yards(user: dict = Depends(get_current_user)):
    """Return all discovered yard IDs with their table counts."""
    engine = get_engine()
    result: list[dict] = []

    with engine.connect() as conn:
        try:
            rows = conn.execute(text("""
                SELECT
                    replace(relname, '_container_operations', '') AS yard_id
                FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_container_operations'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
                ORDER BY 1
            """)).fetchall()
        except Exception:
            rows = []

        for (yid,) in rows:
            info: dict = {"yard_id": yid}
            for suffix, label in [
                ("container_operations", "history_rows"),
                ("vessel_visits",       "visit_summaries"),
                ("crane_operations",    "crane_rows"),
            ]:
                tbl = f"{yid}_{suffix}"
                try:
                    if suffix == "container_operations":
                        n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl} WHERE record_type = 'history'")).scalar()
                    else:
                        n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                    info[label] = n or 0
                except Exception:
                    info[label] = 0
            result.append(info)

    return {"yards": result}