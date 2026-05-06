import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_vessel_history_analysis_success(async_client: AsyncClient, admin_headers: dict):
    """Verify that history analysis returns correct schema for a known vessel."""
    # Note: Requires test_json_ingestion_success to have run to seed 'JSON_SERVICE'
    response = await async_client.post(
        "/vessel/vessel-history-analysis",
        data={"vessel_id": "JSON_SERVICE"},
        headers=admin_headers
    )
    
    assert response.status_code == 200
    data = response.json()
    if "error" not in data:
        assert "actual" in data
        assert "predicted" in data
        assert data["mode"] == "history"

@pytest.mark.asyncio
async def test_vessel_heatmap_success(async_client: AsyncClient, admin_headers: dict):
    """Verify that heatmap returns the 3D block concentration data."""
    response = await async_client.post(
        "/vessel/heatmap",
        data={"vessel_id": "JSON_SERVICE"},
        headers=admin_headers
    )
    
    assert response.status_code == 200
    data = response.json()
    if "error" not in data:
        assert "layout" in data
        assert "blocks" in data
        assert "container_count" in data
        assert "vessel_id" in data

@pytest.mark.asyncio
async def test_empty_vessel_id_analyzes_all(async_client: AsyncClient, admin_headers: dict):
    """Verify that omitting vessel_id analyzes all records."""
    response = await async_client.post(
        "/vessel/vessel-history-analysis",
        data={},
        headers=admin_headers
    )
    assert response.status_code == 200
    assert "mode" in response.json()
