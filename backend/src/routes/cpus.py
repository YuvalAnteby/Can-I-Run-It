from fastapi import APIRouter

from backend.src.controllers.cpus import fetch_all_cpus, fetch_cpus_by_brand, fetch_cpus_by_model

router = APIRouter(prefix="/cpus", tags=["CPUs"])


@router.get("")
async def get_all_cpus():
    return await fetch_all_cpus()


@router.get("/brand")
async def get_cpu_by_brand(brand: str):
    return await fetch_cpus_by_brand(brand=brand)


@router.get("/model")
async def get_cpu_by_model(model: str):
    return await fetch_cpus_by_model(model=model)
