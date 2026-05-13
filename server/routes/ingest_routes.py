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
from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile
from sqlalchemy import MetaData, Table, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from auth.dependencies import require_admin
from auth.utils import log_audit
from db.connection import get_engine
from services.retraining_service import check_and_trigger_retraining
from utils.datetime_utils import parse_datetime

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/ingest", tags=["Ingestion"])

_CHUNK_SIZE = 5_000


# ─────────────────────────────────────────────────────────────────────────────
# Column normalization
# ─────────────────────────────────────────────────────────────────────────────

def _clean_col(s: str) -> str:
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
}


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
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


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers  (single definitions — no duplicates below)
# ─────────────────────────────────────────────────────────────────────────────

def _utcnow_naive() -> datetime:
    return datetime.utcnow()


def _safe_scalar(value):
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
    return {k: _safe_scalar(v) for k, v in row.items()}


def _prepare_records(df: pd.DataFrame) -> list[dict]:
    """Replace NaT/NaN with None for SQL insertion."""
    records = []
    for rec in df.to_dict(orient="records"):
        records.append({k: _safe_scalar(v) for k, v in rec.items()})
    return records


def _coerce_datetime_columns(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
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
    df = df.copy()
    for col in columns:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .replace(["nan", "None", "NAT", "NaT", "none", "null"], None)
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


def _drop_current_time_fields(df: pd.DataFrame) -> pd.DataFrame:
    drop_cols = [
        c for c in ("move_complete_time", "time_in", "time_out", "time_completed")
        if c in df.columns
    ]
    if drop_cols:
        df = df.drop(columns=drop_cols, errors="ignore")
    return df


def _fail(reason: str) -> dict:
    return {
        "status":         "failed",
        "dataset_type":   "unknown",
        "accepted_count": 0,
        "rejected_count": 0,
        "ingestion_id":   None,
        "rejections":     [{"row": {}, "reason": reason}],
    }


def _file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]


# ─────────────────────────────────────────────────────────────────────────────
# Yard ID derivation  (single canonical implementation)
# ─────────────────────────────────────────────────────────────────────────────

def _safe_get_yard_from_position(value) -> Optional[str]:
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


# ─────────────────────────────────────────────────────────────────────────────
# Dataset type detection
# ─────────────────────────────────────────────────────────────────────────────

def _detect_type(df: pd.DataFrame, explicit: Optional[str]) -> Optional[str]:
    if explicit and explicit.lower() in ("history", "crane"):
        return explicit.lower()
    if explicit and explicit.lower() == "current":
        return "history"  # treat as history; runtime extraction handles current view

    cols = set(df.columns)

    if {"crane_id", "carrier_visit"}.issubset(cols):
        return "crane"

    if "visit_state" in cols or "transit_state" in cols:
        sample_text = ""
        if "visit_state" in cols:
            sample_text += " ".join(df["visit_state"].dropna().astype(str).unique()[:25])
        if "transit_state" in cols:
            sample_text += " ".join(df["transit_state"].dropna().astype(str).unique()[:25])
        if "DEPART" in sample_text.upper():
            return "history"
        return "current"

    if "time_out" in cols:
        non_null_ratio = df["time_out"].notna().mean()
        return "history" if non_null_ratio >= 0.30 else "current"

    if {"unit_id", "outbound_service"}.issubset(cols):
        return "history"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Ingestion log helpers
# ─────────────────────────────────────────────────────────────────────────────

def _insert_ingestion_log(
    ingestion_id: str,
    filename: str,
    file_hash: str,
    dataset_type: str,
    total_rows: int,
    uploaded_by: int,
) -> None:
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


