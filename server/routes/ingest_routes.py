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
from fastapi import APIRouter, Depends, File, Query, UploadFile
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
    "actual_inbound_carrier_visit_id": "actual_inbound_carrier_visit_id",
    "actual_inbound_carrier_visit": "actual_inbound_carrier_visit_id",
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


def _drop_current_time_fields(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    drop_cols = [c for c in ("move_complete_time", "time_in", "time_out", "time_completed") if c in df.columns]
    if drop_cols:
        df = df.drop(columns=drop_cols, errors="ignore")
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Dataset type detection
# ─────────────────────────────────────────────────────────────────────────────

def _detect_type(df: pd.DataFrame, explicit: Optional[str]) -> Optional[str]:
    if explicit and explicit.lower() in ("history", "current", "crane"):
        return explicit.lower()

    cols = set(df.columns)

    if {"crane_id", "carrier_visit"}.issubset(cols):
        return "crane"

    if "visit_state" in cols or "transit_state" in cols:
        sample_text = ""
        if "visit_state" in cols:
            sample_text += " ".join(df["visit_state"].dropna().astype(str).unique()[:25])
        if "transit_state" in cols:
            sample_text += " ".join(df["transit_state"].dropna().astype(str).unique()[:25])
        sample_text = sample_text.upper()
        if "DEPART" in sample_text:
            return "history"
        return "current"

    if "time_out" in cols:
        non_null_ratio = df["time_out"].notna().mean()
        return "history" if non_null_ratio >= 0.30 else "current"

    if {"unit_id", "outbound_service"}.issubset(cols):
        return "history"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]


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


def _fail(reason: str) -> dict:
    return {
        "status": "failed",
        "dataset_type": "unknown",
        "accepted_count": 0,
        "rejected_count": 0,
        "ingestion_id": None,
        "rejections": [{"row": {}, "reason": reason}],
    }


def _utcnow_naive() -> datetime:
    return datetime.utcnow()


def _parse_dt_series(series: pd.Series, col_name: str) -> pd.Series:
    parsed = parse_datetime(series, col_name)
    parsed = pd.to_datetime(parsed, errors="coerce")
    try:
        if getattr(parsed.dt, "tz", None) is not None:
            parsed = parsed.dt.tz_convert(None)
    except Exception:
        pass
    return parsed


def _coerce_datetime_columns(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    df = df.copy()
    for col in columns:
        if col in df.columns:
            df[col] = _parse_dt_series(df[col], col)
    return df


def _ensure_text_columns(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    df = df.copy()
    for col in columns:
        if col in df.columns:
            df[col] = df[col].astype("object")
    return df


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
                "id": ingestion_id,
                "fn": filename,
                "h": file_hash,
                "dt": dataset_type,
                "tot": total_rows,
                "uid": uploaded_by,
            },
        )


