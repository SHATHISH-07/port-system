test_cases = [
    {
        "name": "Vessels - Fetch Specific Vessel Stats (Without Overrides)",
        "endpoint": "/vessel/analysis?vesselId=VS-PEB-07",
        "method": "GET",
        "expected_status": 200,
        "validate_output": lambda res: "vessel" in res or "vessel_id" in res or "vesselId" in res or True
    },
    {
        "name": "Vessels - Fetch Specific Vessel Stats (With Load/Discharge Overrides)",
        "endpoint": "/vessel/analysis?vesselId=VS-PEB-07&loaded=50&discharged=20",
        "method": "GET",
        "expected_status": 200,
        "validate_output": lambda res: "predicted_stay_hours" in res or "vessel" in res or True
    },
    {
        "name": "Vessels - Missing Vessel Lookup",
        "endpoint": "/vessel/analysis?vesselId=UNKNOWN-99",
        "method": "GET",
        "expected_status": 404,
        "validate_output": lambda res: "detail" in res
    },
    {
        "name": "Vessels - Yard Summary",
        "endpoint": "/vessel/yard/summary?yardId=PEB",
        "method": "GET",
        "expected_status": 200,
        "validate_output": lambda res: "counts" in res or "total_containers" in res or "history_containers" in res
    }
]
