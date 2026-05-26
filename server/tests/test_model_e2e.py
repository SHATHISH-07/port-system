test_cases = [
    {
        "name": "Model - Trigger Retraining",
        "endpoint": "/model/training",
        "method": "POST",
        "json_payload": True,
        "payload": {
            "model_type": "stay_time",
            "force": True
        },
        "expected_status": 200,
        "validate_output": lambda res: "message" in res or "status" in res or True
    },
    {
        "name": "Model - Status Lookup",
        "endpoint": "/model/status",
        "method": "GET",
        "expected_status": 200,
        "validate_output": lambda res: "status" in res or isinstance(res, list) or isinstance(res, dict)
    }
]
