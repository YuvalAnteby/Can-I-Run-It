import pytest
from bson import ObjectId
from fastapi import status

@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_cpu_success(async_client_mock, mock_cpu_repo):
    cpu_payload = {"brand": "Intel", "model": "i9-14900K", "fullname": "Intel i9-14900K", "type": "cpu"}
    mock_cpu_repo.create_cpu.return_value = "some_id"

    response = await async_client_mock.post("/cpus", json=cpu_payload)
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == "some_id"
    mock_cpu_repo.create_cpu.assert_awaited_once()

@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_cpu_conflict(async_client_mock, mock_cpu_repo):
    cpu_payload = {"brand": "Intel", "model": "i9-14900K", "fullname": "Intel i9-14900K", "type": "cpu"}
    mock_cpu_repo.create_cpu.return_value = None  # simulate already exists

    response = await async_client_mock.post("/cpus", json=cpu_payload)
    assert response.status_code == status.HTTP_409_CONFLICT
    assert "already exists" in response.json()["detail"]

@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_cpu_success(async_client_mock, mock_cpu_repo):
    mock_cpu_repo.delete_cpu.return_value = True
    cpu_id = str(ObjectId())

    response = await async_client_mock.delete(f"/cpus/{cpu_id}")
    assert response.status_code == status.HTTP_200_OK
    assert f"CPU with id '{cpu_id}' deleted successfully." == response.json()

@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_cpu_not_found(async_client_mock, mock_cpu_repo):
    mock_cpu_repo.delete_cpu.return_value = False
    cpu_id = str(ObjectId())

    response = await async_client_mock.delete(f"/cpus/{cpu_id}")
    assert response.status_code == status.HTTP_404_NOT_FOUND

@pytest.mark.unit
@pytest.mark.asyncio
async def test_bulk_create_cpus(async_client_mock, mock_cpu_repo):
    cpu_payloads = [
        {"brand": "Intel", "model": "i7-14900K", "fullname": "Intel i7-14900K", "type": "cpu"},
        {"brand": "AMD", "model": "Ryzen 9 7950X", "fullname": "AMD Ryzen 9 7950X", "type": "cpu"}
    ]
    mock_cpu_repo.bulk_insert_cpus.return_value = {
        "inserted": ["intel_i7-14900k", "amd_ryzen_9_7950x"],
        "skipped": []
    }

    response = await async_client_mock.post("/cpus/bulk", json=cpu_payloads)
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "inserted": ["intel_i7-14900k", "amd_ryzen_9_7950x"],
        "skipped": []
    }


# GPU tests
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_gpu_success(async_client_mock, mock_gpu_repo):
    gpu_payload = {"brand": "Nvidia", "model": "RTX 4090", "fullname": "Nvidia RTX 4090", "type": "gpu"}
    mock_gpu_repo.create_gpu.return_value = "gpu_id"

    response = await async_client_mock.post("/gpus", json=gpu_payload)
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == "gpu_id"

@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_gpu_success(async_client_mock, mock_gpu_repo):
    mock_gpu_repo.delete_gpu.return_value = True
    gpu_id = "nvidia_rtx_4090"

    response = await async_client_mock.delete(f"/gpus/{gpu_id}")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == f"GPU with id '{gpu_id}' deleted successfully."

@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_gpu_not_found(async_client_mock, mock_gpu_repo):
    mock_gpu_repo.delete_gpu.return_value = False
    gpu_id = "nvidia_rtx_4080"

    response = await async_client_mock.delete(f"/gpus/{gpu_id}")
    assert response.status_code == status.HTTP_404_NOT_FOUND

@pytest.mark.unit
@pytest.mark.asyncio
async def test_bulk_create_gpus(async_client_mock, mock_gpu_repo):
    gpu_payloads = [
        {"brand": "Nvidia", "model": "RTX 4070", "fullname": "Nvidia RTX 4070", "type": "gpu"},
        {"brand": "AMD", "model": "RX 7900XT", "fullname": "AMD RX 7900XT", "type": "gpu"}
    ]
    mock_gpu_repo.bulk_insert_gpus.return_value = {
        "inserted": ["nvidia_rtx_4070", "amd_rx_7900xt"],
        "skipped": []
    }

    response = await async_client_mock.post("/gpus/bulk", json=gpu_payloads)
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "inserted": ["nvidia_rtx_4070", "amd_rx_7900xt"],
        "skipped": []
    }
