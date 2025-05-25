from datetime import datetime, timezone
import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch
from bson import ObjectId

from backend.src.routes.performances import router as requirements_router
from backend.src.routes.games import router as games_router


@pytest.fixture
def test_app():
    """
    Creates a minimal FastAPI app with only the relevant routers.
    Can be reused in any test.
    """
    app = FastAPI()
    app.include_router(requirements_router)
    app.include_router(games_router)
    return app


@pytest.fixture
async def async_client(test_app: FastAPI):
    """
    Reusable async client for sending requests to test_app.
    Use this in tests like:

        async def test_something(async_client):
            response = await async_client.get("/games")
    """
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def fake_game():
    """
    Returns a dictionary that looks like a real game from the DB.
    Reused in game and requirements related tests.
    """
    return {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "game_id": "g1",
        "name": "Test Game1",
        "publisher": "Test Publisher1",
        "developer": "Test Dev1",
        "release_date": 2024,
        "genres": ["Action"],
        "desc": "Just a test1.",
        "trailer_url": "https://example.com/trailer1",
        "portrait_url": "https://example.com/portrait1",
        "landscape_s": "...",
        "landscape_m": "...",
        "landscape_l": "...",
        "landscape_xl": "...",
        "buy_links": ["https://store1.com"],
        "available_resolutions": ["1920x1080"],
        "supported_settings": ["High", "Ultra"],
        "is_ssd_recommended": True,
        "upscale_support": [],
        "api_support": ["DX11"],
        "created_at": datetime.now(timezone.utc)
    }


@pytest.fixture
def fakes_games_list(fake_action_games_list):
    """
    Returns a list of dictionaries that looks like real games from the DB.
    Reused in game and requirements related tests.
    :return:
    """
    return fake_action_games_list + [
        {
            "_id": ObjectId("507f1f77bcf86cd799439015"),
            "game_id": "g5",
            "name": "Test Game5",
            "publisher": "Test Publisher3",
            "developer": "Test Dev4",
            "release_date": 2000,
            "genres": ["Simulator"],
            "desc": "Just a test2.",
            "trailer_url": "https://example.com/trailer2",
            "portrait_url": "https://example.com/portrait2",
            "landscape_s": "...",
            "landscape_m": "...",
            "landscape_l": "...",
            "landscape_xl": "...",
            "buy_links": ["https://store1.com"],
            "available_resolutions": ["1920x1080"],
            "supported_settings": ["High", "Ultra"],
            "is_ssd_recommended": True,
            "upscale_support": ["Nvidia DLSS 3.7"],
            "api_support": ["DX11", "DX12", "Vulkan"],
            "created_at": datetime.now(timezone.utc)
        }
    ]


@pytest.fixture
def fake_action_games_list(fake_game):
    return [fake_game] + [
        {
            "_id": ObjectId("507f1f77bcf86cd799439012"),
            "game_id": "g2",
            "name": "Test Game2",
            "publisher": "Test Publisher1",
            "developer": "Test Dev1",
            "release_date": 2023,
            "genres": ["Action", "RPG"],
            "desc": "Just a test2.",
            "trailer_url": "https://example.com/trailer2",
            "portrait_url": "https://example.com/portrait2",
            "landscape_s": "...",
            "landscape_m": "...",
            "landscape_l": "...",
            "landscape_xl": "...",
            "buy_links": ["https://store1.com"],
            "available_resolutions": ["1920x1080"],
            "supported_settings": ["High", "Ultra"],
            "is_ssd_recommended": True,
            "upscale_support": ["Nvidia DLSS 3.7", "AMD FST 3.1"],
            "api_support": ["DX11", "DX12"],
            "created_at": datetime.now(timezone.utc)
        },
        {
            "_id": ObjectId("507f1f77bcf86cd799439013"),
            "game_id": "g3",
            "name": "Test Game3",
            "publisher": "Test Publisher2",
            "developer": "Test Dev2",
            "release_date": 2023,
            "genres": ["Action", "RPG"],
            "desc": "Just a test2.",
            "trailer_url": "https://example.com/trailer2",
            "portrait_url": "https://example.com/portrait2",
            "landscape_s": "...",
            "landscape_m": "...",
            "landscape_l": "...",
            "landscape_xl": "...",
            "buy_links": ["https://store1.com"],
            "available_resolutions": ["1920x1080"],
            "supported_settings": ["High", "Ultra"],
            "is_ssd_recommended": False,
            "upscale_support": ["Nvidia DLSS 3.7", "AMD FST 3.1", "Intel Xess 1.3"],
            "api_support": ["DX12"],
        },
        {
            "_id": ObjectId("507f1f77bcf86cd799439014"),
            "game_id": "g4",
            "name": "Test Game4",
            "publisher": "Test Publisher3",
            "developer": "Test Dev2",
            "release_date": 2021,
            "genres": ["Action", "RPG"],
            "desc": "Just a test2.",
            "trailer_url": "https://example.com/trailer2",
            "portrait_url": "https://example.com/portrait2",
            "landscape_s": "...",
            "landscape_m": "...",
            "landscape_l": "...",
            "landscape_xl": "...",
            "buy_links": ["https://store1.com"],
            "available_resolutions": ["1920x1080"],
            "supported_settings": ["High", "Ultra"],
            "is_ssd_recommended": False,
            "upscale_support": ["Intel Xess 1.3"],
            "api_support": ["DX12", "Vulkan"],
        }
    ]


