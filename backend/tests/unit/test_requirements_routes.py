import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch

from backend.src.routes.requirements import router as requirements_router

app = FastAPI()
app.include_router(requirements_router)


@pytest.mark.asyncio
async def test_get_requirement_returns_404_when_game_not_found():
    # Valid game doc, but no matching setup in the list
    with patch("backend.src.controllers.requirements.collection.find_one", new_callable=AsyncMock) as mock_find_one:
        mock_find_one.return_value = None

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(
                "/game-requirements/",
                params={
                    "game_id": "nonexistent_id",
                    "cpu_id": "cpu123",
                    "gpu_id": "gpu123",
                    "ram": 16,
                    "resolution": "1920x1080",
                    "setting_name": "High"
                }
            )

    assert response.status_code == 404
    assert response.json()["detail"] == "Combination not found"
