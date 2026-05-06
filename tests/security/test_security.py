import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_tampered_jwt_rejection(async_client: AsyncClient, admin_headers: dict):
    """Verify that a modified JWT token is rejected by the server."""
    tampered_token = admin_headers["Authorization"][:-5] + "12345"
    response = await async_client.get(
        "/users/", 
        headers={"Authorization": tampered_token}
    )
    assert response.status_code == 401
    assert "Could not validate credentials" in response.json()["detail"]

@pytest.mark.asyncio
async def test_sql_injection_rejection_in_vessel_id(async_client: AsyncClient, admin_headers: dict):
    """Verify that SQL injection attempts in vessel ID fields are safely handled."""
    sqli_payload = "1' OR '1'='1"
    response = await async_client.post(
        "/vessel/vessel-history-analysis",
        data={"vessel_id": sqli_payload},
        headers=admin_headers
    )
    
    # Should not crash, safely handles injection as literal string, returning no data error
    assert response.status_code == 200
    assert "error" in response.json()
    if response.status_code == 400:
        assert "No historical dataset found" in response.json()["detail"] or "not found" in response.json()["detail"]

@pytest.mark.asyncio
async def test_invalid_json_payload(async_client: AsyncClient, admin_headers: dict):
    """Verify that a malformed JSON payload during ingestion returns 422 Unprocessable Entity."""
    response = await async_client.post(
        "/ingest/vessel-data",
        data={"json_data": "{ invalid_json: true"},
        headers=admin_headers
    )
    assert response.status_code in [400, 422]
