from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from db.connection import get_engine
from sqlalchemy import text
from auth.utils import decode_access_token

# OAuth2PasswordBearer is a dependency that handles token extraction from the Authorization header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# get_current_user is a dependency that validates the token and returns the user
def get_current_user(token: str = Depends(oauth2_scheme)):
    # raises 401 if the token is invalid or expired
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # decode the token to get the username
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    # get the username from the token
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
        
    engine = get_engine()
    # query the database to get the user
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, username, role, is_active FROM users WHERE username = :username"),
            {"username": username}
        ).fetchone()
        
    if result is None:
        raise credentials_exception
    
    # convert the result to a dictionary
    user = dict(result._mapping)
    # check if the user is active
    if not user.get("is_active"):
        raise HTTPException(status_code=400, detail="Inactive user")
        
    return user

# require_admin is a dependency that checks if the user is an admin
def require_admin(current_user: dict = Depends(get_current_user)):
    # raises 403 if the user is not an admin
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user
