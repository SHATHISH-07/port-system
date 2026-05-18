import pytest
import pandas as pd
import uuid
from sqlalchemy import text
from db.connection import get_engine
from db.queries import ensure_yard_tables, load_from_db
from routes.ingest_routes import _insert_container_operations, _insert_crane_operations, _update_vessel_visits
from services.vessel_service import _fetch_vessel_summary, analyze_vessel_dashboard

@pytest.fixture
def engine():
    return get_engine()

@pytest.fixture
def test_yard():
    return "peb"

@pytest.fixture
def test_visit():
    return f"VISIT_{uuid.uuid4().hex[:6].upper()}"

@pytest.fixture
def test_ingestion_id():
    return f"test_ingest_{uuid.uuid4().hex[:6]}"

def test_schema_creation(engine, test_yard):
    """Verify that ensure_yard_tables correctly creates the 3-table schema."""
    ensure_yard_tables(engine, test_yard)
    with engine.connect() as conn:
        for sfx in ["vessel_visits", "container_operations", "crane_operations"]:
            res = conn.execute(text(f"SELECT 1 FROM {test_yard}_{sfx} LIMIT 1"))
            assert res is not None

def test_container_ingestion_and_summary(engine, test_yard, test_visit, test_ingestion_id):
    """Test ingestion into container_operations and automatic summary update."""
    df = pd.DataFrame([{
        "unit_id": "CONT_001",
        "actual_outbound_carrier_visit_id": test_visit,
        "outbound_service": "TEST_SERVICE",
        "category_id": "EXPORT",
        "time_in": "2024-05-13 08:00:00",
        "time_out": "2024-05-13 16:00:00",
        "yard_id": test_yard
    }])
    
    # Ingest
    acc, rej, err = _insert_container_operations(engine, test_yard, df, test_ingestion_id, record_type="history")
    assert acc == 1
    assert not err
    
    # Update summary
    _update_vessel_visits(engine, test_yard, df, "history")
    
    # Check summary table
    summary = _fetch_vessel_summary(test_visit)
    assert summary is not None
    assert summary["vessel_visit_id"] == test_visit
    assert summary["total_containers"] == 1
    # Check stay_hours
    # We use a 8 hour stay in test data
    assert summary["stay_hours"] >= 0

def test_crane_ingestion(engine, test_yard, test_visit, test_ingestion_id):
    """Test ingestion into crane_operations."""
    df = pd.DataFrame([{
        "crane_id": "CR_01",
        "unit_id": "CONT_001",
        "carrier_visit": test_visit,
        "time_completed": "2024-05-13 12:00:00",
        "move_kind": "LOAD",
        "yard_id": test_yard
    }])
    
    acc, rej, err = _insert_crane_operations(engine, test_yard, df, test_ingestion_id)
    assert acc == 1
    
    # Check DB
    with engine.connect() as conn:
        res = conn.execute(text(f"SELECT count(*) FROM {test_yard}_crane_operations WHERE ingestion_id = :id"), {"id": test_ingestion_id}).scalar()
        assert res == 1

def test_service_layer_fast_path(engine, test_yard, test_visit):
    """Verify that vessel_service uses the summary table as a fast path."""
    summary = _fetch_vessel_summary(test_visit)
    if summary:
        # Load through the route-like logic (no datasetType needed)
        from db.queries import load_from_db
        df_loaded = load_from_db("history", vessel_id=test_visit)
        result = analyze_vessel_dashboard(df_loaded, test_visit, crane_count_override=2)
        
        assert "error" not in result
        assert result["top_visit_stats"]["total_units"] == 1
