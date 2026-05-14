from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from auth.dependencies import get_current_user, require_admin
from db.connection import get_engine

logger = logging.getLogger("port_system")
router = APIRouter(tags=["System Administration"])


class RequestCreate(BaseModel):
    type: str # UPLOAD_REQUEST, RETRAIN_REQUEST, CONFIG_UPDATE_REQUEST
    payload: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# GET /audit-logs
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/audit-logs")
def get_audit_logs(admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT a.id, a.action, a.details, a.timestamp, u.username 
            FROM audit_logs a 
            LEFT JOIN users u ON a.user_id = u.id 
            ORDER BY a.timestamp DESC LIMIT 100
        """)).fetchall()
    return [dict(r._mapping) for r in result]


# ─────────────────────────────────────────────────────────────────────────────
# GET /requests
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/requests")
def get_requests(user: dict = Depends(get_current_user)):
    engine = get_engine()
    with engine.connect() as conn:
        if user["role"] == "admin":
            result = conn.execute(text("""
                SELECT r.id, r.type, r.status, r.payload, r.created_at, u.username as created_by_user
                FROM operational_requests r
                LEFT JOIN users u ON r.created_by_user = u.username
                ORDER BY r.created_at DESC
            """)).fetchall()
        else:
            result = conn.execute(text("""
                SELECT r.id, r.type, r.status, r.payload, r.created_at
                FROM operational_requests r
                WHERE r.created_by_user = :username
                ORDER BY r.created_at DESC
            """), {"username": user["username"]}).fetchall()
    return [dict(r._mapping) for r in result]


# ─────────────────────────────────────────────────────────────────────────────
# POST /requests
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/requests")
def create_request(req: RequestCreate, user: dict = Depends(get_current_user)):
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO operational_requests (type, payload, created_by_user) VALUES (:type, :payload, :username)"),
            {"type": req.type, "payload": req.payload, "username": user["username"]}
        )
    return {"message": "Request submitted successfully"}
