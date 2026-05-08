import logging
import hashlib
import json
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
import pandas as pd
from io import BytesIO
from sqlalchemy import text

from config import settings
from db.connection import get_engine
from auth.dependencies import require_admin
from auth.utils import log_audit
from services.retraining_service import check_and_trigger_retraining

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/ingest", tags=["Ingestion"])

# ── Fixed Schemas (Aligned with config.py) ──────────────────────────────────
HISTORY_HEADERS = settings.EXPECTED_HEADERS["history"]
CURRENT_HEADERS = settings.EXPECTED_HEADERS["current"]
CRANE_HEADERS   = settings.EXPECTED_HEADERS["crane"]

def _get_file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]

def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize headers: lowercase, strip, and apply comprehensive alias mapping."""
    # Step 1: Basic cleanup — lowercase, strip, replace spaces/dashes/parens
    new_cols = []
    for c in df.columns:
        c = str(c).lower().strip()
        c = c.replace(" ", "_").replace("-", "_")
        c = c.replace("(", "").replace(")", "")
        new_cols.append(c)
    df.columns = new_cols

    # Step 2: Comprehensive alias mapping covering all known dataset variants
    mapping = {
        # Unit / container ID
        "unit_id":                              "unit_id",
        "unit": "unit_id",
        "unit_nbr":                             "unit_id",
        "container_id":                         "unit_id",

        # Carrier visit / vessel visit
        "actual_outbound_carrier_visit_id":     "actual_outbound_carrier_visit_id",
        "actual_outbound_carrier_visit":        "actual_outbound_carrier_visit_id",
        "vessel_visit_id":                      "actual_outbound_carrier_visit_id",
        "visit_id":                             "actual_outbound_carrier_visit_id",
        "vessel_visit":                         "actual_outbound_carrier_visit_id",

        # Outbound service / vessel name
        "outbound_service":                     "outbound_service",
        "vessel":                               "outbound_service",
        "service":                              "outbound_service",
        "vessel_id":                            "outbound_service",

        # Timestamps — history
        "move_complete_time":                   "move_complete_time",
        "completed":                            "move_complete_time",
        "time_in":                              "time_in",
        "time_out":                             "time_out",

        # Container positions
        "ctr_from_position":                    "ctr_from_position",
        "from_position":                        "ctr_from_position",
        "from":                                 "ctr_from_position",
        "current_position":                     "ctr_from_position",  # current dataset
        "ctr_to_position":                      "ctr_to_position",
        "to_position":                          "ctr_to_position",
        "to":                                   "ctr_to_position",

        # Weight
        "verified_gross_mass_kg":               "verified_gross_mass_kg",
        "verified_gross_mass_kg_":              "verified_gross_mass_kg",  # paren removed variant
        "vgm":                                  "verified_gross_mass_kg",
        "gross_mass_kg":                        "verified_gross_mass_kg",
        "unit_weight_in_kg":                    "unit_weight_in_kg",
        "weight":                               "unit_weight_in_kg",

        # Flags
        "reefer":                               "reefer",
        "oog_unit":                             "oog_unit",
        "hazardous_flag":                       "hazardous_flag",
        "hazardous":                            "hazardous_flag",
        "port_of_discharge":                    "port_of_discharge",

        # Crane dataset specific
        "crane_id":                             "crane_id",
        "crane_che":                            "crane_id",
        "crane":                                "crane_id",
        "move_kind":                            "move_kind",
        "kind":                                 "move_kind",
        "event_type":                           "move_kind",   # crane event type → move_kind
        "carrier_visit":                        "carrier_visit",
        "time_completed":                       "time_completed",
        "line_op":                              "line_op",

        # Alternate crane column names
        "unit_nbr":                             "unit_id",  # crane dataset uses Unit Nbr
    }

    # Apply mapping while protecting against duplicate column names
    current_cols = list(df.columns)
    final_cols = []
    for col in current_cols:
        mapped = mapping.get(col, col)
        if mapped in final_cols:
            suffix = 1
            temp_name = f"{mapped}_{suffix}"
            while temp_name in final_cols:
                suffix += 1
                temp_name = f"{mapped}_{suffix}"
            final_cols.append(temp_name)
        else:
            final_cols.append(mapped)

    df.columns = final_cols
    return df

def parse_dates(df: pd.DataFrame, columns: List[str]) -> pd.DataFrame:
    """Explicitly parse date columns to avoid DB format errors."""
    for col in columns:
        if col in df.columns:
            try:
                # Use errors='coerce' to turn unparseable dates into NaT
                df[col] = pd.to_datetime(df[col], errors='coerce')
            except Exception as e:
                logger.warning(f"Failed to parse date column {col}: {e}")
    return df

def _log_ingestion(conn, filename, fhash, dtype, status, total, accepted, rejected, user_id, error=""):
    now = datetime.now(timezone.utc)
    res = conn.execute(text("""
        INSERT INTO ingestion_logs 
            (filename, file_hash, dataset_type, status, records_total, 
             records_accepted, records_rejected, uploaded_by, completed_at, error_summary)
        VALUES 
            (:fn, :hash, :type, :status, :total, :acc, :rej, :uid, :now, :err)
        RETURNING id
    """), {
        "fn": filename, "hash": fhash, "type": dtype, "status": status,
        "total": total, "acc": accepted, "rej": rejected, "uid": user_id,
        "now": now, "err": error
    })
    return res.fetchone()[0]

class IngestionEncoder(json.JSONEncoder):
    """Custom JSON encoder for ingestion logs (handles Timestamps/NaN)."""
    def default(self, obj):
        if pd.isna(obj): return None
        if isinstance(obj, pd.Timestamp): return obj.isoformat()
        if hasattr(obj, 'tolist'): return obj.tolist()
        return super().default(obj)

def _log_rejection(conn, ingestion_id, row_data, reason):
    # Ensure row_data is serializable
    clean_data = {k: (None if pd.isna(v) else (v.isoformat() if isinstance(v, pd.Timestamp) else v)) 
                  for k, v in row_data.items()}
    conn.execute(text("""
        INSERT INTO rejection_logs (ingestion_id, row_data, reason)
        VALUES (:id, :data, :reason)
    """), {"id": ingestion_id, "data": json.dumps(clean_data, cls=IngestionEncoder), "reason": reason})

# ── Validation ──────────────────────────────────────────────────────────────

def validate_row(dtype: str, row: dict) -> Optional[str]:
    """Basic row-level validation — only reject on truly critical missing fields."""
    if dtype == "history":
        if not row.get("unit_id"): return "Missing unit_id"
        if not row.get("actual_outbound_carrier_visit_id"): return "Missing vessel visit ID"
        if not row.get("outbound_service"): return "Missing outbound_service"
        # Only reject if the timestamp was provided but is invalid (NaT)
        for f in ["move_complete_time"]:
            val = row.get(f)
            if val is not None and pd.isnull(val):
                return f"Invalid timestamp in {f}"

    elif dtype == "current":
        if not row.get("unit_id"): return "Missing unit_id"
        if not row.get("actual_outbound_carrier_visit_id"): return "Missing vessel visit ID"
        if not row.get("outbound_service"): return "Missing outbound_service"

    elif dtype == "crane":
        if not row.get("crane_id"): return "Missing crane_id"
        if not row.get("carrier_visit"): return "Missing carrier_visit"
        val = row.get("time_completed")
        if val is None or (hasattr(val, '__class__') and val.__class__.__name__ == 'NaTType'):
            pass  # Allow null timestamps for crane — use None

    return None

# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_data(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin)
):
    """Simplified ingestion endpoint with header normalization."""
    content = await file.read()
    fhash = _get_file_hash(content)
    
    try:
        if file.filename.endswith(".xlsx") or file.filename.endswith(".xls"):
            # First read with header=None to find the actual header row
            temp_df = pd.read_excel(BytesIO(content), header=None, nrows=10)
            header_row = 0
            for i, row in temp_df.iterrows():
                # Check if this row looks like a header (contains known keywords)
                row_vals = [str(v).lower() for v in row.values if pd.notna(v)]
                if any(k in row_vals for k in ["unit_id", "unit id", "unit nbr", "time completed", "move complete time"]):
                    header_row = i
                    break
            df = pd.read_excel(BytesIO(content), header=header_row)
        else:
            df = pd.read_csv(BytesIO(content), low_memory=False)
    except Exception as e:
        raise HTTPException(400, f"Invalid file format: {str(e)}")

    if df.empty:
        raise HTTPException(400, "File is empty")

    # Normalize Headers
    df = normalize_dataframe(df)
    
    # DROP NULL/EMPTY ROWS EARLY
    # 1. Drop rows that are completely empty
    df = df.dropna(how='all')
    # 2. Drop rows where unit_id is null/empty (if it exists)
    if 'unit_id' in df.columns:
        df = df[df['unit_id'].notna() & (df['unit_id'].astype(str).str.strip() != "")]
    
    headers = list(df.columns)
    dataset_type = None

    # Identify dataset type based on post-normalization columns.
    # Priority: crane (has crane_id), history (has time_in/time_out), current (everything else)
    if "crane_id" in headers and "carrier_visit" in headers:
        dataset_type = "crane"
    elif "unit_id" in headers and "actual_outbound_carrier_visit_id" in headers:
        if "time_in" in headers or "time_out" in headers:
            dataset_type = "history"
        else:
            dataset_type = "current"

    if not dataset_type:
        raise HTTPException(400, f"Invalid headers. Could not identify dataset type. Found: {headers}")

    engine = get_engine()
    
    # Idempotency Check
    with engine.connect() as conn:
        existing = conn.execute(text(
            "SELECT id FROM ingestion_logs WHERE file_hash = :h AND status = 'success'"
        ), {"h": fhash}).fetchone()
        if existing:
            return {"status": "skipped", "message": "File already ingested successfully", "ingestion_id": existing[0]}

    # Ensure all expected headers exist in df (fill with None if missing)
    expected = []
    date_cols = []
    if dataset_type == "history": 
        expected = HISTORY_HEADERS
        date_cols = ["move_complete_time", "time_in", "time_out"]
    elif dataset_type == "current": 
        expected = CURRENT_HEADERS
        date_cols = ["move_complete_time"]
    elif dataset_type == "crane": 
        expected = CRANE_HEADERS
        date_cols = ["time_completed"]
    
    # Pre-parse dates to avoid psycopg2 format issues
    df = parse_dates(df, date_cols)

    for col in expected:
        if col not in df.columns:
            df[col] = None

    records = df.to_dict('records')
    total = len(records)
    accepted = []
    rejected = []

    for row in records:
        error = validate_row(dataset_type, row)
        if error:
            rejected.append({"row": row, "reason": error})
        else:
            # Clean up NaN for JSON/DB
            clean_row = {k: (None if pd.isna(v) else v) for k, v in row.items()}
            accepted.append(clean_row)

    status = "success" if not rejected else ("partial" if accepted else "failed")
    
    with engine.begin() as conn:
        ingestion_id = _log_ingestion(
            conn, file.filename, fhash, dataset_type, status, 
            total, len(accepted), len(rejected), admin["id"]
        )
        
        for rej in rejected:
            _log_rejection(conn, ingestion_id, rej["row"], rej["reason"])
            
        if accepted:
            if dataset_type == "history":
                conn.execute(text("""
                    INSERT INTO history_containers 
                        (unit_id, actual_outbound_carrier_visit_id, outbound_service, 
                         move_complete_time, time_in, time_out, ctr_from_position, 
                         ctr_to_position, verified_gross_mass_kg, unit_weight_in_kg, 
                         reefer, hazardous_flag, oog_unit, port_of_discharge, ingestion_id)
                    VALUES 
                        (:unit_id, :actual_outbound_carrier_visit_id, :outbound_service, 
                         :move_complete_time, :time_in, :time_out, :ctr_from_position, 
                         :ctr_to_position, :verified_gross_mass_kg, :unit_weight_in_kg, 
                         :reefer, :hazardous_flag, :oog_unit, :port_of_discharge, :ingestion_id)
                """), [ {**r, "ingestion_id": ingestion_id} for r in accepted ])
                
            elif dataset_type == "current":
                for r in accepted:
                    conn.execute(text("""
                        INSERT INTO current_containers 
                            (unit_id, actual_outbound_carrier_visit_id, outbound_service, 
                             ctr_from_position, ctr_to_position, move_complete_time, 
                             reefer, hazardous_flag, port_of_discharge, ingestion_id, is_active, updated_at)
                        VALUES 
                            (:unit_id, :actual_outbound_carrier_visit_id, :outbound_service, 
                             :ctr_from_position, :ctr_to_position, :move_complete_time, 
                             :reefer, :hazardous_flag, :port_of_discharge, :ingestion_id, TRUE, CURRENT_TIMESTAMP)
                        ON CONFLICT (unit_id) DO UPDATE SET
                            actual_outbound_carrier_visit_id = EXCLUDED.actual_outbound_carrier_visit_id,
                            outbound_service = EXCLUDED.outbound_service,
                            ctr_from_position = EXCLUDED.ctr_from_position,
                            ctr_to_position = EXCLUDED.ctr_to_position,
                            move_complete_time = EXCLUDED.move_complete_time,
                            reefer = EXCLUDED.reefer,
                            hazardous_flag = EXCLUDED.hazardous_flag,
                            port_of_discharge = EXCLUDED.port_of_discharge,
                            ingestion_id = EXCLUDED.ingestion_id,
                            updated_at = CURRENT_TIMESTAMP
                    """), {**r, "ingestion_id": ingestion_id})
                    
            elif dataset_type == "crane":
                conn.execute(text("""
                    INSERT INTO crane_movements 
                        (crane_id, unit_id, carrier_visit, move_kind, 
                         from_position, to_position, time_completed, line_op, ingestion_id)
                    VALUES 
                        (:crane_id, :unit_id, :carrier_visit, :move_kind, 
                         :from_position, :to_position, :time_completed, :line_op, :ingestion_id)
                """), [ {**r, "ingestion_id": ingestion_id} for r in accepted ])

    # Side effects
    if dataset_type == "history" and len(accepted) > 0:
        check_and_trigger_retraining(background_tasks)

    log_audit("Ingestion", f"Ingested {dataset_type} file {file.filename}: {len(accepted)} accepted, {len(rejected)} rejected", admin["id"])

    return {
        "status": status,
        "dataset_type": dataset_type,
        "accepted_count": len(accepted),
        "rejected_count": len(rejected),
        "ingestion_id": ingestion_id,
        "rejections": rejected[:10]  # Return first 10 for immediate feedback
    }

@router.get("/logs")
def get_ingestion_logs(limit: int = 50, admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, filename, dataset_type, status, records_total, 
                   records_accepted, records_rejected, completed_at, error_summary
            FROM ingestion_logs
            ORDER BY created_at DESC LIMIT :lim
        """), {"lim": limit}).fetchall()
    return {"logs": [dict(r._mapping) for r in rows]}

@router.get("/rejections/{ingestion_id}")
def get_rejections(ingestion_id: int, admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT row_data, reason, created_at
            FROM rejection_logs
            WHERE ingestion_id = :id
        """), {"id": ingestion_id}).fetchall()
    return {"rejections": [dict(r._mapping) for r in rows]}
