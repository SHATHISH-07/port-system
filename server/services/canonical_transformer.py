"""Canonical Transformer — converts a mapped DataFrame into canonical entity inserts."""
import logging
import uuid
import json
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from sqlalchemy import text

from db.connection import get_engine

logger = logging.getLogger("port_system")

_YES_VALUES = {"yes", "y", "true", "1"}


def _bool_flag(val) -> bool:
    if isinstance(val, bool):
        return val
    if pd.isna(val):
        return False
    return str(val).strip().lower() in _YES_VALUES


def _safe_ts(val):
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, pd.Timestamp):
        return val.to_pydatetime()
    try:
        return pd.to_datetime(val, errors="coerce").to_pydatetime()
    except Exception:
        return None


def transform_container_inventory(
    df: pd.DataFrame,
    terminal_id: int,
    source_profile_id: Optional[int],
    ingestion_job_id: Optional[int],
    dynamic_attrs_series: Optional[pd.Series] = None,
) -> dict:
    """
    Transform a mapped container inventory DataFrame into canonical entity rows.
    Returns {"vessel_visits": [...], "containers": [...]}
    """
    vessel_visits = []
    containers = []

    # Group by vessel visit to build canonical_vessel_visits
    visit_col = "actual_outbound_carrier_visit_id"
    if visit_col not in df.columns:
        logger.warning("[Transformer] No vessel visit column found — skipping canonical vessel visits")
    else:
        visit_groups = df.groupby(visit_col)
        for visit_id, group in visit_groups:
            time_in  = _safe_ts(group["time_in"].min()  if "time_in"  in group.columns else None)
            time_out = _safe_ts(group["time_out"].max() if "time_out" in group.columns else None)
            service  = group["outbound_service"].iloc[0] if "outbound_service" in group.columns else None

            vessel_visits.append({
                "id":                         str(uuid.uuid4()),
                "terminal_id":                terminal_id,
                "source_profile_id":          source_profile_id,
                "ingestion_job_id":           ingestion_job_id,
                "canonical_vessel_visit_id":  str(visit_id),
                "outbound_service":           service,
                "time_in":                    time_in,
                "time_out":                   time_out,
                "status":                     "active",
                "dynamic_attributes":         "{}",
            })

    # Build canonical_containers rows
    for idx, row in df.iterrows():
        dyn_attrs = "{}"
        if dynamic_attrs_series is not None and idx in dynamic_attrs_series.index:
            attrs = dynamic_attrs_series[idx]
            if isinstance(attrs, dict):
                dyn_attrs = json.dumps({
                    k: (v if isinstance(v, (str, int, float, bool, type(None))) else str(v))
                    for k, v in attrs.items()
                })

        containers.append({
            "id":                      str(uuid.uuid4()),
            "terminal_id":             terminal_id,
            "ingestion_job_id":        ingestion_job_id,
            "canonical_unit_id":       str(row.get("canonical_unit_id", row.get("unit_id", ""))),
            "unit_weight_kg":          row.get("unit_weight_in_kg") if not pd.isna(row.get("unit_weight_in_kg", float("nan"))) else None,
            "verified_gross_mass_kg":  row.get("verified_gross_mass_kg") if not pd.isna(row.get("verified_gross_mass_kg", float("nan"))) else None,
            "reefer":                  _bool_flag(row.get("reefer")),
            "hazardous":               _bool_flag(row.get("hazardous_flag")),
            "oog":                     _bool_flag(row.get("oog_unit")),
            "port_of_discharge":       str(row.get("port_of_discharge", "") or ""),
            "ctr_from_position":       str(row.get("ctr_from_position", "") or ""),
            "ctr_to_position":         str(row.get("ctr_to_position", "") or ""),
            "move_complete_time":      _safe_ts(row.get("move_complete_time")),
            "time_in":                 _safe_ts(row.get("time_in")),
            "time_out":                _safe_ts(row.get("time_out")),
            "dynamic_attributes":      dyn_attrs,
        })

    return {"vessel_visits": vessel_visits, "containers": containers}


