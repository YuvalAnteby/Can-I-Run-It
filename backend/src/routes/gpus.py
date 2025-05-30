from fastapi import APIRouter

from backend.src.controllers.gpus import fetch_all_gpus, fetch_gpus_by_brand, fetch_gpus_by_model

router = APIRouter()


@router.get("/gpus")
async def get_all_gpus():
    return await fetch_all_gpus()


@router.get("/brand")
async def get_gpu_by_brand(brand: str):
    return await fetch_gpus_by_brand(brand=brand)


@router.get("/model")
async def get_gpu_by_model(model: str):
    return await fetch_gpus_by_model(model=model)
