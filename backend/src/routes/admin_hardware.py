"""
Provides endpoints for creating and deleting CPUs and GPUs in the database.
These endpoints are intended for admin use and ensure uniqueness of hardware entries.
"""

from fastapi import APIRouter, Depends
from typing import List
from backend.src.schemas.Cpu import CpuCreateDTO
from backend.src.schemas.Gpu import GpuCreateDTO
from backend.src.app.dependencies import get_cpu_repo, get_gpu_repo
from backend.src.controllers.admin_hardware import (
    create_cpu_controller, create_gpu_controller,
    delete_cpu_controller, delete_gpu_controller,
    bulk_create_cpus_controller, bulk_create_gpus_controller
)

router = APIRouter(prefix="", tags=["Admin - Hardware"])

@router.post("/cpus", response_model=str)
async def create_cpu(cpu: CpuCreateDTO, cpu_repo=Depends(get_cpu_repo)):
    """
    Create a new CPU entry in the database.
    - Generates a unique id from brand and model.
    - Ensures no duplicate CPU exists before insertion.
    - Returns the database ID of the newly created CPU.
    - Returns HTTP 409 if a CPU with the same id already exists.
    :param cpu: DTO containing CPU details
    :param cpu_repo: RepositoryCPU instance for DB operations
    :returns: Database ID of the created CPU
    """
    return await create_cpu_controller(cpu, cpu_repo)

@router.post("/gpus", response_model=str)
async def create_gpu(gpu: GpuCreateDTO, gpu_repo=Depends(get_gpu_repo)):
    """
    Create a new GPU entry in the database.
    - Generates a unique id from brand and model (if implemented in repository).
    - Returns the database ID of the newly created GPU.
    :param gpu: DTO containing GPU details
    :param gpu_repo: RepositoryGPU instance for DB operations
    :return: Database ID of the created GPU
    """
    return await create_gpu_controller(gpu, gpu_repo)

@router.delete("/cpus/{cpu_id}", response_model=str)
async def delete_cpu(cpu_id: str, cpu_repo=Depends(get_cpu_repo)):
    """
    Delete a CPU entry from the database by its unique id.
    - Returns a success message if deleted.
    - Returns HTTP 404 if the CPU does not exist.
    :param cpu_id: The unique id of the CPU to delete
    :param cpu_repo: RepositoryCPU instance for DB operations
    :return: Success message if deleted
    """
    return await delete_cpu_controller(cpu_id, cpu_repo)

@router.delete("/gpus/{gpu_id}", response_model=str)
async def delete_gpu(gpu_id: str, gpu_repo=Depends(get_gpu_repo)):
    """
    Delete a GPU entry from the database by its unique id.
    - Returns a success message if deleted.
    - Returns HTTP 404 if the GPU does not exist.
    :param gpu_id: The unique id of the GPU to delete
    :param gpu_repo: RepositoryGPU instance for DB operations
    :return: Success message if deleted
    """
    return await delete_gpu_controller(gpu_id, gpu_repo)

@router.post("/cpus/bulk", response_model=dict)
async def bulk_create_cpus(cpus: List[CpuCreateDTO], cpu_repo=Depends(get_cpu_repo)):
    """
    Bulk create CPUs in the database, skipping duplicates.
    - Accepts a list of CPU objects.
    - Skips CPUs that already exist (by id).
    - Returns a dict with lists of inserted and skipped ids.
    :param cpus: List of CpuCreateDTO objects
    :param cpu_repo: RepositoryCPU instance for DB operations
    :return: Dict with 'inserted' and 'skipped' lists of ids
    """
    return await bulk_create_cpus_controller(cpus, cpu_repo)

@router.post("/gpus/bulk", response_model=dict)
async def bulk_create_gpus(gpus: List[GpuCreateDTO], gpu_repo=Depends(get_gpu_repo)):
    """
    Bulk create GPUs in the database, skipping duplicates.
    - Accepts a list of GPU objects.
    - Skips GPUs that already exist (by id).
    - Returns a dict with lists of inserted and skipped ids.
    :param gpus: List of Gpu objects
    :param gpu_repo: RepositoryGPU instance for DB operations
    :return: Dict with 'inserted' and 'skipped' lists of ids
    """
    return await bulk_create_gpus_controller(gpus, gpu_repo)
