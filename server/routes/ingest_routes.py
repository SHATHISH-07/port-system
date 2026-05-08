"""
routes/ingest_routes.py
-----------------------
File upload and ingestion endpoint.

Current and crane logic are kept intact.
History ingestion is made explicit so it writes correctly to history_containers
even when the source file uses alternate history column names.
"""
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


def _clean_col(s: str) -> str:
    import re
    s = str(s).lower().strip()
    s = s.replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
    return re.sub(r"[^a-z0-9_]", "", s)


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


def _detect_type(df: pd.DataFrame, explicit: Optional[str]) -> Optional[str]:
    if explicit and explicit.lower() in ("history", "current", "crane"):
        return explicit.lower()

    cols = set(df.columns)
    if {"crane_id", "carrier_visit"}.issubset(cols):
        return "crane"
    if not {"unit_id", "actual_outbound_carrier_visit_id", "outbound_service"}.issubset(cols):
        return None
    if "visit_state" in cols or "transit_state" in cols:
        return "current"
    return "history"


def _file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]


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


def _safe_datetime(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


@router.post("/upload")
async def upload_data(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    datasetType: Optional[str] = Query(None),
    admin: dict = Depends(require_admin),
):
    content = await file.read()
    fhash = _file_hash(content)

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

    df = _normalize(df)
    df = df.dropna(how="all")

    dataset_type = _detect_type(df, datasetType)
    if not dataset_type:
        return _fail(f"Could not identify dataset type from headers: {list(df.columns)[:15]}")

    if dataset_type in ("history", "current"):
        for col in ("move_complete_time", "time_in", "time_out"):
            if col in df.columns:
                df[col] = parse_datetime(df[col], col)

        # History files often use alternate header names.
        if dataset_type == "history":
            if "time_completed" in df.columns and "move_complete_time" not in df.columns:
                df["move_complete_time"] = parse_datetime(df["time_completed"], "move_complete_time")
            if "carrier_visit" in df.columns and "actual_outbound_carrier_visit_id" not in df.columns:
                df["actual_outbound_carrier_visit_id"] = df["carrier_visit"]
            if "vessel_visit_id" in df.columns and "actual_outbound_carrier_visit_id" not in df.columns:
                df["actual_outbound_carrier_visit_id"] = df["vessel_visit_id"]

            # Support history files that expose from/to instead of ctr_from/ctr_to.
            if "from_position" in df.columns and "ctr_from_position" not in df.columns:
                df["ctr_from_position"] = df["from_position"]
            if "to_position" in df.columns and "ctr_to_position" not in df.columns:
                df["ctr_to_position"] = df["to_position"]

    if dataset_type == "crane":
        if "time_completed" in df.columns:
            df["time_completed"] = parse_datetime(df["time_completed"], "time_completed")
        if "move_kind" in df.columns:
            df["move_kind"] = (
                df["move_kind"].astype(str).str.strip().str.upper()
                .replace({"NAN": None, "NONE": None, "NULL": None, "": None})
            )

    records = [_clean_row(r) for r in df.to_dict("records")]
    expected_cols: list[str] = settings.EXPECTED_HEADERS.get(dataset_type, [])
    if not expected_cols:
        return _fail(f"No column config for dataset type '{dataset_type}'")

    engine = get_engine()

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

    accepted: list = []
    rejected: list = []

    for row in records:
        try:
            if dataset_type == "history":
                # Explicit history mapping. This is the part that was failing in practice
                # when the route relied on a generic expected_cols flow.
                history_payload = {
                    "unit_id": _first_value(row, "unit_id"),
                    "actual_outbound_carrier_visit_id": _first_value(
                        row,
                        "actual_outbound_carrier_visit_id",
                        "carrier_visit",
                        "vessel_visit_id",
                        "actual_outbound_carrier_visit",
                    ),
                    "outbound_service": _first_value(
                        row,
                        "outbound_service",
                        "vessel",
                        "service",
                    ),
                    "move_complete_time": _safe_datetime(
                        _first_value(row, "move_complete_time", "time_completed", "time_out", "time_in")
                    ),
                    "time_in": _safe_datetime(_first_value(row, "time_in")),
                    "time_out": _safe_datetime(_first_value(row, "time_out")),
                    "ctr_from_position": _first_value(row, "ctr_from_position", "from_position", "current_position"),
                    "ctr_to_position": _first_value(row, "ctr_to_position", "to_position"),
                    "verified_gross_mass_kg": _first_value(row, "verified_gross_mass_kg", "vgm", "gross_mass_kg"),
                    "unit_weight_in_kg": _first_value(row, "unit_weight_in_kg", "weight"),
                    "reefer": _first_value(row, "reefer"),
                    "hazardous_flag": _first_value(row, "hazardous_flag", "hazardous"),
                    "oog_unit": _first_value(row, "oog_unit"),
                    "port_of_discharge": _first_value(row, "port_of_discharge"),
                    "ingestion_id": ingestion_id,
                }

                for key in ("unit_id", "actual_outbound_carrier_visit_id", "outbound_service"):
                    if not history_payload.get(key):
                        raise ValueError(f"Missing {key}")

                with engine.begin() as conn:
                    conn.execute(
                        text("""
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
                        """),
                        history_payload,
                    )

                accepted.append(row)

            elif dataset_type == "current":
                # Leave current logic unchanged.
                for key in ("unit_id", "actual_outbound_carrier_visit_id", "outbound_service"):
                    if not row.get(key):
                        raise ValueError(f"Missing {key}")

                insert_data = {col: row.get(col) for col in expected_cols}
                insert_data["ingestion_id"] = ingestion_id

                cols_str = ", ".join(insert_data.keys())
                vals_str = ", ".join(f":{k}" for k in insert_data.keys())

                with engine.begin() as conn:
                    update_cols = [k for k in insert_data if k not in ("unit_id", "id")]
                    updates = ", ".join(f"{k} = EXCLUDED.{k}" for k in update_cols)
                    conn.execute(
                        text(f"""
                            INSERT INTO current_containers
                                ({cols_str}, is_active, updated_at)
                            VALUES
                                ({vals_str}, TRUE, CURRENT_TIMESTAMP)
                            ON CONFLICT (unit_id) DO UPDATE SET
                                {updates},
                                is_active  = TRUE,
                                updated_at = CURRENT_TIMESTAMP
                        """),
                        insert_data,
                    )

                accepted.append(row)

            else:
                # Leave crane logic unchanged.
                crane_payload = {
                    "crane_id": _first_value(row, "crane_id"),
                    "unit_id": _first_value(row, "unit_id"),
                    "carrier_visit": _first_value(row, "carrier_visit"),
                    "event_type": _first_value(row, "event_type"),
                    "move_kind": _first_value(row, "move_kind"),
                    "from_position": _first_value(row, "from_position"),
                    "to_position": _first_value(row, "to_position"),
                    "time_completed": _first_value(row, "time_completed"),
                    "line_op": _first_value(row, "line_op"),
                    "unit_category": _first_value(row, "unit_category"),
                    "exclude": _first_value(row, "exclude"),
                    "ingestion_id": ingestion_id,
                }

                if not crane_payload["crane_id"]:
                    raise ValueError("Missing crane_id")
                if not crane_payload["unit_id"]:
                    raise ValueError("Missing unit_id")
                if not crane_payload["carrier_visit"]:
                    raise ValueError("Missing carrier_visit")
                if not crane_payload["move_kind"]:
                    raise ValueError("Missing move_kind")
                if not crane_payload["from_position"]:
                    raise ValueError("Missing from_position")
                if not crane_payload["to_position"]:
                    raise ValueError("Missing to_position")
                if not crane_payload["time_completed"]:
                    raise ValueError("Missing time_completed")

                insert_data = {col: crane_payload.get(col) for col in expected_cols}
                insert_data["ingestion_id"] = ingestion_id

                cols_str = ", ".join(insert_data.keys())
                vals_str = ", ".join(f":{k}" for k in insert_data.keys())

                with engine.begin() as conn:
                    conn.execute(
                        text(f"INSERT INTO crane_movements ({cols_str}) VALUES ({vals_str})"),
                        insert_data,
                    )

                accepted.append(row)

        except Exception as exc:
            rejected.append({"row": row, "reason": str(exc)})
            try:
                with engine.begin() as conn:
                    conn.execute(
                        text("""
                            INSERT INTO rejection_logs
                              (ingestion_id, row_data, reason)
                            VALUES (:id, :data, :reason)
                        """),
                        {
                            "id": ingestion_id,
                            "data": json.dumps(row, cls=_Encoder),
                            "reason": str(exc),
                        },
                    )
            except Exception:
                pass

    status = "success" if not rejected else ("partial" if accepted else "failed")

    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE ingestion_logs
                SET status           = :s,
                    records_accepted = :acc,
                    records_rejected = :rej
                WHERE id = :id
            """),
            {"s": status, "acc": len(accepted), "rej": len(rejected), "id": ingestion_id},
        )

    if dataset_type == "history" and accepted:
        check_and_trigger_retraining(background_tasks)

    log_audit(
        "Ingestion",
        f"Ingested {dataset_type} {file.filename}: {len(accepted)} accepted, {len(rejected)} rejected",
        admin["id"],
    )

    return {
        "status": status,
        "dataset_type": dataset_type,
        "accepted_count": len(accepted),
        "rejected_count": len(rejected),
        "ingestion_id": ingestion_id,
        "rejections": rejected[:10],
    }


def _fail(reason: str) -> dict:
    return {
        "status": "failed",
        "dataset_type": "unknown",
        "accepted_count": 0,
        "rejected_count": 0,
        "ingestion_id": None,
        "rejections": [{"row": {}, "reason": reason}],
    }


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