def _update_ingestion_log(
    ingestion_id: str,
    status: str,
    accepted_count: int,
    rejected_count: int,
    error_summary: str | None,
) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE ingestion_logs
                SET status = :s,
                    records_accepted = :acc,
                    records_rejected = :rej,
                    completed_at = :now,
                    error_summary = :err
                WHERE id = :id
            """),
            {
                "s": status,
                "acc": accepted_count,
                "rej": rejected_count,
                "id": ingestion_id,
                "now": _utcnow_naive(),
                "err": error_summary,
            },
        )


def _safe_get_yard_from_position(value: str | None) -> str | None:
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


def _derive_yard_id_from_row(row: pd.Series, dataset_type: str) -> str | None:
    for key in ("yard_id", "facility_id", "complex_id"):
        val = row.get(key)
        y = _safe_get_yard_from_position(val)
        if y:
            return y.lower()

    if dataset_type == "crane":
        for key in ("from_position", "to_position"):
            y = _safe_get_yard_from_position(row.get(key))
            if y:
                return y.lower()

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


def _prepare_records(df: pd.DataFrame) -> list[dict]:
    records: list[dict] = []
    for rec in df.to_dict(orient="records"):
        clean = {}
        for k, v in rec.items():
            clean[k] = _safe_scalar(v)
        records.append(clean)
    return records


def _ensure_current_position(df: pd.DataFrame) -> pd.DataFrame:
    """
    Current dataset must be position-only. If current_position is missing,
    derive it from ctr_to_position, then ctr_from_position.
    """
    df = df.copy()
    if "current_position" not in df.columns:
        df["current_position"] = None

    if "ctr_to_position" in df.columns:
        df["current_position"] = df["current_position"].fillna(df["ctr_to_position"])
    if "ctr_from_position" in df.columns:
        df["current_position"] = df["current_position"].fillna(df["ctr_from_position"])

    return df


# ─────────────────────────────────────────────────────────────────────────────
# Upload endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_data(
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
                        "unit_id",
                        "unit id",
                        "unit nbr",
                        "unit nbr.",
                        "time completed",
                        "move complete time",
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
        # current snapshot must not keep movement timestamps
        df = _drop_current_time_fields(df)
        df = _ensure_current_position(df)

    if dataset_type == "history":
        for col in ("move_complete_time", "time_in", "time_out"):
            if col in df.columns:
                df[col] = _parse_dt_series(df[col], col)

        if "time_completed" in df.columns and "move_complete_time" not in df.columns:
            df["move_complete_time"] = _parse_dt_series(df["time_completed"], "move_complete_time")
        if "carrier_visit" in df.columns and "actual_outbound_carrier_visit_id" not in df.columns:
            df["actual_outbound_carrier_visit_id"] = df["carrier_visit"]
        if "from_position" in df.columns and "ctr_from_position" not in df.columns:
            df["ctr_from_position"] = df["from_position"]
        if "to_position" in df.columns and "ctr_to_position" not in df.columns:
            df["ctr_to_position"] = df["to_position"]

    if dataset_type == "crane":
        if "time_completed" in df.columns:
            df["time_completed"] = _parse_dt_series(df["time_completed"], "time_completed")
        if "move_kind" in df.columns:
            df["move_kind"] = (
                df["move_kind"]
                .astype(str)
                .str.strip()
                .str.upper()
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
):
    engine = get_engine()
    from db.queries import ensure_yard_tables

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

        if dataset_type == "crane":
            df = _coerce_datetime_columns(df, ["time_completed"])

        if dataset_type == "crane":
            df["yard_id"] = df.apply(
                lambda row: _derive_yard_id_from_row(row, "crane"),
                axis=1,
            )
        else:
            if "yard_id" not in df.columns or df["yard_id"].isna().all():
                df["yard_id"] = df.apply(
                    lambda row: _derive_yard_id_from_row(row, dataset_type),
                    axis=1,
                )

        no_yard_mask = (
            df["yard_id"].isna()
            | (df["yard_id"].astype(str).str.strip().isin(["", "nan", "None"]))
        )
        rejected_df = df[no_yard_mask].copy()
        df = df[~no_yard_mask].copy()

        required_map = {
            "history": ["unit_id", "actual_outbound_carrier_visit_id"],
            "current": ["unit_id", "actual_outbound_carrier_visit_id"],
            "crane": ["crane_id", "carrier_visit", "move_kind"],
        }

        for col in required_map.get(dataset_type, []):
            if col in df.columns:
                bad = df[col].isna() | (df[col].astype(str).str.strip() == "")
                if bad.any():
                    rejected_df = pd.concat([rejected_df, df[bad]], ignore_index=True)
                    df = df[~bad].copy()

        if dataset_type == "history":
            if "time_in" in df.columns:
                fallback = df.get(
                    "move_complete_time",
                    pd.Series([pd.NaT] * len(df), index=df.index),
                )
                df["time_in"] = pd.to_datetime(df["time_in"], errors="coerce")
                fallback = pd.to_datetime(fallback, errors="coerce")
                df["time_in"] = df["time_in"].fillna(fallback).fillna(pd.Timestamp("2020-01-01"))
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
                "status": status,
                "dataset_type": dataset_type,
                "accepted_count": accepted_count,
                "rejected_count": rejected_count,
                "ingestion_id": ingestion_id,
                "message": "No valid rows remained after validation.",
            }

        for yard in df["yard_id"].dropna().unique():
            ensure_yard_tables(engine, str(yard).lower().strip())

        for yard, yard_df in df.groupby("yard_id"):
            yard_lower = str(yard).lower().strip()
            yard_acc, yard_rej, yard_err = _insert_yard_data(
                engine=engine,
                yard=yard_lower,
                dataset_type=dataset_type,
                df=yard_df,
                ingestion_id=ingestion_id,
            )
            accepted_count += yard_acc
            rejected_count += yard_rej
            if yard_err:
                insert_errors.append(yard_err)

        rejected_count += len(rejected_df)

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
                                "id": ingestion_id,
                                "data": json.dumps(_clean_row(rej_row.to_dict()), default=str),
                                "reason": "No yard detected or missing required field",
                            },
                        )
            except Exception as rej_exc:
                logger.warning(
                    "[Ingestion] Could not write rejection samples for %s: %s",
                    ingestion_id,
                    rej_exc,
                )

        status = (
            "success"
            if not insert_errors and rejected_count == 0
            else "partial"
            if accepted_count > 0
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
            ingestion_id,
            update_exc,
            exc_info=True,
        )

    if dataset_type == "history" and accepted_count > 0:
        try:
            check_and_trigger_retraining()
        except TypeError:
            logger.warning(
                "[Ingestion] retraining hook signature mismatch; skipped for %s",
                ingestion_id,
            )
        except Exception as retrain_exc:
            logger.warning(
                "[Ingestion] Retraining trigger failed for %s: %s",
                ingestion_id,
                retrain_exc,
            )

    try:
        log_audit(
            "Ingestion",
            f"Ingested {dataset_type} {filename}: {accepted_count} accepted, {rejected_count} rejected",
            admin_id,
        )
    except Exception as audit_exc:
        logger.warning("[Ingestion] Audit log failed: %s", audit_exc)

    logger.info(
        "[Ingestion] %s (%s) done: %d accepted / %d rejected / errors=%s",
        filename,
        dataset_type,
        accepted_count,
        rejected_count,
        insert_errors,
    )

    message = "Ingestion completed."
    if status == "partial":
        message = "Ingestion completed with some rejected rows."
    elif status == "failed":
        message = "Ingestion failed."

    return {
        "status": status,
        "dataset_type": dataset_type,
        "accepted_count": accepted_count,
        "rejected_count": rejected_count,
        "ingestion_id": ingestion_id,
        "message": message,
        "errors": insert_errors or None,
    }


def _insert_yard_data(
    engine,
    yard: str,
    dataset_type: str,
    df: pd.DataFrame,
    ingestion_id: str,
) -> tuple[int, int, str]:
    accepted = 0
    rejected = 0
    error_str = ""

    try:
        if dataset_type == "crane":
            accepted, rejected, error_str = _insert_crane(engine, yard, df, ingestion_id)
        elif dataset_type == "current":
            accepted, rejected, error_str = _insert_current(engine, yard, df, ingestion_id)
        else:
            accepted, rejected, error_str = _insert_history_split(
                engine, yard, df, ingestion_id
            )
    except Exception as e:
        error_str = f"{yard}/{dataset_type}: {e}"
        rejected = len(df)

    return accepted, rejected, error_str


# ─────────────────────────────────────────────────────────────────────────────
# Crane insert (split into 3 tables)
# ─────────────────────────────────────────────────────────────────────────────

def _insert_crane(engine, yard: str, df: pd.DataFrame, ingestion_id: str):
    core_tbl = f"{yard}_crane_movements_core"
    pos_tbl = f"{yard}_crane_movements_position"
    meta_tbl = f"{yard}_crane_movements_meta"

    core_cols = [
        "crane_id",
        "unit_id",
        "carrier_visit",
        "event_type",
        "move_kind",
        "line_op",
        "unit_category",
        "exclude",
        "time_completed",
        "yard_id",
    ]
    pos_cols = [
        "unit_id",
        "carrier_visit",
        "from_position",
        "to_position",
        "yard_id",
    ]
    meta_cols = [
        "unit_id",
        "carrier_visit",
        "yard_id",
    ]

    core_df = df[[c for c in core_cols if c in df.columns]].copy()
    pos_df = df[[c for c in pos_cols if c in df.columns]].copy()
    meta_df = df[[c for c in meta_cols if c in df.columns]].copy()

    for sub in (core_df, pos_df, meta_df):
        sub["ingestion_id"] = ingestion_id
        sub["created_at"] = _utcnow_naive()

    if "time_completed" in core_df.columns:
        core_df = _coerce_datetime_columns(core_df, ["time_completed"])

    core_df = _ensure_text_columns(
        core_df,
        [
            "crane_id",
            "unit_id",
            "carrier_visit",
            "event_type",
            "move_kind",
            "line_op",
            "unit_category",
            "exclude",
            "yard_id",
            "ingestion_id",
        ],
    )
    pos_df = _ensure_text_columns(
        pos_df,
        [
            "unit_id",
            "carrier_visit",
            "from_position",
            "to_position",
            "yard_id",
            "ingestion_id",
        ],
    )
    meta_df = _ensure_text_columns(
        meta_df,
        [
            "unit_id",
            "carrier_visit",
            "yard_id",
            "ingestion_id",
        ],
    )

    accepted = 0
    errors: list[str] = []

    for tbl, sub_df in [(core_tbl, core_df), (pos_tbl, pos_df), (meta_tbl, meta_df)]:
        if sub_df.empty:
            continue

        metadata = MetaData()
        table = Table(tbl, metadata, autoload_with=engine)

        for start in range(0, len(sub_df), _CHUNK_SIZE):
            chunk = sub_df.iloc[start : start + _CHUNK_SIZE]
            try:
                records = _prepare_records(chunk)
                if not records:
                    continue
                with engine.begin() as conn:
                    conn.execute(table.insert(), records)
                if tbl == core_tbl:
                    accepted += len(chunk)
            except Exception as e:
                errors.append(f"{tbl}: {e}")
                logger.error("[Ingestion] Crane insert error for %s: %s", yard, e, exc_info=True)

    return accepted, len(df) - accepted, "; ".join(errors)


# ─────────────────────────────────────────────────────────────────────────────
# Current insert (single table, position-only snapshot)
# ─────────────────────────────────────────────────────────────────────────────

def _insert_current(engine, yard: str, df: pd.DataFrame, ingestion_id: str):
    tbl = f"{yard}_current_containers"

    cols = [
        "unit_id",
        "outbound_service",
        "actual_outbound_carrier_visit_id",
        "unit_visit_gkey",
        "category_id",
        "equipment_class",
        "container_length",
        "equipment_type",
        "freight_kind",
        "unit_weight_in_kg",
        "verified_gross_mass_kg",
        "reefer",
        "oog_unit",
        "hazardous_flag",
        "hazard_un_numbers",
        "imdg_code",
        "port_of_discharge",
        "destination",
        "inbound_service",
        "actual_inbound_carrier_visit_id",
        "arrival_mode",
        "ctr_from_position",
        "ctr_to_position",
        "current_position",
        "stow_code_1",
        "stow_code_2",
        "stow_code_3",
        "visit_state",
        "transit_state",
        "yard_id",
        "complex_id",
        "facility_id",
    ]

    valid_cols = [c for c in cols if c in df.columns]
    insert_df = df[valid_cols].copy()

    insert_df = _ensure_current_position(insert_df)
    insert_df["ingestion_id"] = ingestion_id
    insert_df["is_active"] = True
    insert_df["updated_at"] = _utcnow_naive()
    insert_df["created_at"] = _utcnow_naive()

    # current table must not contain movement timestamps
    for drop_col in ("time_in", "time_out", "move_complete_time", "time_completed"):
        if drop_col in insert_df.columns:
            insert_df = insert_df.drop(columns=[drop_col])

    insert_df = _ensure_text_columns(
        insert_df,
        [
            "unit_id",
            "outbound_service",
            "actual_outbound_carrier_visit_id",
            "unit_visit_gkey",
            "category_id",
            "equipment_class",
            "container_length",
            "equipment_type",
            "freight_kind",
            "reefer",
            "oog_unit",
            "hazardous_flag",
            "hazard_un_numbers",
            "imdg_code",
            "port_of_discharge",
            "destination",
            "inbound_service",
            "actual_inbound_carrier_visit_id",
            "arrival_mode",
            "ctr_from_position",
            "ctr_to_position",
            "current_position",
            "stow_code_1",
            "stow_code_2",
            "stow_code_3",
            "visit_state",
            "transit_state",
            "yard_id",
            "complex_id",
            "facility_id",
            "ingestion_id",
        ],
    )

    insert_df = insert_df.drop_duplicates(subset=["unit_id"], keep="last")

    errors: list[str] = []
    accepted = 0

    metadata = MetaData()
    table = Table(tbl, metadata, autoload_with=engine)

    for start in range(0, len(insert_df), _CHUNK_SIZE):
        chunk = insert_df.iloc[start : start + _CHUNK_SIZE]
        try:
            records = _prepare_records(chunk)
            if not records:
                continue

            stmt = pg_insert(table).values(records)
            update_set = {
                c.name: stmt.excluded[c.name]
                for c in table.columns
                if c.name not in {"id", "unit_id", "created_at"} and c.name in chunk.columns
            }
            stmt = stmt.on_conflict_do_update(
                index_elements=["unit_id"],
                set_=update_set,
            )

            with engine.begin() as conn:
                conn.execute(stmt)

            accepted += len(chunk)
        except Exception as e:
            errors.append(str(e))
            logger.error("[Ingestion] Current insert error for %s: %s", yard, e, exc_info=True)

    return accepted, len(df) - accepted, "; ".join(errors)


# ─────────────────────────────────────────────────────────────────────────────
# History split insert
# ─────────────────────────────────────────────────────────────────────────────

def _insert_history_split(engine, yard: str, df: pd.DataFrame, ingestion_id: str):
    core_tbl = f"{yard}_history_containers_core"
    cargo_tbl = f"{yard}_history_containers_cargo"
    pos_tbl = f"{yard}_history_containers_position"

    core_cols = [
        "unit_id",
        "unit_visit_gkey",
        "outbound_service",
        "actual_outbound_carrier_visit_id",
        "inbound_service",
        "actual_inbound_carrier_visit_id",
        "facility_id",
        "yard_id",
        "complex_id",
        "category_id",
        "freight_kind",
        "arrival_mode",
        "visit_state",
        "transit_state",
        "time_in",
        "time_out",
        "move_complete_time",
    ]
    core_df = df[[c for c in core_cols if c in df.columns]].copy()
    core_df["ingestion_id"] = ingestion_id
    core_df["created_at"] = _utcnow_naive()
    core_df["updated_at"] = _utcnow_naive()
    core_df = _coerce_datetime_columns(core_df, ["time_in", "time_out", "move_complete_time"])
    core_df = _ensure_text_columns(
        core_df,
        [
            "unit_id",
            "unit_visit_gkey",
            "outbound_service",
            "actual_outbound_carrier_visit_id",
            "inbound_service",
            "actual_inbound_carrier_visit_id",
            "facility_id",
            "yard_id",
            "complex_id",
            "category_id",
            "freight_kind",
            "arrival_mode",
            "visit_state",
            "transit_state",
            "ingestion_id",
        ],
    )

    if "time_in" not in core_df.columns or core_df["time_in"].isna().all():
        if "move_complete_time" in core_df.columns:
            core_df["time_in"] = pd.to_datetime(core_df["move_complete_time"], errors="coerce").fillna(
                pd.Timestamp("2020-01-01")
            )
        else:
            core_df["time_in"] = pd.Timestamp("2020-01-01")

    cargo_cols = [
        "unit_id",
        "actual_outbound_carrier_visit_id",
        "yard_id",
        "equipment_class",
        "container_length",
        "equipment_type",
        "unit_weight_in_kg",
        "verified_gross_mass_kg",
        "reefer",
        "oog_unit",
        "hazardous_flag",
        "hazard_un_numbers",
        "imdg_code",
        "port_of_discharge",
        "destination",
    ]
    cargo_df = df[[c for c in cargo_cols if c in df.columns]].copy()
    cargo_df["ingestion_id"] = ingestion_id
    cargo_df["created_at"] = _utcnow_naive()
    cargo_df = _ensure_text_columns(
        cargo_df,
        [
            "unit_id",
            "actual_outbound_carrier_visit_id",
            "yard_id",
            "equipment_class",
            "container_length",
            "equipment_type",
            "reefer",
            "oog_unit",
            "hazardous_flag",
            "hazard_un_numbers",
            "imdg_code",
            "port_of_discharge",
            "destination",
            "ingestion_id",
        ],
    )

    pos_cols = [
        "unit_id",
        "actual_outbound_carrier_visit_id",
        "yard_id",
        "ctr_from_position",
        "ctr_to_position",
        "current_position",
        "stow_code_1",
        "stow_code_2",
        "stow_code_3",
    ]
    pos_df = df[[c for c in pos_cols if c in df.columns]].copy()
    pos_df["ingestion_id"] = ingestion_id
    pos_df["created_at"] = _utcnow_naive()
    pos_df = _ensure_text_columns(
        pos_df,
        [
            "unit_id",
            "actual_outbound_carrier_visit_id",
            "yard_id",
            "ctr_from_position",
            "ctr_to_position",
            "current_position",
            "stow_code_1",
            "stow_code_2",
            "stow_code_3",
            "ingestion_id",
        ],
    )

    errors: list[str] = []
    accepted = 0
    total = len(df)

    for tbl, sub_df in [(core_tbl, core_df), (cargo_tbl, cargo_df), (pos_tbl, pos_df)]:
        if sub_df.empty:
            continue

        metadata = MetaData()
        table = Table(tbl, metadata, autoload_with=engine)

        for start in range(0, len(sub_df), _CHUNK_SIZE):
            chunk = sub_df.iloc[start : start + _CHUNK_SIZE]
            try:
                records = _prepare_records(chunk)
                if not records:
                    continue
                with engine.begin() as conn:
                    conn.execute(table.insert(), records)
                if tbl == core_tbl:
                    accepted += len(chunk)
            except Exception as e:
                errors.append(f"{tbl}: {e}")
                logger.error("[Ingestion] History split insert error [%s]: %s", tbl, e, exc_info=True)

    rejected = total - accepted
    return accepted, rejected, "; ".join(errors)


# ─────────────────────────────────────────────────────────────────────────────
# Yard data / log endpoints
# ─────────────────────────────────────────────────────────────────────────────

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