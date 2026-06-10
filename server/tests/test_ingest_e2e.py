import io

# We simulate file uploads via TestClient by passing a dictionary to the `files` argument.
test_csv_content = b"Unit ID,Yard Id,Equipment Class,Actual Outbound Carrier Visit\nTESTU1234567,PEB,Standard,MAE180084\n"
malformed_csv = b"Just random text without headers\n"

test_cases = [
    {
        "name": "Ingestion - Valid CSV Upload",
        "endpoint": "/ingest/upload?datasetType=current",
        "method": "POST",
        "multipart": True,
        "payload": {
            "file": ("test.csv", io.BytesIO(test_csv_content), "text/csv")
        },
        "expected_status": 200,
        "validate_output": lambda res: res.get("status", "").lower() == "processing" and "ingestion_id" in res
    },
    {
        "name": "Ingestion - Missing Dataset Type",
        "endpoint": "/ingest/upload",
        "method": "POST",
        "multipart": True,
        "payload": {
            "file": ("test.csv", io.BytesIO(test_csv_content), "text/csv")
        },
        "expected_status": 200, 
        "validate_output": lambda res: res.get("status", "").lower() == "processing" and "ingestion_id" in res
    }
]
