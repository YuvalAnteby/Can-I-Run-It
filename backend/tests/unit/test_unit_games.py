from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_all_games(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_game_repo: AsyncMock,
    fake_games_list: list,
):
    """Test fetching all games."""
    mock_game_repo.get_games.return_value = fake_games_list

    response = await async_client_mock.get("/games")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == len(fake_games_list)
    assert "id" in data[0]
    assert isinstance(data[0]["id"], str)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_games_with_genre(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_game_repo: AsyncMock,
    fake_action_games_list: list,
):
    """Test fetching games filtered by genre."""
    genre = "Action"
    expected_games = [g for g in fake_action_games_list if genre in g["genres"]]
    mock_game_repo.get_games.return_value = expected_games

    response = await async_client_mock.get(f"/games?genre={genre}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == len(expected_games)
    assert all(genre in game["genres"] for game in data)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_games_with_limit(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_game_repo: AsyncMock,
    fake_games_list: list,
):
    """Test fetching games with a limit."""
    limit = 2
    mock_game_repo.get_games.return_value = fake_games_list[:limit]

    response = await async_client_mock.get(f"/games?limit={limit}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == limit
