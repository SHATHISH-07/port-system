test_cases = [
    {
        "name": "Heatmap - Valid Heatmap (Vessel and Units)",
        "endpoint": "/vessel/heatmap",
        "method": "POST",
        "json_payload": True,
        "payload": {"vessel_id": "VS-PEB-07", "unit_ids": ["BMOU1234567"]},
        "expected_status": 200,
        "validate_output": lambda res: "blocks" in res and isinstance(res["blocks"], list)
    },
    {
        "name": "Heatmap - Valid Heatmap (With Yard Filter)",
        "endpoint": "/vessel/heatmap",
        "method": "POST",
        "json_payload": True,
        "payload": {"vessel_id": "VS-PEB-07", "unit_ids": ["BMOU1234567"], "yard_id": "PEB"},
        "expected_status": 200,
        "validate_output": lambda res: "yard_id" in res and res["yard_id"] == "PEB"
    },
    {
        "name": "Heatmap - Unknown Yard ID",
        "endpoint": "/vessel/heatmap",
        "method": "POST",
        "json_payload": True,
        "payload": {"vessel_id": "VS-PEB-07", "unit_ids": ["BMOU1234567"], "yard_id": "UNKNOWN_999"},
        "expected_status": 200,
        "validate_output": lambda res: "blocks" in res and len(res["blocks"]) == 0
    },
    {
        "name": "Heatmap - Missing Required Vessel ID",
        "endpoint": "/vessel/heatmap",
        "method": "POST",
        "json_payload": True,
        "payload": {"unit_ids": ["BMOU1234567"], "yard_id": "PEB"},
        "expected_status": 422,
        "validate_output": lambda res: "detail" in res
    },
    {
        "name": "Heatmap - Missing Required Unit IDs",
        "endpoint": "/vessel/heatmap",
        "method": "POST",
        "json_payload": True,
        "payload": {"vessel_id": "VS-PEB-07", "yard_id": "PEB"},
        "expected_status": 422,
        "validate_output": lambda res: "detail" in res
    }
]
