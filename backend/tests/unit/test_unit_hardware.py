from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

# --- CPU Route Tests ---


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_all_cpus(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_cpu_repo: AsyncMock,
    fake_cpus_list: list,
):
    """Test fetching all CPUs."""
    mock_cpu_repo.get_cpus.return_value = fake_cpus_list

    response = await async_client_mock.get("/cpus")
    assert response.status_code == 200
    response_data = response.json()
    assert len(response_data) == len(fake_cpus_list)
    # Check if ObjectId is converted to string
    assert "id" in response_data[0]
    assert isinstance(response_data[0]["id"], str)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_cpus_with_limit(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_cpu_repo: AsyncMock,
    fake_cpus_list: list,
):
    """Test fetching all CPUs with a limit."""
    limit = 2
    mock_cpu_repo.get_cpus.return_value = fake_cpus_list[:limit]

    response = await async_client_mock.get(f"/cpus?limit={limit}")

    assert response.status_code == 200
    assert len(response.json()) == limit
    # The limit is passed to the controller, which passes it to the repo.
    # The mock is on the repo, so we check if the repo method was called with the limit.
    call_args = mock_cpu_repo.get_cpus.call_args[1]
    assert call_args["limit"] == limit


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_cpus_by_brand(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_cpu_repo: AsyncMock,
    fake_cpus_list: list,
):
    """Test fetching CPUs by brand."""
    brand = "brand1"
    expected_cpus = [cpu for cpu in fake_cpus_list if cpu["brand"] == brand]
    mock_cpu_repo.get_cpus.return_value = expected_cpus

    response = await async_client_mock.get(f"/cpus?brand={brand}")

    assert response.status_code == 200
    response_data = response.json()
    assert len(response_data) == len(expected_cpus)
    assert all(cpu["brand"] == brand for cpu in response_data)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_cpus_by_model(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_cpu_repo: AsyncMock,
    fake_cpus_list: list,
):
    """Test fetching CPUs by model."""
    model = "RYZEN"
    expected_cpus = [cpu for cpu in fake_cpus_list if model in cpu["model"]]
    mock_cpu_repo.get_cpus.return_value = expected_cpus

    response = await async_client_mock.get(f"/cpus?model={model}")

    assert response.status_code == 200
    response_data = response.json()
    assert len(response_data) == len(expected_cpus)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_cpus_empty_result(test_app: FastAPI, async_client_mock: AsyncClient, mock_cpu_repo: AsyncMock):
    """Test fetching CPUs with a query that returns no results."""
    mock_cpu_repo.get_cpus.return_value = []

    response = await async_client_mock.get("/cpus?brand=nonexistent")

    assert response.status_code == 200
    assert response.json() == []


# --- GPU Route Tests ---


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_all_gpus(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_gpu_repo: AsyncMock,
    fake_gpus_list: list,
):
    """Test fetching all GPUs."""
    mock_gpu_repo.get_gpus.return_value = fake_gpus_list

    response = await async_client_mock.get("/gpus")

    assert response.status_code == 200
    response_data = response.json()
    assert len(response_data) == len(fake_gpus_list)
    assert "id" in response_data[0]
    assert isinstance(response_data[0]["id"], str)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_gpus_with_limit(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_gpu_repo: AsyncMock,
    fake_gpus_list: list,
):
    """Test fetching all GPUs with a limit."""
    limit = 2
    mock_gpu_repo.get_gpus.return_value = fake_gpus_list[:limit]

    response = await async_client_mock.get(f"/gpus?limit={limit}")

    assert response.status_code == 200
    assert len(response.json()) == limit
    call_args = mock_gpu_repo.get_gpus.call_args[1]
    assert call_args["limit"] == limit


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_gpus_by_brand(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_gpu_repo: AsyncMock,
    fake_gpus_list: list,
):
    """Test fetching GPUs by brand."""
    brand = "brand4"
    expected_gpus = [gpu for gpu in fake_gpus_list if gpu["brand"] == brand]
    mock_gpu_repo.get_gpus.return_value = expected_gpus

    response = await async_client_mock.get(f"/gpus?brand={brand}")

    assert response.status_code == 200
    response_data = response.json()
    assert len(response_data) == len(expected_gpus)
    assert all(gpu["brand"] == brand for gpu in response_data)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_gpus_by_model(
    test_app: FastAPI,
    async_client_mock: AsyncClient,
    mock_gpu_repo: AsyncMock,
    fake_gpus_list: list,
):
    """Test fetching GPUs by model."""
    model = "RTXC"
    expected_gpus = [gpu for gpu in fake_gpus_list if model in gpu["model"]]
    mock_gpu_repo.get_gpus.return_value = expected_gpus

    response = await async_client_mock.get(f"/gpus?model={model}")

    assert response.status_code == 200
    response_data = response.json()
    assert len(response_data) == len(expected_gpus)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_gpus_empty_result(test_app: FastAPI, async_client_mock: AsyncClient, mock_gpu_repo: AsyncMock):
    """Test fetching GPUs with a query that returns no results."""
    mock_gpu_repo.get_gpus.return_value = []

    response = await async_client_mock.get("/gpus?brand=nonexistent")

    assert response.status_code == 200
    assert response.json() == []
