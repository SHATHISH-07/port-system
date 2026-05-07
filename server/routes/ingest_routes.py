import logging
import json
import hashlib
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form, HTTPException, Depends

import pandas as pd
from io import BytesIO

from utils.data_loader import validate_dataframe
from db.queries import save_to_history, save_to_current
from db.connection import get_engine
from services.retraining_service import check_and_trigger_retraining
from services.schema_mapper import (
    detect_dataset_type,
    suggest_mappings,
    apply_mappings,
    load_confirmed_mappings,
    get_default_terminal_id,
)
from services.canonical_transformer import (
    transform_container_inventory,
    transform_crane_moves,
    persist_canonical_data,
)
from utils.cache_utils import vessel_cache
from auth.dependencies import require_admin
from auth.utils import log_audit
from sqlalchemy import text

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/ingest", tags=["Ingest"])


def _hash_content(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]


def _create_raw_upload(
    conn,
    terminal_id: int,
    source_profile_id: Optional[int],
    filename: str,
    file_hash: str,
    file_size: int,
    dataset_type: str,
    detection_confidence: float,
    raw_row_count: int,
    uploaded_by: int,
) -> int:
    now = datetime.now(timezone.utc)
    row = conn.execute(text("""
        INSERT INTO raw_uploads
            (terminal_id, source_profile_id, filename, file_hash, file_size_bytes,
             dataset_type_detected, detection_confidence, status,
             uploaded_by, raw_row_count, created_at, updated_at)
        VALUES
            (:tid, :spid, :fn, :fhash, :fsize,
             :dtype, :dconf, 'processing',
             :uid, :rc, :now, :now)
        RETURNING id
    """), {
        "tid":   terminal_id,
        "spid":  source_profile_id,
        "fn":    filename,
        "fhash": file_hash,
        "fsize": file_size,
        "dtype": dataset_type,
        "dconf": detection_confidence,
        "uid":   uploaded_by,
        "rc":    raw_row_count,
        "now":   now,
    }).fetchone()
    return row[0]


def _create_ingestion_job(conn, raw_upload_id: int, records_total: int) -> int:
    now = datetime.now(timezone.utc)
    row = conn.execute(text("""
        INSERT INTO ingestion_jobs
            (raw_upload_id, status, records_total, started_at, created_at, updated_at)
        VALUES (:uid, 'processing', :total, :now, :now, :now)
        RETURNING id
    """), {"uid": raw_upload_id, "total": records_total, "now": now}).fetchone()
    return row[0]


def _update_job(conn, job_id: int, status: str, success: int, failed: int, errors: list):
    now = datetime.now(timezone.utc)
    conn.execute(text("""
        UPDATE ingestion_jobs
        SET status = :status, records_success = :ok, records_failed = :fail,
            error_log = :elog::jsonb, completed_at = :now, updated_at = :now
        WHERE id = :id
    """), {
        "id":     job_id,
        "status": status,
        "ok":     success,
        "fail":   failed,
        "elog":   json.dumps(errors[:20]),
        "now":    now,
    })


def _update_upload_status(conn, upload_id: int, status: str):
    conn.execute(text(
        "UPDATE raw_uploads SET status = :s, updated_at = :now WHERE id = :id"
    ), {"s": status, "id": upload_id, "now": datetime.now(timezone.utc)})


