import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging
import bcrypt
from sqlalchemy import text
from config import settings
from db.connection import get_engine

logger = logging.getLogger("port_system")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plaintext password against a bcrypt hash.
    Passwords are truncated to 72 bytes to conform to bcrypt limits.
    """
    pwd_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(pwd_bytes, hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    """
    Hashes a password using bcrypt.
    Passwords are truncated to 72 bytes to conform to bcrypt limits.
    """
    pwd_bytes = password.encode('utf-8')[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Creates a JWT access token encoding the provided data dictionary.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    """
    Decodes a JWT access token, returning the payload if valid, or None otherwise.
    """
    try:
        decoded_token = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return decoded_token
    except jwt.PyJWTError:
        return None

def log_audit(action: str, details: str, user_id: Optional[int] = None):
    """
    Writes an audit log entry to the database asynchronously.
    """
    try:
        engine = get_engine()
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO audit_logs (action, details, user_id) VALUES (:action, :details, :user_id)"),
                {"action": action, "details": details, "user_id": user_id}
            )
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

def authenticate_user(username: str, password: str) -> Optional[dict]:
    """
    Authenticates a user against the database and returns the user dictionary if valid.
    """
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, username, password_hash, role, is_active FROM users WHERE username = :username"),
            {"username": username}
        ).fetchone()

    if not result:
        return None
    
    user = dict(result._mapping)
    if not user["is_active"]:
        return None

    if verify_password(password, user["password_hash"]):
        return user

    return None
