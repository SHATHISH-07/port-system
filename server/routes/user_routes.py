from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from auth.dependencies import require_admin
from auth.utils import get_password_hash, log_audit
from db.connection import get_engine

logger = logging.getLogger("port_system")
router = APIRouter(prefix="/users", tags=["Users"])


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"


# ─────────────────────────────────────────────────────────────────────────────
# GET /users
# ─────────────────────────────────────────────────────────────────────────────
@router.get("")
def get_users(admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, username, role, is_active, created_at FROM users ORDER BY id ASC")).fetchall()
    return [dict(r._mapping) for r in result]


# ─────────────────────────────────────────────────────────────────────────────
# POST /users
# ─────────────────────────────────────────────────────────────────────────────
@router.post("")
def create_user(user: UserCreate, admin: dict = Depends(require_admin)):
    # check if role is valid
    if user.role not in ["user", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    engine = get_engine()
    password_hash = get_password_hash(user.password)
    try:
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO users (username, password_hash, role) VALUES (:username, :hash, :role)"),
                {"username": user.username, "hash": password_hash, "role": user.role}
            )
        log_audit("User Creation", f"Admin created user {user.username}", admin["id"])
    except Exception:
        raise HTTPException(status_code=400, detail="Username already exists")
    return {"message": "User created successfully"}


# ─────────────────────────────────────────────────────────────────────────────
# PUT /users/{user_id}/toggle-active
# ─────────────────────────────────────────────────────────────────────────────
@router.put("/{user_id}/toggle-active")
def toggle_user_active(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    
    engine = get_engine()
    with engine.begin() as conn:
        result = conn.execute(
            text("UPDATE users SET is_active = NOT is_active WHERE id = :id RETURNING is_active"),
            {"id": user_id}
        ).fetchone()
        
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
        
    log_audit("User Status Change", f"Toggled status for user_id={user_id}", admin["id"])
    return {"message": "Status toggled", "is_active": result._mapping["is_active"]}
