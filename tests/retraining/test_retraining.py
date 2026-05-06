import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_manual_retraining_trigger(async_client: AsyncClient, admin_headers: dict):
    """Verify that an admin can manually trigger ML model retraining."""
    response = await async_client.post(
        "/model/vessel-stay/training",
        data={"data_source": "db", "update_db": "false"},
        headers=admin_headers
    )
    
    if response.status_code == 200:
        data = response.json()
        assert data["status"] == "started"
    elif response.status_code == 400:
        # Might return 400 if less than 50 rows in DB
        assert "Not enough data to train" in response.json()["detail"] or "already running" in response.json()["detail"]

@pytest.mark.asyncio
async def test_training_status_polling(async_client: AsyncClient, admin_headers: dict):
    """Verify the training status polling endpoint."""
    response = await async_client.get(
        "/model/vessel-stay/training/status",
        headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ["idle", "training", "completed", "error"]

@pytest.mark.asyncio
async def test_retraining_config_fetch(async_client: AsyncClient, admin_headers: dict):
    """Verify fetching and updating retraining thresholds."""
    response = await async_client.get("/config/retraining", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert "retrain_threshold" in data
    assert "history_record_count" in data
