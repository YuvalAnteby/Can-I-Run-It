import pytest
from httpx import AsyncClient

from backend.tests.smoke.smoke_client import smoke_client

@pytest.mark.smoke
@pytest.mark.asyncio
async def test_cpus_endpoint_smoke(smoke_client: AsyncClient):
    """
    Smoke test for the main CPUs endpoint.

    This test verifies that the endpoint is alive and returns a successful response.
    It does not validate the content, only that the endpoint is reachable and not throwing an error.
    """
    response = await smoke_client.get("/api/hardware/cpus")
    assert response.status_code == 200

@pytest.mark.smoke
@pytest.mark.asyncio
async def test_gpus_endpoint_smoke(smoke_client: AsyncClient):
    """
    Smoke test for the main GPUs endpoint.

    This test verifies that the endpoint is alive and returns a successful response.
    It does not validate the content, only that the endpoint is reachable and not throwing an error.
    """
    response = await smoke_client.get("/api/hardware/gpus")
    assert response.status_code == 200
