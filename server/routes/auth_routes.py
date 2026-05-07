import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional, List
from datetime import timedelta
from sqlalchemy import text

from db.connection import get_engine
from auth.utils import (
    authenticate_user, 
    create_access_token, 
    get_password_hash, 
    log_audit
)
from auth.dependencies import get_current_user, require_admin
from config import settings

logger = logging.getLogger("port_system")
router = APIRouter(tags=["Authentication & Users"])

# ── Models ──────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"

class PasswordReset(BaseModel):
    new_password: str

class RequestCreate(BaseModel):
    type: str # UPLOAD_REQUEST, RETRAIN_REQUEST, CONFIG_UPDATE_REQUEST
    payload: Optional[str] = None

class RequestStatusUpdate(BaseModel):
    status: str # executed, rejected

# ── Auth ────────────────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    
    log_audit("Login", f"User {user['username']} logged in", user["id"])
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/auth/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user

# ── User Management ─────────────────────────────────────────────────────────

@router.get("/users")
def get_users(admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, username, role, is_active, created_at FROM users ORDER BY id ASC")).fetchall()
    return [dict(r._mapping) for r in result]

@router.post("/users")
def create_user(user: UserCreate, admin: dict = Depends(require_admin)):
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
    except:
        raise HTTPException(status_code=400, detail="Username already exists")
    return {"message": "User created successfully"}

@router.put("/users/{user_id}/toggle-active")
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

# ── Requests ────────────────────────────────────────────────────────────────

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

@router.post("/requests")
def create_request(req: RequestCreate, user: dict = Depends(get_current_user)):
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO operational_requests (type, payload, created_by_user) VALUES (:type, :payload, :username)"),
            {"type": req.type, "payload": req.payload, "username": user["username"]}
        )
    return {"message": "Request submitted successfully"}
