import os
import json
import time
import sys
from fastapi.testclient import TestClient
from typing import Any, Dict, List

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import app

# Create global TestClient
client = TestClient(app)

# Helper function to mock auth safely
def get_mock_auth_header(role="admin"):
    from auth.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: {"uid": "test_user", "id": 1, "username": "admin", "role": role}
    return {"Authorization": "Bearer TEST_TOKEN"}

def clear_mock_auth():
    app.dependency_overrides = {}

# Helper to get PEB container IDs
def get_test_container_ids(limit=100) -> str:
    data_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "PEB_active_yard_containers.json")
    if not os.path.exists(data_path):
        return "TESTU1234567, TESTU7654321"
    
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    ids = []
    for record in data:
        if "Unit ID" in record:
            ids.append(str(record["Unit ID"]))
        if len(ids) >= limit:
            break
            
    return ", ".join(ids)

def run_test_case(tc: dict) -> dict:
    """
    Executes a single test case dictionary and returns the result dictionary.
    """
    start_time = time.perf_counter()
    headers = get_mock_auth_header(tc.get("role", "admin")) if tc.get("auth", True) else {}
    if "custom_headers" in tc:
        headers.update(tc["custom_headers"])
        
    try:
        if tc["method"] == "POST":
            # Some APIs expect form data, others JSON.
            # E.g., Stowage Planning expects Form data, auth expects JSON.
            if tc.get("json_payload"):
                response = client.post(tc["endpoint"], json=tc["payload"], headers=headers)
            elif tc.get("multipart"):
                response = client.post(tc["endpoint"], files=tc["payload"], headers=headers)
            else:
                response = client.post(tc["endpoint"], data=tc["payload"], headers=headers)
        elif tc["method"] == "GET":
            response = client.get(tc["endpoint"], headers=headers)
        elif tc["method"] == "DELETE":
            response = client.delete(tc["endpoint"], headers=headers)
        elif tc["method"] == "PUT":
            response = client.put(tc["endpoint"], json=tc["payload"], headers=headers)
            
        response_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
        actual_status = response.status_code
        
        try:
            actual_json = response.json()
        except:
            actual_json = response.text
            
        passed = False
        error_msg = None
        
        if actual_status != tc["expected_status"]:
            error_msg = f"Expected status {tc['expected_status']}, got {actual_status}"
        elif "validate_output" in tc:
            try:
                if not tc["validate_output"](actual_json):
                    error_msg = "Output validation failed."
                else:
                    passed = True
            except Exception as eval_err:
                error_msg = f"Validation threw exception: {eval_err}"
        else:
            passed = True

        safe_input = tc.get("payload", {})
        if tc.get("multipart"):
            safe_input = "Multipart payload omitted"

        return {
            "test_case": tc["name"],
            "endpoint": tc["endpoint"],
            "method": tc["method"],
            "input": safe_input,
            "expected_status": tc["expected_status"],
            "actual_status": actual_status,
            "response_time_ms": response_time_ms,
            "passed": passed,
            "error": error_msg,
            "actual_output_snippet": actual_json if not passed else "Output Validated Successfully (Omitted)"
        }
        
    except Exception as e:
        safe_input = tc.get("payload", {})
        if tc.get("multipart"):
            safe_input = "Multipart payload omitted"

        return {
            "test_case": tc["name"],
            "endpoint": tc["endpoint"],
            "method": tc["method"],
            "input": safe_input,
            "expected_status": tc["expected_status"],
            "actual_status": "EXCEPTION",
            "response_time_ms": round((time.perf_counter() - start_time) * 1000, 2),
            "passed": False,
            "actual_output_snippet": str(e)
        }
    finally:
        clear_mock_auth()
