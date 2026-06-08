from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from datetime import datetime
from io import BytesIO
from typing import Optional

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile, HTTPException
from sqlalchemy import MetaData, Table, text, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from auth.dependencies import require_admin
from auth.utils import log_audit
from db.connection import get_engine
from services.retraining_service import check_and_trigger_retraining
from utils.datetime_utils import parse_datetime
from db.queries import load_from_db

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/ingest", tags=["Ingestion"])

_CHUNK_SIZE = 5_000

# Column normalization
def _clean_col(s: str) -> str:
    """
    Normalizes a column name by lowercasing, stripping, and replacing special characters.
    """
    s = str(s).lower().strip()
    s = s.replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
    return re.sub(r"[^a-z0-9_]", "", s)


_MAPPING: dict[str, str] = {
    "unit_id": "unit_id",
    "unit": "unit_id",
    "unit_nbr": "unit_id",
    "unitnbr": "unit_id",
    "container_id": "unit_id",
    "actual_outbound_carrier_visit_id": "actual_outbound_carrier_visit_id",
    "actual_outbound_carrier_visit": "actual_outbound_carrier_visit_id",
    "vessel_visit_id": "actual_outbound_carrier_visit_id",
    "vessel_visit": "actual_outbound_carrier_visit_id",
    "visit_id": "actual_outbound_carrier_visit_id",
    "outbound_carrier_visit": "actual_outbound_carrier_visit_id",
    "actual_inbound_carrier_visit_id": "actual_inbound_carrier_visit_id",
    "actual_inbound_carrier_visit": "actual_inbound_carrier_visit_id",
    "inbound_carrier_visit": "actual_inbound_carrier_visit_id",
    "outbound_service": "outbound_service",
    "vessel": "outbound_service",
    "service": "outbound_service",
    "carrier_visit": "carrier_visit",
    "move_complete_time": "move_complete_time",
    "time_in": "time_in",
    "time_out": "time_out",
    "time_completed": "time_completed",
    "ctr_from_position": "ctr_from_position",
    "ctr_to_position": "ctr_to_position",
    "current_position": "current_position",
    "current_slot_position": "current_position",
    "from_position": "from_position",
    "to_position": "to_position",
    "crane_from_position": "from_position",
    "crane_to_position": "to_position",
    "crane_from": "from_position",
    "crane_to": "to_position",
    "from": "from_position",
    "to": "to_position",
    "verified_gross_mass_kg": "verified_gross_mass_kg",
    "verified_gross_mass_kg_": "verified_gross_mass_kg",
    "vgm": "verified_gross_mass_kg",
    "unit_weight_in_kg": "unit_weight_in_kg",
    "weight": "unit_weight_in_kg",
    "reefer": "reefer",
    "oog_unit": "oog_unit",
    "hazardous_flag": "hazardous_flag",
    "hazardous": "hazardous_flag",
    "port_of_discharge": "port_of_discharge",
    "destination": "destination",
    "visit_state": "visit_state",
    "transit_state": "transit_state",
    "crane_id": "crane_id",
    "crane_che": "crane_id",
    "crane": "crane_id",
    "event_type": "event_type",
    "move_kind": "move_kind",
    "line_op": "line_op",
    "exclude": "exclude",
    "unit_category": "unit_category",
    "unit_visit_gkey": "unit_visit_gkey",
    "category_id": "category_id",
    "equipment_class": "equipment_class",
    "container_length": "container_length",
    "equipment_type": "equipment_type",
    "freight_kind": "freight_kind",
    "inbound_service": "inbound_service",
    "arrival_mode": "arrival_mode",
    "stow_code_1": "stow_code_1",
    "stow_code_2": "stow_code_2",
    "stow_code_3": "stow_code_3",
    "imdg_code": "imdg_code",
    "hazard_un_numbers": "hazard_un_numbers",
    "complex_id": "complex_id",
    "facility_id": "facility_id",
    "yard_id": "yard_id",
    "current_yard_block": "yard_id",
}

