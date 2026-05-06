import pytest
from httpx import AsyncClient
import time
import asyncio

@pytest.mark.asyncio
async def test_concurrent_api_requests(async_client: AsyncClient, admin_headers: dict):
    """Verify that the API can handle multiple concurrent requests without failing."""
    
    async def make_request():
        # A lightweight request to avoid overwhelming test db
        return await async_client.get("/config/retraining", headers=admin_headers)
    
    # Fire 10 requests concurrently
    tasks = [make_request() for _ in range(10)]
    start = time.time()
    responses = await asyncio.gather(*tasks)
    end = time.time()
    
    assert len(responses) == 10
    for r in responses:
        assert r.status_code == 200
        
    duration = end - start
    # Should resolve reasonably fast locally
    assert duration < 5.0
