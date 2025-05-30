from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from backend.src.routes.cpus import router as cpus_router
from backend.src.routes.gpus import router as gpus_router
from backend.tests.conftest import load_data, fake_cpus_list

# Create a temporary app with only this router for testing
app = FastAPI()
app.include_router(cpus_router)
app.include_router(gpus_router)


@pytest.mark.asyncio
@pytest.mark.parametrize("type_, endpoint, fake_data", [
    ("cpu", "/cpus", "fake_cpus_list"),
    ("gpu", "/gpus", "fake_gpus_list"),
])
async def test_get_all_hardware_returns_list_of_same_type_only(async_client, type_, endpoint, fake_data, request):
    """
    Test: /cpus should return 200 and only CPUs when data is valid
    :param async_client:
    """
    data = request.getfixturevalue(fake_data)
    with load_data(type_, data):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(endpoint)

    assert response.status_code == 200
    assert all(item["type"].lower() == type_ for item in response.json())


@pytest.mark.asyncio
@pytest.mark.parametrize("type_, endpoint, wrong_data", [
    ("cpu", "/cpus", "fake_gpus_list"),
    ("gpu", "/gpus", "fake_cpus_list"),
])
async def test_get_all_hardware_wrong_type_included(async_client, type_, endpoint, wrong_data, request):
    """
    Test: /cpus should return 500 if GPU entries are accidentally returned
    :param async_client:
    """
    data = request.getfixturevalue(wrong_data)
    with load_data(type_, data):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(endpoint)
    assert response.json()["detail"] == f"Non-{type_} hardware found in {type_} route"
    assert response.status_code == 500



@pytest.mark.asyncio
@pytest.mark.parametrize("type_, endpoint, wrong_data", [
    ("cpu", "/cpus", "fake_cpus_list"),
    ("gpu", "/gpus", "fake_gpus_list"),
])
async def test_get_hardware_by_model_returns_500_when_no_model_exist(
        async_client,
        type_,
        endpoint,
        wrong_data,
        request
):
    """
    Test:
    :param async_client:
    """
    # Mock the DB to return GPUs (invalid for this route)
    data = request.getfixturevalue(wrong_data)
    mock_cursor = AsyncMock()
    mock_cursor.to_list = AsyncMock(return_value=data)
    with patch(f"backend.src.routes.{type_}s.collection.find", return_value=mock_cursor):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(f"{endpoint}/model?model=rizen",
                                    params={"model": "nonexistent model"})

    assert response.status_code == 500
    assert response.json()["detail"] == f"Wrong model regex found in {type_}s fetched"


@pytest.mark.asyncio
@pytest.mark.parametrize("type_, endpoint, correct_brand, wrong_data", [
    ("cpu", "/cpus", "brand1", "fake_cpus_list_wrong_brand"),
    ("gpu", "/gpus", "brand4", "fake_gpus_list_wrong_brand"),
])
async def test_get_cpu_by_brand_wrong_brand_returns_500(
        async_client,
        type_,
        endpoint,
        correct_brand,
        wrong_data,
        request
):
    data = request.getfixturevalue(wrong_data)
    mock_cursor = AsyncMock()
    mock_cursor.to_list = AsyncMock(return_value=data)
    with patch(f"backend.src.routes.{type_}s.collection.find", return_value=mock_cursor):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(f"{endpoint}/brand?brand={correct_brand}")
        assert response.status_code == 500
        assert response.json()["detail"] == f"Wrong brand found in {type_}s fetched"