# ─────────────────────────────────────────────────────────────────────────────
# Upload endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_data(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    datasetType: Optional[str] = Query(None),
    admin: dict = Depends(require_admin),
):
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
        else:
            df = pd.read_csv(BytesIO(content), low_memory=False)
    except Exception as e:
        return _fail(f"Invalid file format: {e}")

    if df.empty:
        return _fail("File is empty")

    df = _normalize(df)
    df = df.dropna(how="all")

    dataset_type = _detect_type(df, datasetType)
    if not dataset_type:
        return _fail(
            f"Could not identify dataset type from headers: {list(df.columns)[:15]}"
        )

    if dataset_type == "current":
        df = _drop_current_time_fields(df)
        df = _ensure_current_position(df)

    if dataset_type == "history":
        for col in ("move_complete_time", "time_in", "time_out"):
            if col in df.columns:
                df = _coerce_datetime_columns(df, [col])
        if "time_completed" in df.columns and "move_complete_time" not in df.columns:
            df = _coerce_datetime_columns(df, ["time_completed"])
            df["move_complete_time"] = df["time_completed"]
        if "carrier_visit" in df.columns and "actual_outbound_carrier_visit_id" not in df.columns:
            df["actual_outbound_carrier_visit_id"] = df["carrier_visit"]
        if "from_position" in df.columns and "ctr_from_position" not in df.columns:
            df["ctr_from_position"] = df["from_position"]
        if "to_position" in df.columns and "ctr_to_position" not in df.columns:
            df["ctr_to_position"] = df["to_position"]
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
                
    if dataset_type == "crane":
        if "time_completed" in df.columns:
            df = _coerce_datetime_columns(df, ["time_completed"])
        if "move_kind" in df.columns:
            df["move_kind"] = (
                df["move_kind"]
                .astype(str).str.strip().str.upper()
                .replace({"NAN": None, "NONE": None, "NULL": None, "": None})
            )

    ingestion_id = str(uuid.uuid4())
    _insert_ingestion_log(
        ingestion_id=ingestion_id,
        filename=file_name,
        file_hash=fhash,
        dataset_type=dataset_type,
        total_rows=len(df),
        uploaded_by=admin["id"],
    )

    result = _process_ingestion(
        ingestion_id=ingestion_id,
        df=df,
        dataset_type=dataset_type,
        filename=file_name,
        admin_id=admin["id"],
        background_tasks=background_tasks,
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Synchronous ingestion processor
# ─────────────────────────────────────────────────────────────────────────────

def _process_ingestion(
    ingestion_id: str,
    df: pd.DataFrame,
    dataset_type: str,
    filename: str,
    admin_id: int,
    background_tasks: BackgroundTasks = None,
):
    from db.queries import ensure_yard_tables

    engine = get_engine()
    accepted_count = 0
    rejected_count = 0
    insert_errors: list[str] = []

    try:
        df = df.copy()

        if dataset_type == "current":
            df = _drop_current_time_fields(df)
            df = _ensure_current_position(df)

        if dataset_type == "history":
            df = _coerce_datetime_columns(df, ["time_in", "time_out", "move_complete_time"])
            # ── lineage: discharge rows → populate actual_inbound_carrier_visit_id
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

        if dataset_type == "crane":
            df = _coerce_datetime_columns(df, ["time_completed"])

        # ── Derive yard_id ───────────────────────────────────────────────────
        if dataset_type == "crane":
            df["yard_id"] = df.apply(
                lambda row: _derive_yard_id_from_row(row, "crane"), axis=1
            )
        else:
            if "yard_id" not in df.columns or df["yard_id"].isna().all():
                df["yard_id"] = df.apply(
                    lambda row: _derive_yard_id_from_row(row, dataset_type), axis=1
                )

        no_yard_mask = (
            df["yard_id"].isna()
            | (df["yard_id"].astype(str).str.strip().isin(["", "nan", "None"]))
        )
        rejected_df = df[no_yard_mask].copy()
        df = df[~no_yard_mask].copy()

        # ── Required column validation ────────────────────────────────────────
        required_map = {
            "history": ["unit_id", "actual_outbound_carrier_visit_id"],
            "current": ["unit_id", "actual_outbound_carrier_visit_id"],
            "crane":   ["crane_id", "carrier_visit", "move_kind"],
        }
        for col in required_map.get(dataset_type, []):
            if col in df.columns:
                bad = df[col].isna() | (df[col].astype(str).str.strip() == "")
                if bad.any():
                    rejected_df = pd.concat([rejected_df, df[bad]], ignore_index=True)
                    df = df[~bad].copy()

        # ── time_in fallback for history ─────────────────────────────────────
        if dataset_type == "history":
            if "time_in" in df.columns:
                fallback = pd.to_datetime(
                    df.get("move_complete_time", pd.Series([pd.NaT] * len(df), index=df.index)),
                    errors="coerce",
                )
                df["time_in"] = (
                    pd.to_datetime(df["time_in"], errors="coerce")
                    .fillna(fallback)
                    .fillna(pd.Timestamp("2020-01-01"))
                )
            else:
                df["time_in"] = pd.Timestamp("2020-01-01")

        if df.empty:
            rejected_count = len(rejected_df)
            status = "failed" if accepted_count == 0 else "partial"
            _update_ingestion_log(
                ingestion_id=ingestion_id,
                status=status,
                accepted_count=accepted_count,
                rejected_count=rejected_count,
                error_summary="No valid rows remained after validation.",
            )
            return {
                "status":         status,
                "dataset_type":   dataset_type,
                "accepted_count": accepted_count,
                "rejected_count": rejected_count,
                "ingestion_id":   ingestion_id,
                "message":        "No valid rows remained after validation.",
            }

        # ── Ensure tables exist ───────────────────────────────────────────────
        for yard in df["yard_id"].dropna().unique():
            ensure_yard_tables(engine, str(yard).lower().strip())

        # ── Insert per yard ───────────────────────────────────────────────────
        for yard, yard_df in df.groupby("yard_id"):
            yard_lower = str(yard).lower().strip()
            yard_acc, yard_rej, yard_err = _insert_yard_data(
                engine=engine,
                yard=yard_lower,
                dataset_type=dataset_type,
                df=yard_df,
                ingestion_id=ingestion_id,
                background_tasks=background_tasks,
            )
            accepted_count += yard_acc
            rejected_count += yard_rej
            if yard_err:
                insert_errors.append(yard_err)

        rejected_count += len(rejected_df)

        # ── Log rejected samples ──────────────────────────────────────────────
        if not rejected_df.empty:
            sample = rejected_df.head(10)
            try:
                with engine.begin() as conn:
                    for _, rej_row in sample.iterrows():
                        conn.execute(
                            text("""
                                INSERT INTO rejection_logs
                                    (ingestion_id, row_data, reason)
                                VALUES (:id, :data, :reason)
                            """),
                            {
                                "id":     ingestion_id,
                                "data":   json.dumps(
                                    _clean_row(rej_row.to_dict()), default=str
                                ),
                                "reason": "No yard detected or missing required field",
                            },
                        )
            except Exception as rej_exc:
                logger.warning(
                    "[Ingestion] Could not write rejection samples for %s: %s",
                    ingestion_id, rej_exc,
                )

        status = (
            "success"  if not insert_errors and rejected_count == 0
            else "partial" if accepted_count > 0
            else "failed"
        )

    except Exception as exc:
        logger.exception("[Ingestion] Worker failed for %s", ingestion_id)
        accepted_count = 0
        rejected_count = len(df) if isinstance(df, pd.DataFrame) else 0
        status = "failed"
        insert_errors = [str(exc)]

    try:
        _update_ingestion_log(
            ingestion_id=ingestion_id,
            status=status,
            accepted_count=accepted_count,
            rejected_count=rejected_count,
            error_summary="\n".join(insert_errors) if insert_errors else None,
        )
    except Exception as update_exc:
        logger.error(
            "[Ingestion] Failed to update ingestion log %s: %s",
            ingestion_id, update_exc, exc_info=True,
        )

    # ── Trigger retraining after successful history ingestion ─────────────────
    if dataset_type == "history" and accepted_count > 0:
        try:
            # Pass background_tasks when available so it runs asynchronously;
            # retraining_service falls back to a thread when it is None.
            check_and_trigger_retraining(background_tasks)
        except Exception as retrain_exc:
            logger.warning(
                "[Ingestion] Retraining trigger failed for %s: %s",
                ingestion_id, retrain_exc,
            )

    try:
        log_audit(
            "Ingestion",
            f"Ingested {dataset_type} {filename}: "
            f"{accepted_count} accepted, {rejected_count} rejected",
            admin_id,
        )
    except Exception as audit_exc:
        logger.warning("[Ingestion] Audit log failed: %s", audit_exc)

    logger.info(
        "[Ingestion] %s (%s) done: %d accepted / %d rejected / errors=%s",
        filename, dataset_type, accepted_count, rejected_count, insert_errors,
    )

    message = "Ingestion completed."
    if status == "partial":
        message = "Ingestion completed with some rejected rows."
    elif status == "failed":
        message = "Ingestion failed."

    return {
        "status":         status,
        "dataset_type":   dataset_type,
        "accepted_count": accepted_count,
        "rejected_count": rejected_count,
        "ingestion_id":   ingestion_id,
        "message":        message,
        "errors":         insert_errors or None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Per-yard dispatch
# ─────────────────────────────────────────────────────────────────────────────

def _insert_yard_data(
    engine,
    yard: str,
    dataset_type: str,
    df: pd.DataFrame,
    ingestion_id: str,
    background_tasks=None,
) -> tuple[int, int, str]:
    accepted = 0
    rejected = 0
    error_str = ""

    try:
        if dataset_type == "crane":
            accepted, rejected, error_str = _insert_crane_operations(
                engine, yard, df, ingestion_id
            )
        elif dataset_type in ("history", "current"):
            record_type = "history" if dataset_type == "history" else "current"
            accepted, rejected, error_str = _insert_container_operations(
                engine, yard, df, ingestion_id, record_type=record_type
            )

        # FIX: run vessel summary update as a background task so it never
        # blocks the HTTP response.  Falls back to inline if no task runner.
        if accepted > 0:
            if background_tasks is not None:
                background_tasks.add_task(_update_vessel_visits, engine, yard, df, dataset_type)
            else:
                try:
                    _update_vessel_visits(engine, yard, df, dataset_type)
                except Exception as e:
                    logger.warning("[Ingestion] Summary update failed for %s: %s", yard, e)

    except Exception as e:
        error_str = f"{yard}/{dataset_type}: {e}"
        rejected = len(df)

    return accepted, rejected, error_str


# ─────────────────────────────────────────────────────────────────────────────
# Unified container insert
# ─────────────────────────────────────────────────────────────────────────────

def _insert_container_operations(
    engine,
    yard: str,
    df: pd.DataFrame,
    ingestion_id: str,
    record_type: str = "history",
):
    tbl = f"{yard}_container_operations"

    cols = [
        "unit_id", "unit_visit_gkey", "outbound_service",
        "actual_outbound_carrier_visit_id", "inbound_service",
        "actual_inbound_carrier_visit_id", "facility_id", "yard_id",
        "complex_id", "category_id", "freight_kind", "arrival_mode",
        "visit_state", "transit_state", "time_in", "time_out",
        "move_complete_time", "equipment_class", "container_length",
        "equipment_type", "unit_weight_in_kg", "verified_gross_mass_kg",
        "reefer", "oog_unit", "hazardous_flag", "hazard_un_numbers",
        "imdg_code", "port_of_discharge", "destination",
        "ctr_from_position", "ctr_to_position", "current_position",
        "stow_code_1", "stow_code_2", "stow_code_3",
    ]

    valid_cols = [c for c in cols if c in df.columns]
    insert_df = df[valid_cols].copy()

    insert_df["record_type"]  = record_type
    insert_df["ingestion_id"] = ingestion_id
    insert_df["updated_at"]   = _utcnow_naive()
    insert_df["created_at"]   = _utcnow_naive()

    time_cols = ["time_in", "time_out", "move_complete_time"]
    for c in time_cols:
        if c in insert_df.columns:
            insert_df[c] = pd.to_datetime(insert_df[c], errors="coerce")
            if c == "time_in" and record_type == "history":
                insert_df[c] = insert_df[c].fillna(pd.Timestamp("2020-01-01"))

    non_time = [
        c for c in insert_df.columns
        if c not in time_cols + ["unit_weight_in_kg", "verified_gross_mass_kg", "created_at", "updated_at"]
    ]
    insert_df = _ensure_text_columns(insert_df, non_time)

    accepted = 0
    errors: list[str] = []
    metadata_obj = MetaData()
    table = Table(tbl, metadata_obj, autoload_with=engine)

    for start in range(0, len(insert_df), _CHUNK_SIZE):
        chunk = insert_df.iloc[start: start + _CHUNK_SIZE]
        try:
            records = _prepare_records(chunk)
            if not records:
                continue

            if record_type == "current":
                stmt = pg_insert(table).values(records)
                update_set = {
                    c.name: stmt.excluded[c.name]
                    for c in table.columns
                    if c.name not in {"id", "unit_id", "created_at"}
                    and c.name in chunk.columns
                }
                stmt = stmt.on_conflict_do_update(
                    index_elements=["unit_id", "yard_id"],
                    set_=update_set,
                )
                with engine.begin() as conn:
                    conn.execute(stmt)
            else:
                with engine.begin() as conn:
                    conn.execute(table.insert(), records)

            accepted += len(chunk)
        except Exception as e:
            errors.append(str(e))
            logger.error("[Ingestion] Container insert error for %s: %s", yard, e)


    # FIX: sync active containers to legacy current_containers table for backward compat
    if record_type == "current" and accepted > 0:
        legacy_tbl = f"{yard}_current_containers"
        try:
            legacy_meta = MetaData()
            legacy_table = Table(legacy_tbl, legacy_meta, autoload_with=engine)
            legacy_cols = {c.name for c in legacy_table.columns}

            legacy_df = insert_df.copy()
            # Drop time columns that were removed from current_containers schema
            for drop_col in ("move_complete_time", "time_in", "time_out", "record_type"):
                if drop_col in legacy_df.columns:
                    legacy_df = legacy_df.drop(columns=[drop_col])

            # Only keep columns that exist in the legacy table
            keep = [c for c in legacy_df.columns if c in legacy_cols]
            legacy_df = legacy_df[keep]

            legacy_records = _prepare_records(legacy_df)
            if legacy_records:
                legacy_stmt = pg_insert(legacy_table).values(legacy_records)
                legacy_update = {
                    c.name: legacy_stmt.excluded[c.name]
                    for c in legacy_table.columns
                    if c.name not in {"id", "unit_id", "created_at"}
                    and c.name in legacy_df.columns
                }
                legacy_stmt = legacy_stmt.on_conflict_do_update(
                    index_elements=["unit_id"],
                    set_=legacy_update,
                )
                with engine.begin() as conn:
                    conn.execute(legacy_stmt)
        except Exception as leg_exc:
            logger.warning("[Ingestion] Legacy current_containers sync skipped for %s: %s", yard, leg_exc)

    return accepted, len(df) - accepted, "; ".join(errors)

# ─────────────────────────────────────────────────────────────────────────────
# Unified crane insert
# ─────────────────────────────────────────────────────────────────────────────

def _insert_crane_operations(
    engine,
    yard: str,
    df: pd.DataFrame,
    ingestion_id: str,
):
    tbl = f"{yard}_crane_operations"

    cols = [
        "crane_id", "unit_id", "carrier_visit", "event_type", "move_kind",
        "line_op", "unit_category", "exclude", "time_completed",
        "from_position", "to_position", "yard_id",
    ]

    valid_cols = [c for c in cols if c in df.columns]
    insert_df = df[valid_cols].copy()
    insert_df["ingestion_id"] = ingestion_id
    insert_df["created_at"]   = _utcnow_naive()

    if "time_completed" in insert_df.columns:
        insert_df["time_completed"] = pd.to_datetime(
            insert_df["time_completed"], errors="coerce"
        )

    non_time = [c for c in insert_df.columns if c not in ["time_completed", "created_at"]]
    insert_df = _ensure_text_columns(insert_df, non_time)

    accepted = 0
    errors: list[str] = []
    metadata_obj = MetaData()
    table = Table(tbl, metadata_obj, autoload_with=engine)

    for start in range(0, len(insert_df), _CHUNK_SIZE):
        chunk = insert_df.iloc[start: start + _CHUNK_SIZE]
        try:
            records = _prepare_records(chunk)
            if not records:
                continue
            with engine.begin() as conn:
                conn.execute(table.insert(), records)
            accepted += len(chunk)
        except Exception as e:
            errors.append(str(e))
            logger.error("[Ingestion] Crane insert error for %s: %s", yard, e)

    return accepted, len(df) - accepted, "; ".join(errors)


# ─────────────────────────────────────────────────────────────────────────────
# Vessel visit summary update  (includes avg_mphc calculation)
# ─────────────────────────────────────────────────────────────────────────────

def _update_vessel_visits(engine, yard: str, df: pd.DataFrame, dataset_type: str):
    """
    Background summary update: refresh vessel_visits with aggregated metrics
    from the newly ingested data, including avg_mphc from crane productivity.
    """
    from db.queries import load_from_db

    vv_tbl = f"{yard}_vessel_visits"

    visit_col = (
        "actual_outbound_carrier_visit_id"
        if dataset_type != "crane"
        else "carrier_visit"
    )
    if visit_col not in df.columns:
        return

    unique_visits = df[visit_col].dropna().unique()

    for visit_id in unique_visits:
        visit_id = str(visit_id).strip()
        if not visit_id:
            continue

        hist_df  = load_from_db("history", vessel_id=visit_id, yard_id=yard)
        crane_df = load_from_db("crane",   vessel_id=visit_id, yard_id=yard)

        if hist_df.empty and crane_df.empty:
            continue

        # ── Container counts ─────────────────────────────────────────────────
        total_cnt  = len(hist_df)
        total_load = 0
        total_disc = 0
        if "category_id" in hist_df.columns:
            total_load = int(
                hist_df["category_id"]
                .astype(str).str.upper()
                .str.contains("EXPORT|LOAD", na=False)
                .sum()
            )
            total_disc = int(
                hist_df["category_id"]
                .astype(str).str.upper()
                .str.contains("IMPORT|DISCH", na=False)
                .sum()
            )

        # ── Move time window ─────────────────────────────────────────────────
        first_move = None
        last_move  = None
        if not crane_df.empty and "time_completed" in crane_df.columns:
            moves = pd.to_datetime(crane_df["time_completed"]).dropna().sort_values()
            if not moves.empty:
                first_move = moves.iloc[0]
                last_move  = moves.iloc[-1]

        # ── Crane count ───────────────────────────────────────────────────────
        avg_cranes = 0.0
        if not crane_df.empty and "crane_id" in crane_df.columns:
            avg_cranes = float(crane_df["crane_id"].nunique())

        # ── MPHC (moves per hour per crane) ───────────────────────────────────
        avg_mphc = 0.0
        if not crane_df.empty and "crane_id" in crane_df.columns and "time_completed" in crane_df.columns:
            crane_df = crane_df.copy()
            crane_df["time_completed"] = pd.to_datetime(
                crane_df["time_completed"], errors="coerce"
            )
            valid_crane = (
                crane_df[crane_df["exclude"] != "Yes"]
                if "exclude" in crane_df.columns
                else crane_df
            )
            total_crane_hours = 0.0
            for _, cgrp in valid_crane.groupby("crane_id"):
                cmin = cgrp["time_completed"].min()
                cmax = cgrp["time_completed"].max()
                if pd.notna(cmin) and pd.notna(cmax):
                    total_crane_hours += max(
                        (cmax - cmin).total_seconds() / 3600, 0.1
                    )
            eff_moves = len(valid_crane)
            if total_crane_hours > 0 and eff_moves > 0:
                n_cranes = max(int(valid_crane["crane_id"].nunique()), 1)
                avg_mphc = round(
                    min((eff_moves / total_crane_hours) / n_cranes, 999.0), 2
                )

        # ── Stay hours ────────────────────────────────────────────────────────
        stay_hrs = None
        if not hist_df.empty:
            if "time_in" in hist_df.columns and "time_out" in hist_df.columns:
                t_in  = pd.to_datetime(hist_df["time_in"]).min()
                t_out = pd.to_datetime(hist_df["time_out"]).max()
                if pd.notna(t_in) and pd.notna(t_out):
                    stay_hrs = round(
                        (t_out - t_in).total_seconds() / 3600.0, 2
                    )

        # ── Outbound service ──────────────────────────────────────────────────
        outbound_service = None
        if not hist_df.empty and "outbound_service" in hist_df.columns:
            outbound_service = hist_df["outbound_service"].dropna().iloc[0] if hist_df["outbound_service"].notna().any() else None

        # ── Upsert ────────────────────────────────────────────────────────────
        metadata_obj = MetaData()
        table = Table(vv_tbl, metadata_obj, autoload_with=engine)

        record = {
            "vessel_visit_id":   visit_id,
            "outbound_service":  outbound_service,
            "total_containers":  total_cnt,
            "total_loaded":      total_load,
            "total_discharged":  total_disc,
            "avg_crane_count":   avg_cranes,
            "avg_mphc":          avg_mphc,
            "first_move_time":   first_move,
            "last_move_time":    last_move,
            "stay_hours":        stay_hrs,
            "yard_id":           yard,
            "updated_at":        _utcnow_naive(),
        }

        stmt = pg_insert(table).values(record)
        update_set = {k: v for k, v in record.items() if k != "vessel_visit_id"}
        stmt = stmt.on_conflict_do_update(
            index_elements=["vessel_visit_id"],
            set_=update_set,
        )

        with engine.begin() as conn:
            conn.execute(stmt)


# ─────────────────────────────────────────────────────────────────────────────
# Log endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/logs")
def get_ingestion_logs(
    limit: int = 50,
    admin: dict = Depends(require_admin),
):
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