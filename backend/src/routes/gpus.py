from typing import Optional

from fastapi import APIRouter, Depends, Query

from backend.src.app.dependencies import get_gpu_repo
from backend.src.controllers.gpus import fetch_all_gpus, fetch_gpus_by_brand, fetch_gpus_by_model
from backend.src.repository.gpus import RepositoryGPU
from backend.src.schemas.Gpu import Gpu

router = APIRouter(prefix="/gpus", tags=["GPUs"])


@router.get("", response_model=list[Gpu])
async def get_gpus(
    brand: Optional[str] = Query(None, description="Filter by GPU brand (e.g., Intel, AMD)"),
    model: Optional[str] = Query(
        None,
        min_length=2,
        max_length=30,
        description="Filter by GPU model (e.g., RYZEN3600)",
    ),
    limit: Optional[int] = Query(None, ge=1, le=500, description="Maximum number of results"),
    gpu_repo: RepositoryGPU = Depends(get_gpu_repo),
) -> list[Gpu]:
    """
    Retrieve GPUs with optional filters.

    - **No params**: Returns all GPUs
    - **brand**: Filter by brand (case-insensitive)
    - **model**: Filter by model name (case-insensitive, searches both model and fullname fields)
    """
    if brand:
        return await fetch_gpus_by_brand(brand=brand, limit=limit, gpu_repo=gpu_repo)
    elif model:
        return await fetch_gpus_by_model(model=model, limit=limit, gpu_repo=gpu_repo)
    else:
        return await fetch_all_gpus(limit=limit, gpu_repo=gpu_repo)
