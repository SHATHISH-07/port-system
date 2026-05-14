from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from db.connection import get_engine
from sqlalchemy import text
from auth.utils import get_password_hash
from auth.dependencies import require_admin

router = APIRouter(prefix="/users", tags=["Users"])

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"

class PasswordReset(BaseModel):
    new_password: str

@router.get("/")
def get_users(admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, username, role, is_active, created_at FROM users ORDER BY id ASC")
        ).fetchall()
    return [dict(r._mapping) for r in result]

@router.post("/")
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
    except Exception as e:
        raise HTTPException(status_code=400, detail="Username may already exist.")
    return {"message": "User created successfully"}

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
        
    return {"message": "Status toggled", "is_active": result._mapping["is_active"]}

@router.put("/{user_id}/reset-password")
def reset_password(user_id: int, payload: PasswordReset, admin: dict = Depends(require_admin)):
    engine = get_engine()
    password_hash = get_password_hash(payload.new_password)
    with engine.begin() as conn:
        result = conn.execute(
            text("UPDATE users SET password_hash = :hash WHERE id = :id"),
            {"hash": password_hash, "id": user_id}
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
            
    return {"message": "Password reset successfully"}

@router.get("/audit-logs")
def get_audit_logs(admin: dict = Depends(require_admin)):
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("""
            SELECT a.id, a.action, a.details, a.timestamp, u.username 
            FROM audit_logs a 
            LEFT JOIN users u ON a.user_id = u.id 
            ORDER BY a.timestamp DESC 
            LIMIT 100
            """)
        ).fetchall()
    return [dict(r._mapping) for r in result]
