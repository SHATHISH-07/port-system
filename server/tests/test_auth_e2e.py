test_cases = [
    {
        "name": "Auth - Login with Valid Admin Credentials",
        "endpoint": "/auth/login",
        "method": "POST",
        "auth": False,
        "payload": {"username": "admin", "password": "admin"},
        "expected_status": 200,
        "validate_output": lambda res: "access_token" in res and res["token_type"] == "bearer"
    },
    {
        "name": "Auth - Login with Invalid Credentials",
        "endpoint": "/auth/login",
        "method": "POST",
        "auth": False,
        "payload": {"username": "admin", "password": "wrongpassword"},
        "expected_status": 401,
        "validate_output": lambda res: "detail" in res and "Incorrect username or password" in res["detail"]
    },
    {
        "name": "Auth - Verify Admin Role Access",
        "endpoint": "/users",
        "method": "GET",
        "role": "admin",
        "expected_status": 200,
        "validate_output": lambda res: isinstance(res, list) or (isinstance(res, dict) and "users" in res)
    },
    {
        "name": "Auth - Verify Standard User Denied Access to Admin Route",
        "endpoint": "/users",
        "method": "GET",
        "role": "user",
        "expected_status": 403,
        "validate_output": lambda res: "detail" in res and "Not enough permissions" in res["detail"]
    },
    {
        "name": "Auth - Verify Current User Identity",
        "endpoint": "/auth/me",
        "method": "GET",
        "role": "admin",
        "expected_status": 200,
        "validate_output": lambda res: "uid" in res and res["uid"] == "test_user"
    },
    {
        "name": "Auth - Unauthenticated Request Denied",
        "endpoint": "/auth/me",
        "method": "GET",
        "auth": False,
        "expected_status": 401,
        "validate_output": lambda res: "detail" in res and "Not authenticated" in res["detail"]
    }
]
