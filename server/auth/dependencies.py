from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from db.connection import get_engine
from sqlalchemy import text
from auth.utils import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
        
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
        
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, username, role, is_active FROM users WHERE username = :username"),
            {"username": username}
        ).fetchone()
        
    if result is None:
        raise credentials_exception
        
    user = dict(result._mapping)
    if not user.get("is_active"):
        raise HTTPException(status_code=400, detail="Inactive user")
        
    return user

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user
