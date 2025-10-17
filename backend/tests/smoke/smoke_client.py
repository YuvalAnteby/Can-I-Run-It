import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from backend.src.app.dependencies import get_games_repo
from backend.src.app.main import app


class FakeGameRepo:
    async def get_games(self, limit=None, sort_by=None, sort_order=1, additional_query=None):
        """Mock get_games method matching the real repository signature."""
        return []

    async def get_games_by_category(self, genre, limit=None):
        """Mock get_games_by_category method (if used elsewhere)."""
        return []

    async def get_newly_added_games(self, limit=10):
        """Mock get_newly_added_games method (if used elsewhere)."""
        return []

    async def get_home_shelves(self):
        """Mock get_home_shelves method (if used elsewhere)."""
        return []

    async def get_config(self, config_name: str):
        """Mock get_config method matching the real repository signature."""
        # Return a mock config for home_page
        if config_name == "home_page":
            return {
                "name": "home_page",
                "shelves": [
                    {"name": "Featured", "enabled": True},
                    {"name": "New Releases", "enabled": True},
                    {"name": "Disabled Shelf", "enabled": False}
                ]
            }
        return None

    async  def create_game(self, game_data: dict) -> str | None:
        """Mock create_game method."""
        return "mocked_game_id"

    async def delete_game(self, game_id: str) -> bool:
        """Mock delete_game method."""
        return True

    async def bulk_insert_games(self, games_data: list[dict]) -> dict:
        """Mock bulk_insert_games method."""
        return {"skipped": [], "inserted": []}


@pytest.fixture
async def smoke_client():
    """
    Creates an async client for smoke tests that uses the main app instance.
    """
    app.dependency_overrides[get_games_repo] = lambda: FakeGameRepo()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