def transform_crane_moves(
    df: pd.DataFrame,
    terminal_id: int,
    source_profile_id: Optional[int],
    ingestion_job_id: Optional[int],
    dynamic_attrs_series: Optional[pd.Series] = None,
) -> dict:
    """Transform a mapped crane moves DataFrame into canonical_crane_moves rows."""
    moves = []
    for idx, row in df.iterrows():
        dyn_attrs = "{}"
        if dynamic_attrs_series is not None and idx in dynamic_attrs_series.index:
            attrs = dynamic_attrs_series[idx]
            if isinstance(attrs, dict):
                dyn_attrs = json.dumps({
                    k: (v if isinstance(v, (str, int, float, bool, type(None))) else str(v))
                    for k, v in attrs.items()
                })

        moves.append({
            "id":                 str(uuid.uuid4()),
            "terminal_id":        terminal_id,
            "ingestion_job_id":   ingestion_job_id,
            "canonical_crane_id": str(row.get("canonical_crane_id", "") or ""),
            "canonical_unit_id":  str(row.get("canonical_unit_id", row.get("unit_nbr", "")) or ""),
            "carrier_visit":      str(row.get("carrier_visit", "") or ""),
            "move_kind":          str(row.get("move_kind", "") or ""),
            "from_position":      str(row.get("from_position", "") or ""),
            "to_position":        str(row.get("to_position", "") or ""),
            "time_completed":     _safe_ts(row.get("time_completed")),
            "line_op":            str(row.get("line_op", "") or ""),
            "excluded":           _bool_flag(row.get("excluded")),
            "dynamic_attributes": dyn_attrs,
        })
    return {"crane_moves": moves}


def persist_canonical_data(data: dict, dataset_type: str) -> dict:
    """
    Insert canonical entity rows into the database.
    vessel_visits are UPSERTED by canonical_vessel_visit_id.
    containers are inserted (skip on conflict with same terminal+unit+time).
    crane_moves are inserted fresh each time.

    Returns counts.
    """
    engine = get_engine()
    vessel_count = 0
    container_count = 0
    crane_count = 0
    now = datetime.now(timezone.utc)

    with engine.begin() as conn:
        if dataset_type == "container_inventory":
            # Upsert vessel visits
            for vv in data.get("vessel_visits", []):
                try:
                    conn.execute(text("""
                        INSERT INTO canonical_vessel_visits
                            (id, terminal_id, source_profile_id, ingestion_job_id,
                             canonical_vessel_visit_id, outbound_service,
                             time_in, time_out, status, dynamic_attributes,
                             created_at, updated_at)
                        VALUES
                            (:id, :tid, :spid, :jid, :cvvid, :service,
                             :ti, :to, :status, :dyn::jsonb, :now, :now)
                        ON CONFLICT (canonical_vessel_visit_id)
                        DO UPDATE SET
                            outbound_service = EXCLUDED.outbound_service,
                            time_in          = COALESCE(EXCLUDED.time_in, canonical_vessel_visits.time_in),
                            time_out         = COALESCE(EXCLUDED.time_out, canonical_vessel_visits.time_out),
                            updated_at       = EXCLUDED.updated_at
                    """), {**vv, "now": now})
                    vessel_count += 1
                except Exception as e:
                    logger.debug(f"[Transformer] vessel_visit skip: {e}")

            # Insert containers (skip duplicates)
            for c in data.get("containers", []):
                try:
                    conn.execute(text("""
                        INSERT INTO canonical_containers
                            (id, terminal_id, ingestion_job_id, canonical_unit_id,
                             unit_weight_kg, verified_gross_mass_kg,
                             reefer, hazardous, oog, port_of_discharge,
                             ctr_from_position, ctr_to_position,
                             move_complete_time, time_in, time_out,
                             dynamic_attributes, created_at, updated_at)
                        VALUES
                            (:id, :terminal_id, :ingestion_job_id, :canonical_unit_id,
                             :unit_weight_kg, :verified_gross_mass_kg,
                             :reefer, :hazardous, :oog, :port_of_discharge,
                             :ctr_from_position, :ctr_to_position,
                             :move_complete_time, :time_in, :time_out,
                             :dynamic_attributes::jsonb, :now, :now)
                        ON CONFLICT (terminal_id, canonical_unit_id, move_complete_time)
                        DO NOTHING
                    """), {**c, "now": now})
                    container_count += 1
                except Exception as e:
                    logger.debug(f"[Transformer] container skip: {e}")

        elif dataset_type == "crane_moves":
            for m in data.get("crane_moves", []):
                try:
                    conn.execute(text("""
                        INSERT INTO canonical_crane_moves
                            (id, terminal_id, ingestion_job_id, canonical_crane_id,
                             canonical_unit_id, carrier_visit, move_kind,
                             from_position, to_position, time_completed,
                             line_op, excluded, dynamic_attributes,
                             created_at, updated_at)
                        VALUES
                            (:id, :terminal_id, :ingestion_job_id, :canonical_crane_id,
                             :canonical_unit_id, :carrier_visit, :move_kind,
                             :from_position, :to_position, :time_completed,
                             :line_op, :excluded, :dynamic_attributes::jsonb,
                             :now, :now)
                    """), {**m, "now": now})
                    crane_count += 1
                except Exception as e:
                    logger.debug(f"[Transformer] crane_move skip: {e}")

    return {
        "vessel_visits_saved": vessel_count,
        "containers_saved":    container_count,
        "crane_moves_saved":   crane_count,
    }
