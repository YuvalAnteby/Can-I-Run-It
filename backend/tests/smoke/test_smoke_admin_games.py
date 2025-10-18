import pytest
from httpx import AsyncClient

from .smoke_client import smoke_client


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_create_game_endpoint_smoke(smoke_client: AsyncClient):
    """
    Smoke test for the game creation endpoint.
    This test verifies that the endpoint is alive and returns a response.
    """
    response = await smoke_client.post("/api/admin/games")
    assert response.status_code != 404


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_delete_game_endpoint_smoke(smoke_client: AsyncClient):
    """
    Smoke test for the game deletion endpoint.
    This test verifies that the endpoint is alive and returns a response.
    """
    response = await smoke_client.delete("/api/admin/games/test")
    assert response.status_code != 404


@pytest.mark.smoke
@pytest.mark.asyncio
async def test_bulk_create_games_endpoint_smoke(smoke_client: AsyncClient):
    """
    Smoke test for the bulk game creation endpoint.
    This test verifies that the endpoint is alive and returns a response.
    """
    response = await smoke_client.post("/api/admin/games/bulk")
    assert response.status_code != 404