def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    """
    Applies standard mappings and deduplicates column names in the uploaded DataFrame.
    """
    raw_names = [_clean_col(c) for c in df.columns]
    df = df.copy()
    df.columns = raw_names

    final: list[str] = []
    for col in raw_names:
        mapped = _MAPPING.get(col, col)
        if mapped in final:
            sfx = 1
            while f"{mapped}_{sfx}" in final:
                sfx += 1
            final.append(f"{mapped}_{sfx}")
        else:
            final.append(mapped)

    df.columns = final
    return df

# Shared helpers  (single definitions — no duplicates below)
def _utcnow_naive() -> datetime:
    """
    Returns the current UTC datetime without tzinfo.
    """
    return datetime.utcnow()

def _safe_scalar(value):
    """
    Extracts native Python scalars from pandas/numpy types for database ingestion.
    """
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    if isinstance(value, pd.Timestamp):
        if value.tzinfo is not None:
            return value.to_pydatetime().replace(tzinfo=None)
        return value.to_pydatetime()
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.replace(tzinfo=None)
        return value
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value

def _clean_row(row: dict) -> dict:
    """
    Applies safe scalar conversions to an entire dictionary row.
    """
    return {k: _safe_scalar(v) for k, v in row.items()}

def _prepare_records(df: pd.DataFrame) -> list[dict]:
    """Replace NaT/NaN with None for SQL insertion."""
    records = []
    for rec in df.to_dict(orient="records"):
        records.append({k: _safe_scalar(v) for k, v in rec.items()})
    return records

