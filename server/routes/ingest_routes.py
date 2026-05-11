from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile
from sqlalchemy import text

from auth.dependencies import require_admin
from auth.utils import log_audit
from config import settings
from db.connection import get_engine
from services.retraining_service import check_and_trigger_retraining
from utils.datetime_utils import parse_datetime

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/ingest", tags=["Ingestion"])

# clean column names
def _clean_col(s: str) -> str:
    import re
    s = str(s).lower().strip()
    s = s.replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
    return re.sub(r"[^a-z0-9_]", "", s)

# mapping of column names to their canonical names
_MAPPING: dict[str, str] = {
    "unit_id": "unit_id",
    "unit": "unit_id",
    "unit_nbr": "unit_id",
    "container_id": "unit_id",

    "actual_outbound_carrier_visit_id": "actual_outbound_carrier_visit_id",
    "actual_outbound_carrier_visit": "actual_outbound_carrier_visit_id",
    "vessel_visit_id": "actual_outbound_carrier_visit_id",

    "outbound_service": "outbound_service",
    "vessel": "outbound_service",
    "service": "outbound_service",

    "carrier_visit": "carrier_visit",

    "move_complete_time": "move_complete_time",
    "time_in": "time_in",
    "time_out": "time_out",
    "time_completed": "time_completed",

    # history/current
    "ctr_from_position": "ctr_from_position",
    "ctr_to_position": "ctr_to_position",

    # crane
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
}

# normalize column names
def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    raw_names = [_clean_col(c) for c in df.columns]
    df = df.copy()
    df.columns = raw_names

    # remap column names to their canonical names
    final: list[str] = []
    # if column name is not in mapping, keep it as is
    for col in raw_names:
        mapped = _MAPPING.get(col, col)
        # if column name is already in final, add a suffix
        if mapped in final:
            sfx = 1
            while f"{mapped}_{sfx}" in final:
                sfx += 1
            final.append(f"{mapped}_{sfx}")
        else:
            final.append(mapped)
    df.columns = final
    return df

# detect dataset type
def _detect_type(df: pd.DataFrame, explicit: Optional[str]) -> Optional[str]:
    # if dataset type is explicitly provided, return it
    if explicit and explicit.lower() in ("history", "current", "crane"):
        return explicit.lower()
    
    cols = set(df.columns)

    # if dataset has both crane_id and carrier_visit, it's crane dataset
    if {"crane_id", "carrier_visit"}.issubset(cols):
        return "crane"

    # History and current datasets can both have 'visit_state' and 'transit_state'.
    # The true differentiator for the history dataset is the presence of 'time_out'.
    if "time_out" in cols:
        return "history"
    
    # if dataset has visit_state or transit_state, it's current dataset
    if "visit_state" in cols or "transit_state" in cols:
        return "current"
    # if dataset has unit_id and outbound_service, it's history dataset
    if {"unit_id", "outbound_service"}.issubset(cols):
        return "history"
    
    return None

# compute file hash
def _file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]

# json encoder for datetime and pandas timestamp
class _Encoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, pd.Timestamp):
            return obj.isoformat()
        try:
            if pd.isna(obj):
                return None
        except Exception:
            pass
        if hasattr(obj, "tolist"):
            return obj.tolist()
        return super().default(obj)

# clean row
def _clean_row(row: dict) -> dict:
    out: dict = {}
    for k, v in row.items():
        try:
            if pd.isna(v):
                out[k] = None
                continue
        except Exception:
            pass
        if isinstance(v, pd.Timestamp):
            out[k] = v.to_pydatetime()
        else:
            out[k] = v
    return out

# get first value from row
def _first_value(row: dict, *keys):
    for key in keys:
        if key in row:
            value = row.get(key)
            try:
                if pd.isna(value):
                    continue
            except Exception:
                pass
            if value is not None:
                return value
    return None

