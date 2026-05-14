import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from config import settings
import bcrypt
from db.connection import get_engine
from sqlalchemy import text

# bcrypt has a 72 byte limit for passwords, so we truncate the password to 72 bytes
def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(pwd_bytes, hashed_password.encode('utf-8'))

# get_password_hash is a utility function that hashes a password
def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode('utf-8')

# create_access_token is a utility function that creates a JWT access token
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    # set the expiration time to the JWT_ACCESS_TOKEN_EXPIRE_MINUTES from the config
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    # add the expiration time to the token
    to_encode.update({"exp": expire})
    # encode the token
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

# decode_access_token is a utility function that decodes a JWT access token
def decode_access_token(token: str) -> Optional[dict]:
    try:
        # decode the token
        decoded_token = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        # return the decoded token
        return decoded_token
    except jwt.PyJWTError:
        # if the token is invalid or expired, return None
        return None

# log_audit is a utility function that logs an audit event
def log_audit(action: str, details: str, user_id: Optional[int] = None):
    from db.connection import get_engine
    from sqlalchemy import text
    try:
        # get the engine
        engine = get_engine()
        with engine.begin() as conn:
            # execute the insert query
            conn.execute(
                text("INSERT INTO audit_logs (action, details, user_id) VALUES (:action, :details, :user_id)"),
                {"action": action, "details": details, "user_id": user_id}
            )
    # if the insert fails, log the error
    except Exception as e:
        import logging
        logging.getLogger("port_system").error(f"Failed to write audit log: {e}")

# authenticate_user is a utility function that authenticates a user
def authenticate_user(username: str, password: str) -> Optional[dict]:
    engine = get_engine()
    # execute the select query
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, username, password_hash, role, is_active FROM users WHERE username = :username"),
            {"username": username}
        ).fetchone()
    # if the select fails, return None
    if not result:
        return None
    
    user = dict(result._mapping)
    # if the user is not active, return None
    if not user["is_active"]:
        return None
    # verify the password
    if verify_password(password, user["password_hash"]):
        return user
    # if the password is incorrect, return None
    return None