def _coerce_datetime_columns(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """
    Safely converts specified columns into timezone-naive datetime objects.
    """
    df = df.copy()
    for col in columns:
        if col in df.columns:
            parsed = parse_datetime(df[col], col)
            parsed = pd.to_datetime(parsed, errors="coerce")
            try:
                if getattr(parsed.dt, "tz", None) is not None:
                    parsed = parsed.dt.tz_convert(None)
            except Exception:
                pass
            df[col] = parsed
    return df

def _ensure_text_columns(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """
    Converts columns to string types and normalizes various 'null' representations.
    """
    import numpy as np
    df = df.copy()
    for col in columns:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .replace(["nan", "None", "NAT", "NaT", "none", "null"], np.nan)
            )
    return df

def _ensure_current_position(df: pd.DataFrame) -> pd.DataFrame:
    """Derive current_position from movement columns when absent."""
    df = df.copy()
    if "current_position" not in df.columns:
        df["current_position"] = None
    if "ctr_to_position" in df.columns:
        df["current_position"] = df["current_position"].fillna(df["ctr_to_position"])
    if "ctr_from_position" in df.columns:
        df["current_position"] = df["current_position"].fillna(df["ctr_from_position"])
    return df

def _fail(reason: str) -> dict:
    """
    Returns a standardized failure payload for the ingestion process.
    """
    return {
        "status":         "failed",
        "dataset_type":   "unknown",
        "accepted_count": 0,
        "rejected_count": 0,
        "ingestion_id":   None,
        "rejections":     [{"row": {}, "reason": reason}],
    }

def _file_hash(content: bytes) -> str:
    """
    Generates a 16-character SHA-256 hash representing the uploaded file content.
    """
    return hashlib.sha256(content).hexdigest()[:16]

# Yard ID derivation  (single canonical implementation)
def _safe_get_yard_from_position(value) -> Optional[str]:
    """
    Extracts the block or yard identifier from a position string (e.g., Y-PEB-D123 -> PEB).
    """
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    s = str(value).strip()
    if not s or s.lower() in {"nan", "none", "null", "nat"}:
        return None

    su = s.upper()
    if su.startswith("Y-") and "-" in su[2:]:
        parts = s.split("-")
        if len(parts) >= 3:
            return parts[1].upper().strip()

    m = re.match(r"^([A-Z0-9]{2,6})[-_]", su)
    if m:
        return m.group(1).upper().strip()

    if re.match(r"^[A-Z]{2,6}$", su):
        return su

    return None

def _derive_yard_id_from_row(row: pd.Series, dataset_type: str) -> Optional[str]:
    # 1. Explicit yard columns first
    """
    Determines the Yard ID for a given row by checking explicit columns and position strings.
    """
    for key in ("yard_id", "facility_id", "complex_id"):
        val = row.get(key)
        y = _safe_get_yard_from_position(val)
        if y:
            return y.lower()

    # 2. For crane data, try position columns
    if dataset_type == "crane":
        for key in ("from_position", "to_position"):
            y = _safe_get_yard_from_position(row.get(key))
            if y:
                return y.lower()

    # 3. Movement / container position columns
    for key in (
        "ctr_from_position",
        "ctr_to_position",
        "current_position",
        "from_position",
        "to_position",
    ):
        y = _safe_get_yard_from_position(row.get(key))
        if y:
            return y.lower()

    return None

class SchemaMatcher:
    CONTAINER_FIELDS = {
        "unit_id", "complex_id", "facility_id", "yard_id",
        "category_id", "equipment_class", "container_length", "equipment_type",
        "freight_kind", "destination", "unit_weight_in_kg", "verified_gross_mass_kg",
        "reefer", "oog_unit", "hazardous_flag", "hazard_un_numbers", "imdg_code",
        "stow_code_1", "stow_code_2", "stow_code_3", "port_of_discharge",
        "actual_inbound_carrier_visit_id", "inbound_service",
        "actual_outbound_carrier_visit_id", "outbound_service", "arrival_mode",
        "current_position", "visit_state", "transit_state", "time_out", "time_in",
        "move_complete_time", "ctr_from_position", "ctr_to_position"
    }
    
    CRANE_FIELDS = {
        "time_completed", "event_type", "move_kind", "unit_category", "unit_id",
        "crane_id", "from_position", "to_position", "carrier_visit", "line_op", "exclude"
    }
    
    ITV_FIELDS = {
        "itv_id", "unit_id", "move_task_id", "driver_id", 
        "dispatch_time", "arrival_time", "from_position", "to_position", 
        "status", "carrier_visit"
    }

    @classmethod
    def match(cls, df: pd.DataFrame) -> Optional[str]:
        cols = set(df.columns)
        
        container_score = len(cols.intersection(cls.CONTAINER_FIELDS))
        crane_score = len(cols.intersection(cls.CRANE_FIELDS))
        itv_score = len(cols.intersection(cls.ITV_FIELDS))
        
        scores = {
            "history": container_score,
            "crane": crane_score,
            "itv": itv_score
        }
        
        best_match = max(scores, key=scores.get)
        if scores[best_match] < 3:
            return None
            
        return best_match

# Dataset type detection
def _detect_type(df: pd.DataFrame, explicit: Optional[str]) -> Optional[str]:
    """
    Infers the dataset type (history, crane, itv) based on the SchemaMatcher score.
    """
    if explicit and explicit.lower() in ("history", "crane", "itv"):
        return explicit.lower()

    if explicit and explicit.lower() == "current":
        return "history" # Map legacy 'current' endpoint to history processing

    return SchemaMatcher.match(df)

# Ingestion log helpers
def _insert_ingestion_log(
    ingestion_id: str,
    filename: str,
    file_hash: str,
    dataset_type: str,
    total_rows: int,
    uploaded_by: int,
) -> None:
    """
    Creates the initial ingestion log entry to track the file upload progress.
    """
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO ingestion_logs
                    (id, filename, file_hash, dataset_type, status,
                     records_total, records_accepted, records_rejected,
                     uploaded_by, completed_at, error_summary)
                VALUES
                    (:id, :fn, :h, :dt, 'processing',
                     :tot, 0, 0, :uid, NULL, NULL)
            """),
            {
                "id":  ingestion_id,
                "fn":  filename,
                "h":   file_hash,
                "dt":  dataset_type,
                "tot": total_rows,
                "uid": uploaded_by,
            },
        )

def _update_ingestion_log(
    ingestion_id: str,
    status: str,
    accepted_count: int,
    rejected_count: int,
    error_summary: Optional[str],
) -> None:
    """
    Updates the ingestion log entry with final processing results and error summaries.
    """
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE ingestion_logs
                SET status           = :s,
                    records_accepted = :acc,
                    records_rejected = :rej,
                    completed_at     = :now,
                    error_summary    = :err
                WHERE id = :id
            """),
            {
                "s":   status,
                "acc": accepted_count,
                "rej": rejected_count,
                "id":  ingestion_id,
                "now": _utcnow_naive(),
                "err": error_summary,
            },
        )