# safe datetime
def _safe_datetime(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value

# upload data endpoint
@router.post("/upload")
async def upload_data(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    datasetType: Optional[str] = Query(None),
    admin: dict = Depends(require_admin),
):
    content = await file.read()
    fhash = _file_hash(content)
    
    # read file
    try:
        if file.filename.endswith((".xlsx", ".xls")):
            tmp = pd.read_excel(BytesIO(content), header=None, nrows=10)
            hrow = 0
            for i, row in tmp.iterrows():
                vals = [str(v).lower() for v in row.values if pd.notna(v)]
                if any(k in vals for k in ["unit_id", "unit id", "unit nbr", "time completed", "move complete time"]):
                    hrow = i
                    break
            df = pd.read_excel(BytesIO(content), header=hrow)
        else:
            df = pd.read_csv(BytesIO(content), low_memory=False)
    except Exception as e:
        return _fail(f"Invalid file format: {e}")
    
    if df.empty:
        return _fail("File is empty")
    
    # normalize column names
    df = _normalize(df)
    df = df.dropna(how="all")

    # detect dataset type
    dataset_type = _detect_type(df, datasetType)
    if not dataset_type:
        return _fail(f"Could not identify dataset type from headers: {list(df.columns)[:15]}")
    
    # parse datetime for history and current datasets
    if dataset_type in ("history", "current"):
        for col in ("move_complete_time", "time_in", "time_out"):
            if col in df.columns:
                df[col] = parse_datetime(df[col], col)

        if dataset_type == "history":
            if "time_completed" in df.columns and "move_complete_time" not in df.columns:
                df["move_complete_time"] = parse_datetime(df["time_completed"], "move_complete_time")
            if "carrier_visit" in df.columns and "actual_outbound_carrier_visit_id" not in df.columns:
                df["actual_outbound_carrier_visit_id"] = df["carrier_visit"]
            if "vessel_visit_id" in df.columns and "actual_outbound_carrier_visit_id" not in df.columns:
                df["actual_outbound_carrier_visit_id"] = df["vessel_visit_id"]

            if "from_position" in df.columns and "ctr_from_position" not in df.columns:
                df["ctr_from_position"] = df["from_position"]
            if "to_position" in df.columns and "ctr_to_position" not in df.columns:
                df["ctr_to_position"] = df["to_position"]
    
    # parse datetime for crane dataset
    if dataset_type == "crane":
        if "time_completed" in df.columns:
            df["time_completed"] = parse_datetime(df["time_completed"], "time_completed")
        if "move_kind" in df.columns:
            df["move_kind"] = (
                df["move_kind"].astype(str).str.strip().str.upper()
                .replace({"NAN": None, "NONE": None, "NULL": None, "": None})
            )
    
    # clean rows
    records = [_clean_row(r) for r in df.to_dict("records")]
    
    # check expected columns
    expected_cols: list[str] = settings.EXPECTED_HEADERS.get(dataset_type, [])
    if not expected_cols:
        return _fail(f"No column config for dataset type '{dataset_type}'")
    
    engine = get_engine()
    
    # insert ingestion log
    with engine.begin() as conn:
        res = conn.execute(
            text("""
                INSERT INTO ingestion_logs
                    (filename, file_hash, dataset_type, status,
                     records_total, uploaded_by, completed_at)
                VALUES
                    (:fn, :h, :dt, 'processing', :tot, :uid, :now)
                RETURNING id
            """),
            {
                "fn": file.filename,
                "h": fhash,
                "dt": dataset_type,
                "tot": len(records),
                "uid": admin["id"],
                "now": datetime.now(timezone.utc),
            },
        )
        ingestion_id = res.fetchone()[0]
    
    # Trigger background processing
    background_tasks.add_task(
        _process_ingestion,
        ingestion_id,
        df,
        dataset_type,
        file.filename,
        admin["id"],
        background_tasks
    )

    return {
        "status": "processing",
        "dataset_type": dataset_type,
        "accepted_count": 0,
        "rejected_count": 0,
        "ingestion_id": ingestion_id,
        "message": "File upload successful. Processing started in background.",
    }

def _process_ingestion(
    ingestion_id: int,
    df: pd.DataFrame,
    dataset_type: str,
    filename: str,
    admin_id: int,
    background_tasks: BackgroundTasks
):
    engine = get_engine()
    from db.queries import ensure_yard_tables
    from utils.position_parser import get_yard_id

    try:
        # Build yard_id column
        if dataset_type == "crane":
            def _crane_yard(row):
                for field in ["from_position", "to_position"]:
                    val = row.get(field)
                    if val and isinstance(val, str) and val.upper().startswith("Y-") and "-" in val[2:]:
                        return val.split("-")[1].upper()
                return None
            df["yard_id"] = df.apply(_crane_yard, axis=1)
        else:
            if "yard_id" not in df.columns or df["yard_id"].isna().all():
                df["yard_id"] = df.apply(get_yard_id, axis=1)

        # Drop rows with no yard
        no_yard_mask = df["yard_id"].isna() | (df["yard_id"].astype(str).str.strip().isin(["", "nan", "None"]))
        rejected_no_yard = df[no_yard_mask]
        df = df[~no_yard_mask].copy()

        # Reject rows missing required fields
        required_map = {
            "history": ["unit_id", "outbound_service"],
            "current": ["unit_id", "outbound_service"],
            "crane": ["crane_id", "carrier_visit", "move_kind"],
        }
        req_cols = required_map.get(dataset_type, [])
        for col in req_cols:
            if col in df.columns:
                bad_mask = df[col].isna() | (df[col].astype(str).str.strip() == "")
                rejected_no_yard = pd.concat([rejected_no_yard, df[bad_mask]], ignore_index=True)
                df = df[~bad_mask].copy()

        accepted_count = len(df)
        rejected_count = len(rejected_no_yard)

        # Ensure time_in for history (partition key)
        if dataset_type == "history":
            if "time_in" in df.columns:
                fallback = df.get("move_complete_time", pd.NaT)
                df["time_in"] = df["time_in"].fillna(fallback).fillna(pd.Timestamp("2020-01-01"))
            else:
                df["time_in"] = pd.Timestamp("2020-01-01")

        # Bulk insert per yard
        if dataset_type == "crane":
            target_cols = ["crane_id", "unit_id", "carrier_visit", "event_type", "move_kind",
                           "from_position", "to_position", "time_completed", "line_op",
                           "unit_category", "exclude", "yard_id"]
        elif dataset_type == "current":
            target_cols = list(dict.fromkeys(
                settings.EXPECTED_HEADERS.get("current", []) + ["yard_id", "visit_state", "transit_state", "is_active"]
            ))
        else:
            target_cols = list(dict.fromkeys(
                settings.EXPECTED_HEADERS.get("history", []) + ["yard_id", "facility_id", "outbound_service", "time_in"]
            ))

        insert_errors: list[str] = []
        for yard, group in df.groupby("yard_id"):
            yard_lower = str(yard).lower().strip()
            ensure_yard_tables(engine, yard_lower)
            if dataset_type == "crane":
                table_name = f"{yard_lower}_crane_movements"
            elif dataset_type == "current":
                table_name = f"{yard_lower}_current_containers"
            else:
                table_name = f"{yard_lower}_history_containers"

            valid_cols = [c for c in target_cols if c in group.columns]
            insert_df = group[valid_cols].copy().loc[:, ~group[valid_cols].columns.duplicated()]
            insert_df["ingestion_id"] = ingestion_id

            try:
                insert_df.to_sql(
                    table_name, engine, if_exists="append",
                    index=False, chunksize=5000, method="multi"
                )
            except Exception as bulk_err:
                insert_errors.append(f"{table_name}: {bulk_err}")
                accepted_count -= len(insert_df)
                rejected_count += len(insert_df)

        # Log any rejections (sample up to 10)
        if not rejected_no_yard.empty:
            sample = rejected_no_yard.head(10)
            rej_rows = sample.to_dict("records")
            try:
                with engine.begin() as conn:
                    for rej_row in rej_rows:
                        conn.execute(
                            text("INSERT INTO rejection_logs (ingestion_id, row_data, reason) VALUES (:id, :data, :reason)"),
                            {"id": ingestion_id, "data": json.dumps(rej_row, cls=_Encoder), "reason": "No yard detected or missing required field"},
                        )
            except Exception:
                pass

        status = "success" if not insert_errors and rejected_count == 0 else ("partial" if accepted_count > 0 else "failed")
        if insert_errors:
            status = "partial"

    except Exception as exc:
        import traceback
        accepted_count = 0
        rejected_count = len(df)
        status = "failed"
        insert_errors = [str(exc)]
        traceback.print_exc()

    # ── Update ingestion log ──────────────────────────────────────────────────
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
                "s": status,
                "acc": accepted_count,
                "rej": rejected_count,
                "id": ingestion_id,
                "now": datetime.now(timezone.utc),
                "err": "\n".join(insert_errors) if insert_errors else None
            },
        )

    if dataset_type == "history" and accepted_count > 0:
        check_and_trigger_retraining(background_tasks)

    log_audit(
        "Ingestion",
        f"Ingested {dataset_type} {filename}: {accepted_count} accepted, {rejected_count} rejected",
        admin_id,
    )



# helper function to create a failed ingestion response
def _fail(reason: str) -> dict:
    return {
        "status": "failed",
        "dataset_type": "unknown",
        "accepted_count": 0,
        "rejected_count": 0,
        "ingestion_id": None,
        "rejections": [{"row": {}, "reason": reason}],
    }

# get all ingestion logs
@router.get("/logs")
def get_ingestion_logs(limit: int = 50, admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, filename, dataset_type, status, records_total,
                       records_accepted, records_rejected, completed_at, error_summary
                FROM ingestion_logs
                ORDER BY created_at DESC
                LIMIT :lim
            """),
            {"lim": limit},
        ).fetchall()
    return {"logs": [dict(r._mapping) for r in rows]}

# get rejections for a specific ingestion
@router.get("/rejections/{ingestion_id}")
def get_rejections(ingestion_id: int, admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT row_data, reason, created_at
                FROM rejection_logs
                WHERE ingestion_id = :id
                ORDER BY created_at
            """),
            {"id": ingestion_id},
        ).fetchall()
    return {"rejections": [dict(r._mapping) for r in rows]}