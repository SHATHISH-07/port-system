from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from config import settings
import bcrypt
import hashlib

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Use sha256 to avoid bcrypt's 72 byte limit for long passwords
    # We only do this if we are migrating, but to be compatible with existing passlib hashes:
    # Passlib by default truncates at 72 bytes.
    pwd_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(pwd_bytes, hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        decoded_token = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return decoded_token
    except jwt.PyJWTError:
        return None

def log_audit(action: str, details: str, user_id: Optional[int] = None):
    from db.connection import get_engine
    from sqlalchemy import text
    try:
        engine = get_engine()
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO audit_logs (action, details, user_id) VALUES (:action, :details, :user_id)"),
                {"action": action, "details": details, "user_id": user_id}
            )
    except Exception as e:
        import logging
        logging.getLogger("port_system").error(f"Failed to write audit log: {e}")