# Upload endpoint
@router.post("/upload")
async def upload_data(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    """
    Primary ingestion endpoint. Parses uploaded datasets, identifies their type,
    and queues them for asynchronous database insertion.
    """
    content = await file.read()
    file_name = file.filename or "upload"
    fhash = _file_hash(content)

    try:
        if file_name.endswith((".xlsx", ".xls")):
            tmp = pd.read_excel(BytesIO(content), header=None, nrows=10)
            hrow = 0
            for i, row in tmp.iterrows():
                vals = [str(v).lower() for v in row.values if pd.notna(v)]
                if any(
                    k in vals
                    for k in [
                        "unit_id", "unit id", "unit nbr", "unit nbr.",
                        "time completed", "move complete time",
                    ]
                ):
                    hrow = i
                    break
            df = pd.read_excel(BytesIO(content), header=hrow)
        elif file_name.endswith(".json"):
            df = pd.read_json(BytesIO(content))
        else:
            df = pd.read_csv(BytesIO(content), low_memory=False)
    except Exception as e:
        return _fail(f"Invalid file format: {e}")

    if df.empty:
        return _fail("File is empty")

    df = _normalize(df)
    df = df.dropna(how="all")

    # Unified ingestion
    dataset_type = "unified"

    ingestion_id = str(uuid.uuid4())
    _insert_ingestion_log(
        ingestion_id=ingestion_id,
        filename=file_name,
        file_hash=fhash,
        dataset_type=dataset_type,
        total_rows=len(df),
        uploaded_by=admin["id"],
    )

    # Start background process
    background_tasks.add_task(
        _process_ingestion,
        content,
        file_name,
        ingestion_id,
        admin["id"],
        background_tasks,
    )

    return {"status": "processing", "ingestion_id": ingestion_id}

@router.get("/status/{ingestion_id}")
def get_ingestion_status(ingestion_id: str, current_user: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT status, dataset_type, records_accepted, records_rejected, error_summary 
                FROM ingestion_logs 
                WHERE id = :id
            """),
            {"id": ingestion_id}
        ).fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Ingestion not found")
            
        return {
            "status": row[0],
            "dataset_type": row[1] or "unified",
            "accepted_count": row[2] or 0,
            "rejected_count": row[3] or 0,
            "errors": [row[4]] if row[4] else [],
            "ingestion_id": ingestion_id
        }

# Synchronous ingestion processor
def _process_ingestion(
    file_content: bytes,
    filename: str,
    ingestion_id: str,
    admin_id: int,
    background_tasks: BackgroundTasks
):
    """
    Handles data validation, splitting by yard, and routing to the specific database tables.
    """
    engine = get_engine()
    accepted_count = 0
    rejected_count = 0
    insert_errors: list[str] = []
    logged_type = "unified"
    status = "processing"
    
    # 1. Parse dataframe
    try:
        if filename.endswith(".json"):
            df = pd.read_json(BytesIO(file_content))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(BytesIO(file_content))
        else:
            df = pd.read_csv(BytesIO(file_content), low_memory=False)
        df = _normalize(df)
        df = df.dropna(how="all")
        df = df.copy()

        # Coerce time columns for containers using robust parse_datetime
        time_cols = ["time_in", "time_out", "move_complete_time", "time_completed", "dispatch_time", "arrival_time"]
        df = _coerce_datetime_columns(df, time_cols)

        # Lineage: discharge rows → populate actual_inbound_carrier_visit_id
        if "category_id" in df.columns and "actual_outbound_carrier_visit_id" in df.columns:
            discharge_mask = (
                df["category_id"].astype(str).str.upper()
                .str.contains("IMPORT|DISCH", na=False)
            )
            if "actual_inbound_carrier_visit_id" not in df.columns:
                df["actual_inbound_carrier_visit_id"] = None
            no_inbound = df["actual_inbound_carrier_visit_id"].isna()
            df.loc[discharge_mask & no_inbound, "actual_inbound_carrier_visit_id"] = \
                df.loc[discharge_mask & no_inbound, "actual_outbound_carrier_visit_id"]

        # Fallback for visit_id if actual_outbound_carrier_visit_id is missing but outbound_service is present
        if "actual_outbound_carrier_visit_id" not in df.columns and "outbound_service" in df.columns:
            df["actual_outbound_carrier_visit_id"] = df["outbound_service"]


        # Derive yard_id from explicit fields or movement positions
        if "yard_id" not in df.columns or df["yard_id"].isna().all():
            df["yard_id"] = df.apply(
                lambda row: _derive_yard_id_from_row(row, "unified"), axis=1
            )

        no_yard_mask = (
            df["yard_id"].isna()
            | (df["yard_id"].astype(str).str.strip().isin(["", "nan", "None"]))
        )
        rejected_df = df[no_yard_mask].copy()
        df = df[~no_yard_mask].copy()

        # We will determine what type of file it might be predominantly for logging purposes
        cols = set(df.columns)
        has_container = bool(cols.intersection({"actual_outbound_carrier_visit_id", "freight_kind", "category_id"}))
        has_crane = bool(cols.intersection({"crane_id", "move_kind"}))
        has_itv = bool(cols.intersection({"itv_id"}))
        
        logged_type = "unified"
        if has_container and not has_crane and not has_itv: logged_type = "history"
        elif has_crane and not has_itv: logged_type = "crane"
        elif has_itv and not has_crane: logged_type = "itv"

        if df.empty:
            _update_ingestion_log(ingestion_id, "failed", 0, len(rejected_df), "All rows rejected.")
            return

        accepted_count = len(df)
        rejected_count = len(rejected_df)

        # ── Insert logic ────────────────────────────────────────────────────────
        _insert_global_containers(engine, df, ingestion_id)
        _insert_global_cranes(engine, df, ingestion_id)
        _insert_global_itvs(engine, df, ingestion_id)

        status = "success" if rejected_count == 0 else "partial"
        _update_ingestion_log(ingestion_id, status, accepted_count, rejected_count, None)
        with engine.begin() as conn:
            conn.execute(text("UPDATE ingestion_logs SET dataset_type = :dt WHERE id = :id"), {"dt": logged_type, "id": ingestion_id})

        if logged_type == "history" and accepted_count > 0:
            check_and_trigger_retraining(background_tasks)

    except Exception as exc:
        logger.exception("[Ingestion] Worker failed for %s", filename)
        accepted_count = 0
        status = "failed"
        insert_errors = [str(exc)]
        _update_ingestion_log(ingestion_id, "failed", 0, 0, str(exc))

    try:
        log_audit(
            "Ingestion",
            f"Ingested {logged_type} {filename}: "
            f"{accepted_count} accepted, {rejected_count} rejected",
            admin_id,
        )
    except Exception as audit_exc:
        logger.warning("[Ingestion] Audit log failed: %s", audit_exc)

    logger.info(
        "[Ingestion] %s (%s) done: %d accepted / %d rejected / errors=%s",
        filename, logged_type, accepted_count, rejected_count, insert_errors,
    )

    message = "Ingestion completed."
    if status == "partial":
        message = "Ingestion completed with some rejected rows."
    elif status == "failed":
        message = "Ingestion failed."

    return {
        "status":         status,
        "dataset_type":   logged_type,
        "accepted_count": accepted_count,
        "rejected_count": rejected_count,
        "ingestion_id":   ingestion_id,
        "message":        message,
        "errors":         insert_errors or None,
    }

# Per-yard dispatch
def _insert_yard_data(
    engine,
    yard: str,
    dataset_type: str,
    df: pd.DataFrame,
    ingestion_id: str,
    background_tasks=None,
) -> tuple[int, int, str]:
    """
    Routes parsed data to the appropriate underlying table structure based on dataset type.
    """
    accepted = len(df)
    rejected = 0
    error_str = ""

    try:
        # Global Tables Insertion
        if dataset_type in ("history", "current"):
            _insert_global_containers(engine, df, ingestion_id)
        elif dataset_type == "crane":
            _insert_global_cranes(engine, df, ingestion_id)
        elif dataset_type == "itv":
            _insert_global_itvs(engine, df, ingestion_id)



    except Exception as e:
        error_str = f"{yard}/{dataset_type}: {e}"
        rejected = len(df)

    return accepted, rejected, error_str




# Global Table Inserts
def _insert_global_containers(engine, df: pd.DataFrame, ingestion_id: str):
    df = df.copy()

    # Map the legacy visit column to the table PK column `visit_id`
    if "visit_id" not in df.columns:
        if "actual_outbound_carrier_visit_id" in df.columns:
            df["visit_id"] = df["actual_outbound_carrier_visit_id"]
        elif "carrier_visit" in df.columns:
            df["visit_id"] = df["carrier_visit"]
        else:
            return  # Missing composite PK

    # Drop rows missing PK
    df = df.dropna(subset=["unit_id", "visit_id"]).copy()
    if df.empty:
        return

    # Add metadata columns
    df["ingestion_id"] = ingestion_id
    df["updated_at"] = _utcnow_naive()
    df["created_at"] = _utcnow_naive()

    # Time columns are already coerced by _process_ingestion using _coerce_datetime_columns

    # Ensure text columns are clean
    non_time = [c for c in df.columns if c not in ["time_in", "time_out", "move_complete_time", "unit_weight_in_kg", "verified_gross_mass_kg", "created_at", "updated_at"]]
    df = _ensure_text_columns(df, non_time)

    if "visit_id" not in df.columns:
        if "actual_outbound_carrier_visit_id" in df.columns:
            df["visit_id"] = df["actual_outbound_carrier_visit_id"]
        else:
            df["visit_id"] = "UNKNOWN"
            
    df["visit_id"] = df["visit_id"].fillna("UNKNOWN")
    df["unit_id"] = df["unit_id"].fillna("UNKNOWN")

    # Load actual table schema and filter to only columns that exist in the DB
    metadata_obj = MetaData()
    table = Table("containers", metadata_obj, autoload_with=engine)
    table_col_names = {c.name for c in table.columns}

    # Only keep DataFrame columns that match actual table columns
    insert_cols = [c for c in df.columns if c in table_col_names]
    insert_df = df[insert_cols].copy()
    
    # Drop duplicates to prevent 'ON CONFLICT DO UPDATE command cannot affect row a second time'
    if "unit_id" in insert_df.columns and "visit_id" in insert_df.columns:
        insert_df = insert_df.drop_duplicates(subset=["unit_id", "visit_id"], keep="last")

    for start in range(0, len(insert_df), _CHUNK_SIZE):
        chunk = insert_df.iloc[start: start + _CHUNK_SIZE]
        records = _prepare_records(chunk)
        if not records:
            continue

        stmt = pg_insert(table).values(records)
        update_set = {
            c.name: func.coalesce(stmt.excluded[c.name], getattr(table.c, c.name))
            for c in table.columns
            if c.name not in {"unit_id", "visit_id", "created_at"} and c.name in chunk.columns
        }
        if update_set:
            stmt = stmt.on_conflict_do_update(index_elements=["unit_id", "visit_id"], set_=update_set)
        else:
            stmt = stmt.on_conflict_do_nothing(index_elements=["unit_id", "visit_id"])

        try:
            with engine.begin() as conn:
                conn.execute(stmt)
        except Exception as e:
            logger.error("[Ingestion] Global containers insert error: %s", e)


def _insert_global_cranes(engine, df: pd.DataFrame, ingestion_id: str):
    # Only proceed if we have crane-specific columns
    if not {"crane_id", "move_kind"}.intersection(set(df.columns)):
        return

    df = df.copy()
    if "visit_id" not in df.columns:
        if "carrier_visit" in df.columns:
            df["visit_id"] = df["carrier_visit"]
        elif "actual_outbound_carrier_visit_id" in df.columns:
            df["visit_id"] = df["actual_outbound_carrier_visit_id"]
        else:
            return

    df = df.dropna(subset=["unit_id", "visit_id"]).copy()
    if df.empty:
        return

    # Pre-insert placeholder containers to satisfy Foreign Key constraints
    unique_containers = df[["unit_id", "visit_id"]].drop_duplicates()
    container_records = []
    for _, row in unique_containers.iterrows():
        container_records.append({
            "unit_id": str(row["unit_id"]),
            "visit_id": str(row["visit_id"]),
            "ingestion_id": ingestion_id,
            "created_at": _utcnow_naive(),
            "updated_at": _utcnow_naive()
        })
    if container_records:
        metadata_obj = MetaData()
        c_table = Table("containers", metadata_obj, autoload_with=engine)
        c_stmt = pg_insert(c_table).values(container_records)
        c_stmt = c_stmt.on_conflict_do_nothing(index_elements=["unit_id", "visit_id"])
        try:
            with engine.begin() as conn:
                conn.execute(c_stmt)
        except Exception as e:
            logger.error("[Ingestion] FK stub insert failed for cranes: %s", e)

    # Add metadata
    df["ingestion_id"] = ingestion_id
    df["created_at"] = _utcnow_naive()

    # Time columns are already coerced by _process_ingestion

    non_time = [c for c in df.columns if c not in ["time_completed", "created_at"]]
    df = _ensure_text_columns(df, non_time)

    if "visit_id" not in df.columns:
        if "actual_outbound_carrier_visit_id" in df.columns:
            df["visit_id"] = df["actual_outbound_carrier_visit_id"]
        else:
            df["visit_id"] = "UNKNOWN"
            
    df["visit_id"] = df["visit_id"].fillna("UNKNOWN")
    df["unit_id"] = df["unit_id"].fillna("UNKNOWN")

    # Load actual table schema and filter to only columns that exist in the DB
    metadata_obj = MetaData()
    table = Table("cranes", metadata_obj, autoload_with=engine)
    table_col_names = {c.name for c in table.columns}

    insert_cols = [c for c in df.columns if c in table_col_names]
    insert_df = df[insert_cols].copy()

    for start in range(0, len(insert_df), _CHUNK_SIZE):
        chunk = insert_df.iloc[start: start + _CHUNK_SIZE]
        records = _prepare_records(chunk)
        if not records:
            continue
        try:
            with engine.begin() as conn:
                conn.execute(table.insert(), records)
        except Exception as e:
            logger.error("[Ingestion] Global cranes insert error: %s", e)


def _insert_global_itvs(engine, df: pd.DataFrame, ingestion_id: str):
    # Only proceed if we have ITV-specific columns
    if "itv_id" not in df.columns:
        return

    df = df.copy()
    if "visit_id" not in df.columns:
        if "carrier_visit" in df.columns:
            df["visit_id"] = df["carrier_visit"]
        elif "actual_outbound_carrier_visit_id" in df.columns:
            df["visit_id"] = df["actual_outbound_carrier_visit_id"]
        else:
            return

    df = df.dropna(subset=["unit_id", "visit_id"]).copy()
    if df.empty:
        return

    # Pre-insert placeholder containers to satisfy Foreign Key constraints
    unique_containers = df[["unit_id", "visit_id"]].drop_duplicates()
    container_records = []
    for _, row in unique_containers.iterrows():
        container_records.append({
            "unit_id": str(row["unit_id"]),
            "visit_id": str(row["visit_id"]),
            "ingestion_id": ingestion_id,
            "created_at": _utcnow_naive(),
            "updated_at": _utcnow_naive()
        })
    if container_records:
        metadata_obj = MetaData()
        c_table = Table("containers", metadata_obj, autoload_with=engine)
        c_stmt = pg_insert(c_table).values(container_records)
        c_stmt = c_stmt.on_conflict_do_nothing(index_elements=["unit_id", "visit_id"])
        try:
            with engine.begin() as conn:
                conn.execute(c_stmt)
        except Exception as e:
            logger.error("[Ingestion] FK stub insert failed for itvs: %s", e)

    # Add metadata
    df["ingestion_id"] = ingestion_id
    df["created_at"] = _utcnow_naive()

    # Time columns are already coerced by _process_ingestion

    non_time = [c for c in df.columns if c not in ["dispatch_time", "arrival_time", "created_at"]]
    df = _ensure_text_columns(df, non_time)

    # Load actual table schema and filter to only columns that exist in the DB
    metadata_obj = MetaData()
    table = Table("itvs", metadata_obj, autoload_with=engine)
    table_col_names = {c.name for c in table.columns}

    insert_cols = [c for c in df.columns if c in table_col_names]
    insert_df = df[insert_cols].copy()

    for start in range(0, len(insert_df), _CHUNK_SIZE):
        chunk = insert_df.iloc[start: start + _CHUNK_SIZE]
        records = _prepare_records(chunk)
        if not records:
            continue
        try:
            with engine.begin() as conn:
                conn.execute(table.insert(), records)
        except Exception as e:
            logger.error("[Ingestion] Global itvs insert error: %s", e)
