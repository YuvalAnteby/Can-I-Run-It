from backend.src.app.database import mongo_db
from backend.src.repository.cpus import RepositoryCPU
from backend.src.repository.games import RepositoryGame
from backend.src.repository.gpus import RepositoryGPU


def get_cpu_repo() -> RepositoryCPU:
    return RepositoryCPU(mongo_db.hardware)


def get_gpu_repo() -> RepositoryGPU:
    return RepositoryGPU(mongo_db.hardware)


def get_games_repo() -> RepositoryGame:
    return RepositoryGame(mongo_db.games)
