from fastapi import Depends, HTTPException
from backend.src.schemas.Cpu import CpuCreateDTO
from backend.src.schemas.Gpu import Gpu
from backend.src.repository.cpus import RepositoryCPU
from backend.src.repository.gpus import RepositoryGPU
from typing import List

async def create_cpu_controller(cpu: CpuCreateDTO, cpu_repo: RepositoryCPU = Depends()) -> str:
    """
    Creates a new CPU in the database if it does not already exist.
    - Generates a unique id from brand and model.
    - Checks for existence by id before insertion.
    - Raises HTTP 409 if a CPU with the same id exists.
    :param cpu: CpuCreateDTO containing CPU details (brand, model, fullname, type)
    :param cpu_repo: RepositoryCPU instance for DB operations
    :return: The inserted document's database ID as a string
    """
    cpu_data = cpu.model_dump(exclude={"id"})
    cpu_data["type"] = "cpu"
    inserted_id = await cpu_repo.create_cpu(cpu_data)
    if inserted_id is None:
        raise HTTPException(status_code=409, detail=f"CPU '{cpu.fullname}' already exists.")
    return inserted_id

async def create_gpu_controller(gpu: Gpu, gpu_repo: RepositoryGPU = Depends()) -> str:
    """
    Creates a new GPU in the database.
    - Generates a unique id from brand and model (if implemented in repository).
    :param gpu: Gpu containing GPU details (brand, model, fullname, type)
    :param gpu_repo: RepositoryGPU instance for DB operations
    :return: The inserted document's database ID as a string
    """
    gpu_data = gpu.model_dump(exclude={"id"})
    gpu_data["type"] = "gpu"
    inserted_id = await gpu_repo.create_gpu(gpu_data)
    return inserted_id

async def delete_cpu_controller(cpu_id: str, cpu_repo: RepositoryCPU = Depends()) -> str:
    """
    Deletes a CPU by its unique id. Raises 404 if not found.
    :param cpu_id: The unique id of the CPU to delete
    :param cpu_repo: RepositoryCPU instance for DB operations
    :return: Success message if deleted
    """
    deleted = await cpu_repo.delete_cpu(cpu_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"CPU with id '{cpu_id}' not found.")
    return f"CPU with id '{cpu_id}' deleted successfully."

async def delete_gpu_controller(gpu_id: str, gpu_repo: RepositoryGPU = Depends()) -> str:
    """
    Deletes a GPU by its unique id. Raises 404 if not found.
    :param gpu_id: The unique id of the GPU to delete
    :param gpu_repo: RepositoryGPU instance for DB operations
    :return: Success message if deleted
    """
    deleted = await gpu_repo.delete_gpu(gpu_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"GPU with id '{gpu_id}' not found.")
    return f"GPU with id '{gpu_id}' deleted successfully."

async def bulk_create_cpus_controller(cpus: List[CpuCreateDTO], cpu_repo: RepositoryCPU = Depends()) -> dict:
    """
    Bulk create CPUs in the database, skipping duplicates.
    :param cpus: List of CpuCreateDTO objects
    :param cpu_repo: RepositoryCPU instance for DB operations
    :return: Dict with lists of inserted and skipped ids
    """
    cpus_data = [cpu.model_dump(exclude={"id"}) | {"type": "cpu"} for cpu in cpus]
    result = await cpu_repo.bulk_insert_cpus(cpus_data)
    return result

async def bulk_create_gpus_controller(gpus: List[Gpu], gpu_repo: RepositoryGPU = Depends()) -> dict:
    """
    Bulk create GPUs in the database, skipping duplicates.
    :param gpus: List of Gpu objects
    :param gpu_repo: RepositoryGPU instance for DB operations
    :return: Dict with lists of inserted and skipped ids
    """
    gpus_data = [gpu.model_dump(exclude={"id"}) | {"type": "gpu"} for gpu in gpus]
    result = await gpu_repo.bulk_insert_gpus(gpus_data)
    return result
