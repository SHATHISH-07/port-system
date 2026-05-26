from tests.helpers import get_test_container_ids

containers = get_test_container_ids(50)

test_cases = [
    {
        "name": "Stowage Planning - Current Planning (Valid)",
        "endpoint": "/stowage/current/planning",
        "method": "POST",
        "payload": {
            "vesselId": "VS-PEB-07",
            "yardId": "PEB",
            "containerIds": containers
        },
        "expected_status": 200,
        "validate_output": lambda res: "summary" in res and res["summary"]["totalRequested"] > 0
    },
    {
        "name": "Stowage Planning - Current Planning (Empty Containers)",
        "endpoint": "/stowage/current/planning",
        "method": "POST",
        "payload": {
            "vesselId": "VS-PEB-07",
            "yardId": "PEB",
            "containerIds": ""
        },
        "expected_status": 400,
        "validate_output": lambda res: "detail" in res and "valid container IDs" in res["detail"]
    },
    {
        "name": "Stowage Planning - Invalid Vessel ID",
        "endpoint": "/stowage/current/planning",
        "method": "POST",
        "payload": {
            "vesselId": "",
            "yardId": "PEB",
            "containerIds": containers
        },
        "expected_status": 400,
        "validate_output": lambda res: "detail" in res and "vesselId is required" in res["detail"]
    },
    {
        "name": "Stowage Visualization - Current View",
        "endpoint": "/stowage/visualization",
        "method": "POST",
        "payload": {
            "vesselId": "VS-PEB-07",
            "yardId": "PEB",
            "containerIds": containers
        },
        "expected_status": 200,
        "validate_output": lambda res: "map" in res and "groups" in res["map"]
    },
    {
        "name": "Stowage Visualization - Historical Visit",
        "endpoint": "/stowage/visualization",
        "method": "POST",
        "payload": {
            "vesselId": "VS-PEB-07",
            "yardId": "PEB",
            "visitId": "MAE180081"
        },
        "expected_status": 200,
        "validate_output": lambda res: "map" in res and "groups" in res["map"]
    }
]
