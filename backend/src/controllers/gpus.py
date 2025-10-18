"""
All functions for handling the GPUs in the DB will be here for ease of use and maintainability.
For example: fetching all GPUs, fetch GPUs by brand, etc.
"""

from typing import Any, Dict, Optional

from fastapi import Depends

from backend.src.repository.gpus import RepositoryGPU
from backend.src.schemas.Gpu import Gpu
from backend.src.utils.regex_wrapper import hardware_brand_regex, hardware_model_regex


async def fetch_all_gpus(limit: Optional[int] = None, gpu_repo: RepositoryGPU = Depends()) -> list[Gpu]:
    """
    Controller, fetches all GPUs from the database.
    :param limit: maximum number of GPUs to fetch. if not provided will fetch all.
    :param gpu_repo: source of data of the GPUs to fetch.
    :return: List of all GPUs as dictionaries.
    """
    gpus: list[Dict[str, Any]] = await gpu_repo.get_gpus(limit=limit)
    return [Gpu(**gpu, id=str(gpu["_id"])) for gpu in gpus]


async def fetch_gpus_by_brand(
    brand: str, limit: Optional[int] = None, gpu_repo: RepositoryGPU = Depends()
) -> list[Gpu]:
    """
    Controller retrieve GPUs with the given brand from the database.

    :param brand: string of brand of the GPU. E.G: AMD and Nvidia. (Not case-sensitive)
    :param limit: maximum number of GPUs to fetch. if not provided will fetch all.
    :param gpu_repo: source of data of the GPUs to fetch.
    :return: list of GPUs of the given brand.
    """
    additional_query = {"brand": hardware_brand_regex(brand)}
    gpus: list[Dict[str, Any]] = await gpu_repo.get_gpus(additional_query=additional_query, limit=limit)
    return [Gpu(**gpu, id=str(gpu["_id"])) for gpu in gpus]


async def fetch_gpus_by_model(
    model: str, limit: Optional[int] = None, gpu_repo: RepositoryGPU = Depends()
) -> list[Gpu]:
    """
    Retrieve GPUs with the given model from the database.

    :param model: string of GPU model. E.G: RTX 2080. (Not case-sensitive)
    :param limit: maximum number of GPUs to fetch. if not provided will fetch all.
    :param gpu_repo: source of data of the GPUs to fetch.
    :return: list of GPUs of the given model's regex.
    """
    additional_query = {
        "$or": [  # Match the input's regex with the full name or the shorten model name.
            {"model": hardware_model_regex(model)},
            {"fullname": hardware_model_regex(model)},
        ]
    }
    gpus: list[Dict[str, Any]] = await gpu_repo.get_gpus(additional_query=additional_query, limit=limit)
    return [Gpu(**gpu, id=str(gpu["_id"])) for gpu in gpus]
