from typing import Optional

from fastapi import APIRouter, Query

from backend.src.controllers.cpus import fetch_all_cpus, fetch_cpus_by_brand, fetch_cpus_by_model
from backend.src.schemas.Cpu import Cpu

router = APIRouter(prefix="/cpus", tags=["CPUs"])

@router.get("", response_model=list[Cpu])
async def get_cpus(
        brand: Optional[str] = Query(None, description="Filter by CPU brand (e.g., Intel, AMD)"),
        model: Optional[str] = Query(None, min_length=2, max_length=30, description="Filter by CPU model (e.g., RYZEN3600)"),
        limit: Optional[int] = Query(None, ge=1, le=500, description="Maximum number of results")
) -> list[Cpu]:
    """
    Retrieve CPUs with optional filters.

    - **No params**: Returns all CPUs
    - **brand**: Filter by brand (case-insensitive)
    - **model**: Filter by model name (case-insensitive, searches both model and fullname fields)
    """
    if brand:
        return await fetch_cpus_by_brand(brand=brand, limit=limit)
    elif model:
        return await fetch_cpus_by_model(model=model, limit=limit)
    else:
        return await fetch_all_cpus(limit=limit)
