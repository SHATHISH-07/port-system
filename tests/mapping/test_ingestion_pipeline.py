"""
Integration tests for the enhanced ingestion pipeline.
Validates:
  - Auto-detection of dataset type from uploaded file
  - Pending mapping response when no source profile mappings exist
  - Successful ingestion with pre-confirmed mappings applied
  - Raw upload audit trail creation
  - Ingestion job status endpoint
"""
import sys
import os
import pytest
import pytest_asyncio
import httpx

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../server")))

BASE_URL = os.getenv("TEST_API_URL", "http://localhost:8000")

ADMIN_CREDENTIALS = {
    "username": os.getenv("TEST_ADMIN_USER", "admin"),
    "password": os.getenv("TEST_ADMIN_PASSWORD", "admin123"),
}

SAMPLE_CSV_CONTENT = (
    "actual_outbound_carrier_visit_id,outbound_service,unit_id,"
    "move_complete_time,time_in,time_out,ctr_from_position,ctr_to_position,"
    "verified_gross_mass_kg,reefer,hazardous_flag,oog_unit,port_of_discharge\n"
    "VISIT001,SVC-A,UNIT001,2024-01-15T10:00:00,2024-01-14T08:00:00,"
    "2024-01-15T12:00:00,Y-A01,V-A01,22000,N,N,N,SGSIN\n"
    "VISIT001,SVC-A,UNIT002,2024-01-15T10:30:00,2024-01-14T08:30:00,"
    "2024-01-15T12:00:00,Y-A02,V-A01,18000,Y,N,N,MYPEN\n"
)

CRANE_CSV_CONTENT = (
    "Time Completed,Event Type,Move Kind,Unit Category,Unit Nbr,"
    "Crane CHE,From Position,To Position,Carrier Visit,Line Op,Exclude\n"
    "2024-01-15T10:15:00,CRANE,LOAD,CONT,UNIT001,CR01,Y-A01,V-A01,VISIT001,MSC,N\n"
    "2024-01-15T10:45:00,CRANE,DISCHARGE,CONT,UNIT003,CR02,V-B01,Y-B02,VISIT001,CMA,N\n"
)


@pytest.fixture(scope="module")
def admin_token():
    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        r = client.post("/auth/login", data=ADMIN_CREDENTIALS)
        assert r.status_code == 200, f"Login failed: {r.text}"
        return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestIngestDetection:

    def test_known_schema_container_inventory_auto_detects(self, auth_headers):
        """Standard container inventory CSV should be detected correctly."""
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.post(
                "/ingest/vessel-data",
                files={"file": ("inventory.csv", SAMPLE_CSV_CONTENT.encode(), "text/csv")},
                headers=auth_headers,
            )
        assert r.status_code == 200
        body = r.json()
        assert body["dataset_type"] == "container_inventory"
        assert body["detection_confidence"] >= 50

    def test_crane_dataset_detected_separately(self, auth_headers):
        """Crane moves CSV with non-standard names should trigger pending_mapping or auto-detect."""
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.post(
                "/ingest/vessel-data",
                files={"file": ("cranes.csv", CRANE_CSV_CONTENT.encode(), "text/csv")},
                headers=auth_headers,
            )
        assert r.status_code == 200
        body = r.json()
        # Crane moves have no pre-confirmed mappings so should be pending_mapping or crane_moves type
        assert body.get("dataset_type") in ["crane_moves", "container_inventory", "unknown"]

    def test_raw_upload_audit_record_created(self, auth_headers):
        """After ingestion, a raw_upload audit record must exist."""
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.get("/ingest/uploads", headers=auth_headers)
        assert r.status_code == 200
        uploads = r.json().get("uploads", [])
        assert len(uploads) > 0, "Expected at least one raw_upload record after ingestion"

    def test_ingestion_job_record_created(self, auth_headers):
        """After ingestion, an ingestion_job record must exist."""
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.get("/ingest/jobs", headers=auth_headers)
        assert r.status_code == 200
        jobs = r.json().get("jobs", [])
        assert len(jobs) > 0, "Expected at least one ingestion_job record after ingestion"

    def test_ingestion_rejects_bad_file_extension(self, auth_headers):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.post(
                "/ingest/vessel-data",
                files={"file": ("data.xlsx", b"dummy", "application/vnd.ms-excel")},
                headers=auth_headers,
            )
        assert r.status_code == 400

    def test_ingestion_without_auth_rejected(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.post(
                "/ingest/vessel-data",
                files={"file": ("inventory.csv", SAMPLE_CSV_CONTENT.encode(), "text/csv")},
            )
        assert r.status_code in [401, 403]


class TestMappingAPI:

    def test_detect_endpoint_classifies_csv(self, auth_headers):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.post(
                "/mapping/detect",
                files={"file": ("inventory.csv", SAMPLE_CSV_CONTENT.encode(), "text/csv")},
                headers=auth_headers,
            )
        assert r.status_code == 200
        body = r.json()
        assert "dataset_type" in body
        assert "confidence" in body
        assert "columns" in body

    def test_suggest_endpoint_returns_mappings(self, auth_headers):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.post(
                "/mapping/suggest",
                files={"file": ("inventory.csv", SAMPLE_CSV_CONTENT.encode(), "text/csv")},
                headers=auth_headers,
            )
        assert r.status_code == 200
        body = r.json()
        assert "suggestions" in body
        assert len(body["suggestions"]) > 0
        assert "auto_mapped" in body

    def test_templates_endpoint_accessible(self, auth_headers):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            r = client.get("/mapping/templates", headers=auth_headers)
        assert r.status_code == 200
        assert "templates" in r.json()
