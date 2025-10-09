"""
All functions for handling the CPUs in the DB will be here for ease of use and maintainability.
For example: fetching all CPUs, fetch CPUs by brand, etc.
"""
from typing import Any, Dict, Optional

from backend.src.app.database import mongo_db
from backend.src.schemas.Cpu import Cpu
from backend.src.utils.regex_wrapper import hardware_model_regex, hardware_brand_regex
from backend.src.repository.cpus import RepositoryCPU

cpu_repo = RepositoryCPU(mongo_db.hardware)


async def fetch_all_cpus(limit: Optional[int] = None) -> list[Cpu]:
    """
    Controller, fetches all CPUs from the database.
    :param limit: maximum number of CPUs to fetch. if not provided will fetch all.
    :return: List of all CPUs as dictionaries.
    """
    cpus: list[Dict[str, Any]] = await cpu_repo.get_cpus(limit=limit)
    return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]


async def fetch_cpus_by_brand(brand: str, limit: Optional[int] = None) -> list[Cpu]:
    """
    Controller retrieve CPUs with the given brand from the database.

    :param brand: string of brand of the CPU. E.G: AMD and Intel. (Not case-sensitive)
    :param limit: maximum number of CPUs to fetch. if not provided will fetch all.
    :return: list of CPUs of the given brand.
    """
    additional_query = {"brand": hardware_brand_regex(brand)}
    cpus: list[Dict[str, Any]] = await cpu_repo.get_cpus(additional_query=additional_query, limit=limit)
    return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]


async def fetch_cpus_by_model(model: str, limit: Optional[int] = None):
    """
    Retrieve CPUs with the given model from the database.

    :param model: string of CPU model. E.G: RYZEN3600. (Not case-sensitive)
    :param limit: maximum number of CPUs to fetch. if not provided will fetch all.
    :return: list of CPUs of the given model's regex.
    """
    additional_query = {
        "$or": [  # Match the input's regex with the full name or the shorten model name.
            {"model": hardware_model_regex(model)},
            {"fullname": hardware_model_regex(model)}
        ]
    }
    cpus: list[Dict[str, Any]] = await cpu_repo.get_cpus(additional_query=additional_query, limit=limit)
    return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]
