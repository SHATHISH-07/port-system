test_cases = [
    {
        "name": "System - Health Check",
        "endpoint": "/health",
        "method": "GET",
        "expected_status": 200,
        "validate_output": lambda res: res.get("status") == "ok" or "status" in res
    },
    {
        "name": "System - Logs Lookup (Admin)",
        "endpoint": "/audit-logs",
        "method": "GET",
        "role": "admin",
        "expected_status": 200,
        "validate_output": lambda res: isinstance(res, list) or (isinstance(res, dict) and "logs" in res)
    },
    {
        "name": "System - Logs Lookup (User Denied)",
        "endpoint": "/audit-logs",
        "method": "GET",
        "role": "user",
        "expected_status": 403,
        "validate_output": lambda res: True
    }
]
