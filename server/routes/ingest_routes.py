import logging
import json
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form, HTTPException

import pandas as pd

from utils.data_loader import load_from_file, validate_dataframe
from db.queries import save_to_history, save_to_current
from services.retraining_service import check_and_trigger_retraining
from utils.cache_utils import vessel_cache

logger = logging.getLogger("port_system")

router = APIRouter(prefix="/ingest", tags=["Ingest"])


# Unified ingestion endpoint — accepts CSV file, JSON file, or raw JSON form field
@router.post("/vessel-data")
async def ingest_vessel_data(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    json_data: Optional[str] = Form(None),
):
    errors: list[str] = []

    # ── Parse input ────────────────────────────────────────────────────────────
    if file is not None:
        filename = file.filename or ""

        if filename.endswith(".csv"):
            try:
                content = await file.read()
                df = load_from_file(content)
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"Failed to parse CSV: {e}")

        elif filename.endswith(".json"):
            try:
                content = await file.read()
                records = json.loads(content.decode("utf-8"))
                if isinstance(records, dict):
                    records = [records]
                df = pd.DataFrame(records)
            except Exception as e:
                raise HTTPException(status_code=422, detail=f"Failed to parse JSON file: {e}")

        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Only .csv or .json files are accepted.",
            )

    elif json_data is not None:
        try:
            records = json.loads(json_data)
            if isinstance(records, dict):
                records = [records]
            df = pd.DataFrame(records)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to parse JSON body: {e}")

    else:
        raise HTTPException(
            status_code=400,
            detail="No data provided. Supply a .csv or .json file, or a 'json_data' form field.",
        )

    # ── Validate ───────────────────────────────────────────────────────────────
    try:
        df = validate_dataframe(df)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=422, detail="Dataset is empty after validation.")

    records_processed = len(df)

    # ── Persist ────────────────────────────────────────────────────────────────
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

    # ── Side-effects ───────────────────────────────────────────────────────────
    vessel_cache.clear()

    if history_count > 0:
        check_and_trigger_retraining(background_tasks)

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