# ── Unified ingestion endpoint ──────────────────────────────────────────────
@router.post("/vessel-data")
async def ingest_vessel_data(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    json_data: Optional[str] = Form(None),
    source_profile_id: Optional[int] = Form(None),
    admin: dict = Depends(require_admin),
):
    """
    Unified ingestion endpoint.

    Flow:
      1. Parse file / JSON
      2. Save raw_upload record (always, for auditability)
      3. Detect dataset type
      4. Check for confirmed mappings for this source profile
         → If confirmed: apply silently
         → If none: return suggestions (status = pending_mapping)
      5. Apply canonical transformation
      6. Persist to canonical entity tables + legacy tables (backward compat)
      7. Trigger retraining check
    """
    errors: list[str] = []
    raw_content: bytes = b""
    filename: str = "raw_json_payload"

    # ── 1. Parse input ─────────────────────────────────────────────────────
    if file is not None:
        filename = file.filename or ""
        raw_content = await file.read()

        if filename.endswith(".csv"):
            try:
                df = pd.read_csv(BytesIO(raw_content))
            except Exception as e:
                raise HTTPException(422, f"Failed to parse CSV: {e}")

        elif filename.endswith(".json"):
            try:
                records = json.loads(raw_content.decode("utf-8"))
                if isinstance(records, dict):
                    records = [records]
                df = pd.DataFrame(records)
            except Exception as e:
                raise HTTPException(422, f"Failed to parse JSON file: {e}")

        else:
            raise HTTPException(400, "Unsupported file type. Only .csv or .json files are accepted.")

    elif json_data is not None:
        raw_content = json_data.encode("utf-8")
        try:
            records = json.loads(json_data)
            if isinstance(records, dict):
                records = [records]
            df = pd.DataFrame(records)
        except Exception as e:
            raise HTTPException(422, f"Failed to parse JSON body: {e}")

    else:
        raise HTTPException(400, "No data provided. Supply a .csv or .json file, or a 'json_data' form field.")

    if df.empty:
        raise HTTPException(422, "Dataset is empty.")

    raw_columns = list(df.columns)
    file_hash   = _hash_content(raw_content)
    terminal_id = get_default_terminal_id()

    # ── 2. Detect dataset type ─────────────────────────────────────────────
    source_profile = None
    if source_profile_id:
        engine = get_engine()
        with engine.connect() as conn:
            sp_row = conn.execute(text(
                "SELECT alias_map, detection_rules FROM source_profiles WHERE id = :id"
            ), {"id": source_profile_id}).fetchone()
            if sp_row:
                source_profile = {"alias_map": sp_row[0] or {}, "detection_rules": sp_row[1] or {}}

    detection   = detect_dataset_type(raw_columns, source_profile)
    dataset_type = detection["dataset_type"]
    d_confidence = detection["confidence"]

    # ── 3. Create raw_upload + ingestion_job ───────────────────────────────
    engine = get_engine()
    upload_id = None
    job_id = None
    try:
        with engine.begin() as conn:
            upload_id = _create_raw_upload(
                conn, terminal_id, source_profile_id,
                filename, file_hash, len(raw_content),
                dataset_type, d_confidence, len(df),
                admin["id"]
            )
            job_id = _create_ingestion_job(conn, upload_id, len(df))
    except Exception as e:
        logger.warning(f"[Ingest] Could not create audit records (canonical schema may not be initialized): {e}")

    # ── 4. Load or suggest mappings ────────────────────────────────────────
    confirmed_mappings = []
    if source_profile_id:
        confirmed_mappings = load_confirmed_mappings(source_profile_id)

    # If no confirmed mappings exist → return suggestions and halt ingestion
    # If no source_profile_id was provided, skip mapping gate entirely (backward compat)
    if not confirmed_mappings and source_profile_id and dataset_type != "unknown":
        suggestions = suggest_mappings(raw_columns, dataset_type, source_profile)
        try:
            with engine.begin() as conn:
                if upload_id:
                    _update_upload_status(conn, upload_id, "pending_mapping")
                if job_id:
                    conn.execute(text(
                        "UPDATE ingestion_jobs SET status = 'pending_mapping', updated_at = :now WHERE id = :id"
                    ), {"id": job_id, "now": datetime.now(timezone.utc)})
        except Exception as e:
            logger.warning(f"[Ingest] Could not update pending_mapping status: {e}")

        return {
            "status":             "pending_mapping",
            "message":            "No confirmed mappings found for this source profile. Please confirm the suggested field mappings and re-upload.",
            "upload_id":          upload_id,
            "job_id":             job_id,
            "dataset_type":       dataset_type,
            "detection_confidence": d_confidence,
            "suggested_mappings": suggestions,
            "total_columns":      len(raw_columns),
            "unmapped_columns":   sum(1 for s in suggestions if s.get("is_unmapped")),
        }

    # ── 5. Apply mappings → separate canonical from legacy ─────────────────
    # For container_inventory — legacy flow requires specific column names
    # Apply confirmed mappings if available, else treat as already-standard
    dynamic_attrs_series = None
    if confirmed_mappings:
        df_transformed, dynamic_attrs_series = apply_mappings(df, confirmed_mappings)
    else:
        df_transformed = df.copy()

    # ── 6a. Legacy persist (history + current) — backward compatible ───────
    history_count = 0
    current_count = 0

    if dataset_type == "container_inventory":
        try:
            legacy_df = validate_dataframe(df_transformed)
            if not legacy_df.empty:
                history_count = save_to_history(legacy_df)
                current_count = save_to_current(legacy_df)
        except Exception as e:
            logger.warning(f"[Ingest] Legacy pipeline skipped: {e}")
            errors.append(f"Legacy persist skipped: {str(e)}")

    # ── 6b. Canonical persist ─────────────────────────────────────────────
    canonical_counts = {"vessel_visits_saved": 0, "containers_saved": 0, "crane_moves_saved": 0}
    try:
        if dataset_type == "container_inventory":
            canonical_data = transform_container_inventory(
                df_transformed, terminal_id, source_profile_id, job_id, dynamic_attrs_series
            )
        elif dataset_type == "crane_moves":
            canonical_data = transform_crane_moves(
                df_transformed, terminal_id, source_profile_id, job_id, dynamic_attrs_series
            )
        else:
            canonical_data = {}

        if canonical_data:
            canonical_counts = persist_canonical_data(canonical_data, dataset_type)
    except Exception as e:
        logger.error(f"[Ingest] Canonical persist error: {e}", exc_info=True)
        errors.append(f"Canonical persist error: {str(e)}")

    # ── 7. Finalise job record ─────────────────────────────────────────────
    total_canonical = canonical_counts["containers_saved"] + canonical_counts["crane_moves_saved"]
    final_success   = max(history_count, total_canonical)
    final_status    = "completed" if not errors else "completed_with_errors"

    if job_id is not None:
        try:
            with engine.begin() as conn:
                _update_job(conn, job_id, final_status, final_success, len(errors), errors)
                if upload_id is not None:
                    _update_upload_status(conn, upload_id, final_status)
        except Exception as e:
            logger.warning(f"[Ingest] Could not update audit records: {e}")

    # ── 8. Side-effects ────────────────────────────────────────────────────
    vessel_cache.clear()
    if history_count > 0:
        check_and_trigger_retraining(background_tasks)

    log_audit(
        "Data Ingestion",
        f"Ingested {len(df)} rows | type={dataset_type} | job_id={job_id} | "
        f"legacy_history={history_count} legacy_current={current_count} | "
        f"canonical_containers={canonical_counts['containers_saved']} "
        f"crane_moves={canonical_counts['crane_moves_saved']}",
        admin["id"]
    )

    return {
        "status":              "ok" if not errors else "partial",
        "upload_id":           upload_id,
        "job_id":              job_id,
        "dataset_type":        dataset_type,
        "detection_confidence": d_confidence,
        "records_processed":   len(df),
        # ── Backward-compatible top-level keys ──────────────────────────────
        "history_rows_saved":  history_count,
        "current_rows_saved":  current_count,
        # ── Structured breakdown for new consumers ──────────────────────────
        "legacy": {
            "history_rows_saved": history_count,
            "current_rows_saved": current_count,
        },
        "canonical": canonical_counts,
        "errors":  errors,
        "message": (
            f"Successfully ingested {len(df)} records."
            if not errors else
            f"Ingested {len(df)} records with {len(errors)} non-critical error(s)."
        ),
    }


