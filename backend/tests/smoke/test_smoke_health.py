import pytest
from httpx import AsyncClient

from .smoke_client import smoke_client


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_health_check(smoke_client: AsyncClient):
    """Test the basic health check endpoint."""
    r = await smoke_client.get("/api/health/ping")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_mongo_health_check(smoke_client: AsyncClient):
    """Test the MongoDB health check endpoint."""
    r = await smoke_client.get("/api/health/mongo")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
