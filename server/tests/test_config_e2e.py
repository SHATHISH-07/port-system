test_cases = [
    {
        "name": "Config - Fetch Retraining Config (Admin)",
        "endpoint": "/config/retraining",
        "method": "GET",
        "role": "admin",
        "expected_status": 200,
        "validate_output": lambda res: "retrain_threshold" in res and "new_records_since_training" in res
    },
    {
        "name": "Config - Fetch Retraining Config (Standard User Denied)",
        "endpoint": "/config/retraining",
        "method": "GET",
        "role": "user",
        "expected_status": 403,
        "validate_output": lambda res: "detail" in res and "Not enough permissions" in res["detail"]
    },
    {
        "name": "Config - Update Retraining Threshold",
        "endpoint": "/config/retraining",
        "method": "PATCH",
        "role": "admin",
        "json_payload": True,
        "payload": {"retrain_threshold": 1500},
        "expected_status": 200,
        "validate_output": lambda res: "config" in res and res["config"].get("retrain_threshold") == 1500
    }
]
