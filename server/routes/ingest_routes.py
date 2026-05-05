import logging
import json
from io import StringIO
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

import pandas as pd

from utils.data_loader import load_from_file, validate_dataframe
from db.queries import save_to_history, save_to_current
from utils.cache_utils import vessel_cache

logger = logging.getLogger("port_system")

router = APIRouter(prefix="/ingest", tags=["Ingest"])


# ─── Unified ingestion endpoint ───────────────────────────────────────────────
@router.post("/vessel-data")
async def ingest_vessel_data(
    file: Optional[UploadFile] = File(None),
    json_data: Optional[str] = Form(None),
):
    """
    Unified vessel data ingestion.
    Accepts either a CSV file upload OR a raw JSON string (form field: json_data).
    Data is saved to BOTH history (append) and current (upsert) tables.
    """
    errors: list[str] = []

    # ── Parse input ──────────────────────────────────────────────────────────
    if file is not None:
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="Only CSV files are accepted.")
        try:
            content = await file.read()
            df = load_from_file(content)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to parse CSV: {e}")

    elif json_data is not None:
        try:
            records = json.loads(json_data)
            if isinstance(records, dict):
                records = [records]
            df = pd.DataFrame(records)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to parse JSON: {e}")

    else:
        raise HTTPException(
            status_code=400,
            detail="No data provided. Supply either a CSV 'file' or a 'json_data' form field.",
        )

    # ── Validate ─────────────────────────────────────────────────────────────
    try:
        df = validate_dataframe(df)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=422, detail="Dataset is empty after validation.")

    records_processed = len(df)

    # ── Save to history (append) and current (upsert) ────────────────────────
    history_count = 0
    current_count = 0

    try:
        history_count = save_to_history(df)
    except Exception as e:
        logger.error(f"ingest: save_to_history failed: {e}")
        errors.append(f"History insert failed: {str(e)}")

    try:
        current_count = save_to_current(df)
    except Exception as e:
        logger.error(f"ingest: save_to_current failed: {e}")
        errors.append(f"Current upsert failed: {str(e)}")

    # ── Invalidate vessel cache ───────────────────────────────────────────────
    vessel_cache.clear()

    logger.info(
        f"Ingestion complete — {records_processed} rows; "
        f"history={history_count}, current={current_count}, errors={len(errors)}"
    )

    return {
        "status": "ok" if not errors else "partial",
        "records_processed": records_processed,
        "history_rows_saved": history_count,
        "current_rows_saved": current_count,
        "errors": errors,
        "message": (
            f"Successfully ingested {records_processed} records into history and current tables."
            if not errors
            else f"Ingested {records_processed} records with {len(errors)} error(s)."
        ),
    }
