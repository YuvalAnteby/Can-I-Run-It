from datetime import datetime, timezone
from typing import AsyncGenerator

import pytest
from bson import ObjectId
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.src.app.dependencies import get_cpu_repo, get_games_repo, get_gpu_repo
from backend.src.routes.admin_hardware import router as admin_hardware_router
from backend.src.routes.cpus import router as cpus_router
from backend.src.routes.games import router as games_router
from backend.src.routes.gpus import router as gpus_router
from backend.src.routes.requirements import router as requirements_router


@pytest.fixture
def test_app():
    """
    Creates a minimal FastAPI app with only the relevant routers.
    Can be reused in any test.
    """
    app = FastAPI()
    app.include_router(requirements_router)
    app.include_router(games_router)
    app.include_router(cpus_router)
    app.include_router(gpus_router)
    app.include_router(admin_hardware_router)
    return app


@pytest.fixture
async def async_client_mock(
    test_app: FastAPI,
    mock_cpu_repo,  # from unit/conftest.py (AsyncMock spec=RepositoryCPU)
    mock_gpu_repo,  # from unit/conftest.py (AsyncMock spec=RepositoryGPU)
    mock_game_repo,
) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client for the hardware test app.
    This fixture sets dependency overrides BEFORE the client is created so
    the injected dependencies inside endpoints are the mocked repos.
    """
    # Override dependencies so endpoints receive the AsyncMock instances
    test_app.dependency_overrides[get_cpu_repo] = lambda: mock_cpu_repo
    test_app.dependency_overrides[get_gpu_repo] = lambda: mock_gpu_repo
    test_app.dependency_overrides[get_games_repo] = lambda: mock_game_repo

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    # cleanup: remove overrides so they don't leak into other tests
    test_app.dependency_overrides.pop(get_cpu_repo, None)
    test_app.dependency_overrides.pop(get_gpu_repo, None)
    test_app.dependency_overrides.pop(get_games_repo, None)


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
        "created_at": datetime.now(timezone.utc),
    }


@pytest.fixture
def fake_games_list(fake_action_games_list):
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
            "created_at": datetime.now(timezone.utc),
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
            "created_at": datetime.now(timezone.utc),
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
            "created_at": datetime.now(timezone.utc),
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
            "created_at": datetime.now(timezone.utc),
        },
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
            "hardware_id": "brand0_ryzen_1234",
            "brand": "brand1",
            "model": "RYZEN 1234",
            "fullname": "Ryzen 0 1234",
            "type": "cpu",
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884202"),
            "hardware_id": "brand1_ryzen_5678",
            "brand": "brand1",
            "model": "RYZEN 5678",
            "fullname": "Ryzen 8 5678",
            "type": "cpu",
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884203"),
            "hardware_id": "brand2_i11_1234k",
            "brand": "brand2",
            "model": "I11 1234k",
            "fullname": "Core I11 1234k",
            "type": "cpu",
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884204"),
            "hardware_id": "brand2_i11_5678k",
            "brand": "brand2",
            "model": "I11 5678k",
            "fullname": "Core I11 5678k",
            "type": "cpu",
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884205"),
            "hardware_id": "brand3_ri_22_987",
            "brand": "brand3",
            "model": "RI 22 987",
            "fullname": "brand3 RI 22 987",
            "type": "cpu",
        },
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
            "hardware_id": "brand4_rtxc_1234",
            "brand": "brand4",
            "model": "RTXC 1234",
            "fullname": "RTXC 1234 (6GB)",
            "type": "gpu",
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884207"),
            "hardware_id": "brand4_rtxc_1234",
            "brand": "brand4",
            "model": "RTXC 1234",
            "fullname": "RTXC 1234 (12GB)",
            "type": "gpu",
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884208"),
            "hardware_id": "brand5_rx_5800",
            "brand": "brand5",
            "model": "RX 5800",
            "fullname": "RTX 5800",
            "type": "gpu",
        },
        {
            "_id": ObjectId("6758bbf1849fa5acb6884209"),
            "hardware_id": "brand5_rx_5800xt",
            "brand": "brand5",
            "model": "RX 5800XT",
            "fullname": "RTX 5800XT",
            "type": "gpu",
        },
    ]


@pytest.fixture
def fake_hardware_list(fake_cpus_list, fake_gpus_list):
    """
    Returns a list of dictionaries that looks like a mix of CPUs and GPUs from the DB.
    Reused in CPU and GPU related tests.
    """
    return fake_cpus_list + fake_gpus_list
