import pytest
from httpx import AsyncClient
from backend.tests.smoke.smoke_client import smoke_client

@pytest.mark.smoke
@pytest.mark.asyncio
async def test_get_all_games(smoke_client: AsyncClient):
    """
    Smoke test for /games endpoint (all games).
    Ensures the endpoint is alive and returns a 200 response.
    """
    response = await smoke_client.get("/api/games")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.smoke
@pytest.mark.asyncio
async def test_get_games_by_genre(smoke_client: AsyncClient):
    """
    Smoke test for /games endpoint with genre filter.
    """
    response = await smoke_client.get("/api/games?genre=action")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.smoke
@pytest.mark.asyncio
async def test_get_newly_added_games_default(smoke_client: AsyncClient):
    """
    Smoke test for /games/newly-added endpoint with default limit.
    """
    response = await smoke_client.get("/api/games/newly-added")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.smoke
@pytest.mark.asyncio
async def test_get_newly_added_games_custom_limit(smoke_client: AsyncClient):
    """
    Smoke test for /games/newly-added endpoint with a custom limit.
    """
    response = await smoke_client.get("/api/games/newly-added?limit=5")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.smoke
@pytest.mark.asyncio
async def test_get_home_shelves(smoke_client: AsyncClient):
    """
    Smoke test for /games/home-rows endpoint.
    """
    response = await smoke_client.get("/api/games/home-rows")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
