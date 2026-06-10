import time
test_cases = [
    {
        "name": "Users - List all users (Admin)",
        "endpoint": "/users",
        "method": "GET",
        "role": "admin",
        "expected_status": 200,
        "validate_output": lambda res: isinstance(res, list) and len(res) > 0 and "username" in res[0]
    },
    {
        "name": "Users - Create new standard user",
        "endpoint": "/users",
        "method": "POST",
        "role": "admin",
        "json_payload": True,
        "payload": {"username": f"testuser_{int(time.time())}", "password": "password123", "role": "user"},
        "expected_status": 200,
        "validate_output": lambda res: "message" in res and res["message"] == "User created successfully"
    },
    {
        "name": "Users - Create duplicate user (Expected Error)",
        "endpoint": "/users",
        "method": "POST",
        "role": "admin",
        "json_payload": True,
        "payload": {"username": "admin", "password": "password123", "role": "user"},
        "expected_status": 400,
        "validate_output": lambda res: "detail" in res and "already exists" in res["detail"].lower()
    },
    {
        "name": "Users - Toggle user active status",
        "endpoint": "/users/2/toggle-active",
        "method": "PUT",
        "role": "admin",
        "expected_status": 200,
        "validate_output": lambda res: "is_active" in res and "message" in res
    },
    {
        "name": "Users - Admin cannot toggle themselves",
        "endpoint": "/users/1/toggle-active",
        "method": "PUT",
        "role": "admin",
        "expected_status": 400,
        "validate_output": lambda res: "detail" in res and "Cannot deactivate yourself" in res["detail"]
    },
    {
        "name": "Users - Standard user cannot list users",
        "endpoint": "/users",
        "method": "GET",
        "role": "user",
        "expected_status": 403,
        "validate_output": lambda res: "detail" in res and "Not enough permissions" in res["detail"]
    }
]
