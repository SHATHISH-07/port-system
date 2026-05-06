import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_admin_login(async_client: AsyncClient):
    """Verify that the admin can successfully log in and receive a JWT token."""
    response = await async_client.post(
        "/auth/login",
        data={"username": "admin", "password": "admin123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_invalid_login(async_client: AsyncClient):
    """Verify that invalid credentials return 401 Unauthorized."""
    response = await async_client.post(
        "/auth/login",
        data={"username": "admin", "password": "wrongpassword"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response.status_code == 401
    assert "Incorrect username or password" in response.json()["detail"]

@pytest.mark.asyncio
async def test_admin_route_protection_unauthorized(async_client: AsyncClient):
    """Verify that an unauthenticated user cannot access admin routes."""
    response = await async_client.get("/users/")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_admin_route_protection_user_role(async_client: AsyncClient, user_headers: dict):
    """Verify that a standard user gets 403 Forbidden on admin routes."""
    response = await async_client.get("/users/", headers=user_headers)
    assert response.status_code == 403

@pytest.mark.asyncio
async def test_admin_route_access(async_client: AsyncClient, admin_headers: dict):
    """Verify that an admin can successfully access protected admin routes."""
    response = await async_client.get("/users/", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
