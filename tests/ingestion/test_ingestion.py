import pytest
from httpx import AsyncClient
import os
from tests.utils.db_utils import create_dummy_csv

@pytest.fixture
def dummy_csv_path(tmp_path):
    filepath = tmp_path / "test_ingestion.csv"
    create_dummy_csv(filepath, num_records=10)
    return filepath

@pytest.mark.asyncio
async def test_csv_ingestion_success(async_client: AsyncClient, admin_headers: dict, dummy_csv_path):
    """Verify that a valid CSV file can be uploaded and processed."""
    with open(dummy_csv_path, "rb") as f:
        files = {"file": ("test_ingestion.csv", f, "text/csv")}
        response = await async_client.post("/ingest/vessel-data", files=files, headers=admin_headers)
        
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["records_processed"] == 10
    assert data["history_rows_saved"] == 10

@pytest.mark.asyncio
async def test_json_ingestion_success(async_client: AsyncClient, admin_headers: dict):
    """Verify that valid raw JSON can be ingested properly."""
    json_payload = '''[
        {
            "outbound_service": "JSON_SERVICE",
            "actual_outbound_carrier_visit_id": "JSON_VISIT",
            "unit_id": "J_001",
            "move_complete_time": "05/01/2026 10:00",
            "time_in": "04/29/2026 10:00",
            "time_out": "05/01/2026 10:00",
            "unit_weight_in_kg": 25000,
            "reefer": false,
            "hazardous_flag": false,
            "oog_unit": false
        }
    ]'''
    
    response = await async_client.post(
        "/ingest/vessel-data", 
        data={"json_data": json_payload},
        headers=admin_headers
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["records_processed"] == 1
    assert data["history_rows_saved"] == 1

@pytest.mark.asyncio
async def test_invalid_file_extension(async_client: AsyncClient, admin_headers: dict, tmp_path):
    """Verify that uploading a non-CSV/JSON file is rejected."""
    bad_file = tmp_path / "test.txt"
    bad_file.write_text("random data")
    
    with open(bad_file, "rb") as f:
        files = {"file": ("test.txt", f, "text/plain")}
        response = await async_client.post("/ingest/vessel-data", files=files, headers=admin_headers)
        
    assert response.status_code == 400
    assert "Only .csv or .json files" in response.json()["detail"]
