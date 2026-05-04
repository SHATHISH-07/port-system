from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from utils.data_loader import load_csv
from db.queries import bulk_insert_df
from services.retraining_service import check_and_trigger_retraining
from utils.cache_utils import vessel_cache

router = APIRouter(prefix="/upload", tags=["Upload"])

# Upload historical container movement dataset
@router.post("/history")
async def upload_history(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # Check if the file is a CSV file
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")
    # Read the file content
    content = await file.read()
    try:
        # Load the CSV file into a DataFrame
        df = load_csv(content)
        # Insert the data into the database
        count = bulk_insert_df(df, "history")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
        
    vessel_cache.clear()
    check_and_trigger_retraining(background_tasks)

    return {
        "status": "ok",
        "dataset_type": "history",
        "rows_inserted": count,
        "message": f"Successfully stored {count} rows for historical analysis."
    }

# Upload current container movement dataset
@router.post("/current")
async def upload_current(file: UploadFile = File(...)):
    # Check if the file is a CSV file
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")
    # Read the file content
    content = await file.read()
    try:
        # Load the CSV file into a DataFrame
        df = load_csv(content)
        # Insert the data into the database
        count = bulk_insert_df(df, "current")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    vessel_cache.clear()

    return {
        "status": "ok",
        "dataset_type": "current",
        "rows_inserted": count,
        "message": f"Successfully stored {count} rows for current vessel analysis."
    }
