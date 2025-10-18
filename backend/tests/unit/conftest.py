from unittest.mock import AsyncMock

import pytest

from backend.src.repository.cpus import RepositoryCPU
from backend.src.repository.games import RepositoryGame
from backend.src.repository.gpus import RepositoryGPU


@pytest.fixture
def mock_cpu_repo():
    """Fixture for a mocked CPU repository."""
    return AsyncMock(spec=RepositoryCPU)


@pytest.fixture
def mock_gpu_repo():
    """Fixture for a mocked GPU repository."""
    return AsyncMock(spec=RepositoryGPU)


@pytest.fixture
def mock_game_repo():
    """Fixture for a mocked game repository."""
    return AsyncMock(spec=RepositoryGame)
