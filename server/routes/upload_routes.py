from fastapi import APIRouter, UploadFile, File, HTTPException
from utils.data_loader import load_csv
from db.queries import bulk_insert_df

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("/history")
async def upload_history(file: UploadFile = File(...)):
    """
    Upload the historical container movement dataset.
    All rows are stored in PostgreSQL under dataset_type='history'.
    Existing historical data is replaced on each upload.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    content = await file.read()
    try:
        df = load_csv(content)
        count = bulk_insert_df(df, "history")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "status": "ok",
        "dataset_type": "history",
        "rows_inserted": count,
        "message": f"Successfully stored {count} rows for historical analysis."
    }


@router.post("/current")
async def upload_current(file: UploadFile = File(...)):
    """
    Upload the current/live container movement dataset.
    All rows are stored in PostgreSQL under dataset_type='current'.
    Existing current data is replaced on each upload.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    content = await file.read()
    try:
        df = load_csv(content)
        count = bulk_insert_df(df, "current")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "status": "ok",
        "dataset_type": "current",
        "rows_inserted": count,
        "message": f"Successfully stored {count} rows for current vessel analysis."
    }
