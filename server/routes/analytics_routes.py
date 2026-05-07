"""Analytics routes — crane move stats, canonical container summary, ingestion job stats."""
from fastapi import APIRouter, Depends
from auth.dependencies import require_admin
from db.connection import get_engine
from sqlalchemy import text

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/crane-moves")
def get_crane_moves(limit: int = 500, admin: dict = Depends(require_admin)):
    """Return recent canonical crane moves for the analytics dashboard."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, canonical_crane_id, canonical_unit_id, carrier_visit,
                       move_kind, from_position, to_position, time_completed,
                       line_op, excluded, dynamic_attributes
                FROM canonical_crane_moves
                ORDER BY time_completed DESC NULLS LAST
                LIMIT :lim
            """), {"lim": limit}).fetchall()
    except Exception:
        return {"moves": [], "total": 0}

    return {
        "moves": [
            {
                "id":                str(r[0]),
                "canonical_crane_id": r[1],
                "canonical_unit_id":  r[2],
                "carrier_visit":     r[3],
                "move_kind":         r[4],
                "from_position":     r[5],
                "to_position":       r[6],
                "time_completed":    r[7].isoformat() if r[7] else None,
                "line_op":           r[8],
                "excluded":          r[9],
                "dynamic_attributes": r[10] or {},
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.get("/ingestion-summary")
def get_ingestion_summary(admin: dict = Depends(require_admin)):
    """Return ingestion pipeline statistics."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            job_stats = conn.execute(text("""
                SELECT status, COUNT(*) as cnt
                FROM ingestion_jobs
                GROUP BY status
            """)).fetchall()

            upload_stats = conn.execute(text("""
                SELECT dataset_type_detected, COUNT(*) as cnt
                FROM raw_uploads
                GROUP BY dataset_type_detected
            """)).fetchall()

            recent = conn.execute(text("""
                SELECT ij.id, ij.status, ij.records_total, ij.records_success,
                       ru.filename, ru.dataset_type_detected, ij.completed_at
                FROM ingestion_jobs ij
                LEFT JOIN raw_uploads ru ON ru.id = ij.raw_upload_id
                ORDER BY ij.created_at DESC LIMIT 10
            """)).fetchall()
    except Exception:
        return {"job_stats": [], "upload_stats": [], "recent_jobs": []}

    return {
        "job_stats": [{"status": r[0], "count": r[1]} for r in job_stats],
        "upload_stats": [{"dataset_type": r[0], "count": r[1]} for r in upload_stats],
        "recent_jobs": [
            {
                "job_id":        r[0],
                "status":        r[1],
                "records_total": r[2],
                "records_ok":    r[3],
                "filename":      r[4],
                "dataset_type":  r[5],
                "completed_at":  r[6].isoformat() if r[6] else None,
            }
            for r in recent
        ],
    }


@router.get("/canonical-summary")
def get_canonical_summary(admin: dict = Depends(require_admin)):
    """Return counts of all canonical entity tables."""
    engine = get_engine()
    counts: dict = {}
    for table in ["canonical_vessel_visits", "canonical_containers", "canonical_crane_moves",
                  "organizations", "terminals", "yards", "source_profiles", "schema_mappings",
                  "raw_uploads", "ingestion_jobs", "model_versions"]:
        try:
            with engine.connect() as conn:
                val = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                counts[table] = val or 0
        except Exception:
            counts[table] = None
    return {"entity_counts": counts}