# ── Ingestion job status ────────────────────────────────────────────────────
@router.get("/jobs")
def list_ingestion_jobs(limit: int = 20, admin: dict = Depends(require_admin)):
    """List recent ingestion jobs with status and record counts."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT ij.id, ij.status, ij.records_total, ij.records_success,
                   ij.records_failed, ij.started_at, ij.completed_at,
                   ru.filename, ru.dataset_type_detected, ru.detection_confidence
            FROM ingestion_jobs ij
            LEFT JOIN raw_uploads ru ON ru.id = ij.raw_upload_id
            ORDER BY ij.created_at DESC
            LIMIT :lim
        """), {"lim": limit}).fetchall()

    return {
        "jobs": [
            {
                "job_id":              r[0],
                "status":              r[1],
                "records_total":       r[2],
                "records_success":     r[3],
                "records_failed":      r[4],
                "started_at":          r[5].isoformat() if r[5] else None,
                "completed_at":        r[6].isoformat() if r[6] else None,
                "filename":            r[7],
                "dataset_type":        r[8],
                "detection_confidence": float(r[9]) if r[9] else None,
            }
            for r in rows
        ]
    }


# ── Raw upload history ──────────────────────────────────────────────────────
@router.get("/uploads")
def list_raw_uploads(limit: int = 20, admin: dict = Depends(require_admin)):
    """List raw upload records with auditability metadata."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, filename, file_hash, file_size_bytes,
                   dataset_type_detected, detection_confidence,
                   status, raw_row_count, created_at
            FROM raw_uploads
            ORDER BY created_at DESC
            LIMIT :lim
        """), {"lim": limit}).fetchall()
    return {
        "uploads": [
            {
                "id":                   r[0],
                "filename":             r[1],
                "file_hash":            r[2],
                "file_size_bytes":      r[3],
                "dataset_type":         r[4],
                "detection_confidence": float(r[5]) if r[5] else None,
                "status":               r[6],
                "raw_row_count":        r[7],
                "uploaded_at":          r[8].isoformat() if r[8] else None,
            }
            for r in rows
        ]
    }
