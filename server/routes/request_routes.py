from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from db.connection import get_engine
from sqlalchemy import text
from auth.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/requests", tags=["Requests"])

class RequestCreate(BaseModel):
    type: str # UPLOAD_REQUEST, RETRAIN_REQUEST, CONFIG_UPDATE_REQUEST
    payload: Optional[str] = None

class RequestStatusUpdate(BaseModel):
    status: str # executed, rejected

@router.get("/")
def get_requests(user: dict = Depends(get_current_user)):
    engine = get_engine()
    with engine.connect() as conn:
        if user["role"] == "admin":
            # Admins see all requests
            result = conn.execute(
                text("""
                SELECT r.id, r.type, r.status, r.payload, r.created_at, u.username as created_by_user
                FROM requests r
                LEFT JOIN users u ON r.created_by = u.id
                ORDER BY r.created_at DESC
                """)
            ).fetchall()
        else:
            # Users see their own requests
            result = conn.execute(
                text("""
                SELECT r.id, r.type, r.status, r.payload, r.created_at
                FROM requests r
                WHERE r.created_by = :user_id
                ORDER BY r.created_at DESC
                """),
                {"user_id": user["id"]}
            ).fetchall()
    return [dict(r._mapping) for r in result]

@router.post("/")
def create_request(req: RequestCreate, user: dict = Depends(get_current_user)):
    if req.type not in ["UPLOAD_REQUEST", "RETRAIN_REQUEST", "CONFIG_UPDATE_REQUEST"]:
        raise HTTPException(status_code=400, detail="Invalid request type")
        
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO requests (type, payload, created_by) VALUES (:type, :payload, :created_by)"),
            {"type": req.type, "payload": req.payload, "created_by": user["id"]}
        )
    return {"message": "Request submitted successfully"}

@router.put("/{req_id}/status")
def update_request_status(req_id: int, update: RequestStatusUpdate, admin: dict = Depends(require_admin)):
    if update.status not in ["executed", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    engine = get_engine()
    with engine.begin() as conn:
        result = conn.execute(
            text("UPDATE requests SET status = :status, executed_by = :admin_id, updated_at = CURRENT_TIMESTAMP WHERE id = :req_id"),
            {"status": update.status, "admin_id": admin["id"], "req_id": req_id}
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Request not found")
            
    return {"message": f"Request {update.status}"}
