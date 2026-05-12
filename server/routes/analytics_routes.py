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
                else "Suboptimal" if mphc < target * 0.7
                else "Acceptable"
            )
            crane_stats.append({
                "crane_id":           str(crane),
                "total_moves":        moves,
                "moves_per_hour":     round(mphc, 2),
                "productivity_rating": rating,
                "avg_cycle_minutes":  round(60.0 / mphc, 1) if mphc > 0 else 0,
                "restow_ratio":       round(restows / moves, 3),
            })

        # ── Per-visit allocation ──────────────────────────────────────────────
        visit_alloc: list[dict] = []
        for visit, grp in valid_df.groupby("carrier_visit"):
            visit_alloc.append({
                "visit_id":    str(visit),
                "crane_count": int(grp["crane_id"].nunique()),
                "total_moves": len(grp),
                "cranes_used": grp["crane_id"].unique().tolist()[:6],
            })
        visit_alloc.sort(key=lambda x: x["total_moves"], reverse=True)

        return {
            "summary":                summary,
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

        # ── History containers (count from core tables) ───────────────────────
        try:
            core_tbls = conn.execute(text("""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_history_containers_core'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            total_history = 0
            for (tbl,) in core_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                    total_history += (n or 0)
                except Exception:
                    pass
            counts["history_containers"] = total_history
        except Exception:
            counts["history_containers"] = 0

        # ── Current containers ────────────────────────────────────────────────
        try:
            curr_tbls = conn.execute(text("""
                SELECT relname FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_current_containers'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
            """)).fetchall()
            total_current = 0
            for (tbl,) in curr_tbls:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
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
                  AND relname LIKE '%_crane_movements'
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

        # ── Broken-out history sub-tables ─────────────────────────────────────
        for suffix in ["history_containers_cargo", "history_containers_position"]:
            try:
                sub_tbls = conn.execute(text(f"""
                    SELECT relname FROM pg_class
                    WHERE relkind IN ('r','p')
                      AND relname LIKE '%_{suffix}'
                      AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
                """)).fetchall()
                total_sub = 0
                for (tbl,) in sub_tbls:
                    try:
                        n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                        total_sub += (n or 0)
                    except Exception:
                        pass
                counts[suffix] = total_sub
            except Exception:
                counts[suffix] = 0

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
                    replace(relname, '_current_containers', '') AS yard_id
                FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_current_containers'
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
                    replace(relname, '_current_containers', '') AS yard_id
                FROM pg_class
                WHERE relkind IN ('r','p')
                  AND relname LIKE '%_current_containers'
                  AND oid NOT IN (SELECT inhrelid FROM pg_inherits)
                ORDER BY 1
            """)).fetchall()
        except Exception:
            rows = []

        for (yid,) in rows:
            info: dict = {"yard_id": yid}
            for suffix, label in [
                ("history_containers_core",     "history_rows"),
                ("current_containers",           "current_rows"),
                ("crane_movements",              "crane_rows"),
            ]:
                tbl = f"{yid}_{suffix}"
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                    info[label] = n or 0
                except Exception:
                    info[label] = 0
            result.append(info)

    return {"yards": result}