@pytest.fixture
def fake_cpus_list():
    """
    Returns a list of dictionaries that looks like CPUs from the DB.
    Reused in CPU and GPU related tests.
    """
    return [
        {
            "_id": ObjectId("6758bbf1849fa5acb6884201"),
            "brand": "brand1",
            "model": "RYZEN 1234",
            "fullname": "Ryzen 0 1234",
            "type": "cpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884202"),
            "brand": "brand1",
            "model": "RYZEN 5678",
            "fullname": "Ryzen 8 5678",
            "type": "cpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884203"),
            "brand": "brand2",
            "model": "I11 1234k",
            "fullname": "Core I11 1234k",
            "type": "cpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884204"),
            "brand": "brand2",
            "model": "I11 5678k",
            "fullname": "Core I11 5678k",
            "type": "cpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884205"),
            "brand": "brand3",
            "model": "RI 22 987",
            "fullname": "brand3 RI 22 987",
            "type": "cpu"
        }
    ]


@pytest.fixture
def fake_gpus_list():
    """
    Returns a list of dictionaries that looks like CPUs from the DB.
    Reused in CPU and GPU related tests.
    """
    return [
        {
            "_id": ObjectId("6758bbf1849fa5acb6884206"),
            "brand": "brand4",
            "model": "RTXC 1234",
            "fullname": "RTXC 1234 (6GB)",
            "type": "gpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884207"),
            "brand": "brand4",
            "model": "RTXC 1234",
            "fullname": "RTXC 1234 (12GB)",
            "type": "gpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884208"),
            "brand": "brand5",
            "model": "RX 5800",
            "fullname": "RTX 5800",
            "type": "gpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884209"),
            "brand": "brand5",
            "model": "RX 5800XT",
            "fullname": "RTX 5800XT",
            "type": "gpu"
        }
    ]


@pytest.fixture
def fake_hardware_list(fake_cpus_list, fake_gpus_list):
    """
    Returns a list of dictionaries that looks like a mix of CPUs and GPUs from the DB.
    Reused in CPU and GPU related tests.
    """
    return fake_cpus_list + fake_gpus_list


@pytest.fixture
def fake_cpus_list_wrong_brand():
    return [
        {
            "_id": ObjectId("6758bbf1849fa5acb6884203"),
            "brand": "brand2",
            "model": "I11 1234k",
            "fullname": "Core I11 1234k",
            "type": "cpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884204"),
            "brand": "brand2",
            "model": "I11 5678k",
            "fullname": "Core I11 5678k",
            "type": "cpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884205"),
            "brand": "brand3",
            "model": "RI 22 987",
            "fullname": "brand3 RI 22 987",
            "type": "cpu"
        }
    ]


@pytest.fixture
def fake_gpus_list_wrong_brand():
    return [
        {
            "_id": ObjectId("6758bbf1849fa5acb6884208"),
            "brand": "brand5",
            "model": "RX 5800",
            "fullname": "RTX 5800",
            "type": "gpu"
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884209"),
            "brand": "brand5",
            "model": "RX 5800XT",
            "fullname": "RTX 5800XT",
            "type": "gpu"
        }
    ]


def load_data(type_, fake_data):
    """
    Utility to select the correct fake data and patch the MongoDB .find().to_list() call
    for the given hardware type ('cpu' or 'gpu').

    :param type_: "cpu" or "gpu"
    :param fake_data: list of mocked CPU/ GPU dictionaries
    :return: context manager that patches the .find() call
    """
    # Use the relevant fake data source
    # Mock the DB to return GPUs (invalid for this route)
    mock_cursor = AsyncMock()
    mock_cursor.to_list = AsyncMock(return_value=fake_data)
    return patch(f"backend.routes.{type_}s.collection.find", return_value=mock_cursor)
