"""
All functions for handling the CPUs in the DB will be here for ease of use and maintainability.
For example: fetching all CPUs, fetch CPUs by brand, etc.
"""
import re

from fastapi import HTTPException

from backend.src.app.database import mongo_db
from backend.src.schemas.Cpu import Cpu
from backend.src.utils.validation import validate_hardware_list

collection = mongo_db.hardware

async def fetch_all_cpus(): # TODO -> list[Cpu]
    """
        Controller, fetches all CPUs from the database.

        :return: List of all CPUs as dictionaries.
        """
    cpu_regex = {"$regex": re.compile("cpu", re.IGNORECASE)}
    try:
        cpus_cursor = collection.find({"type": cpu_regex})
        cpus = await cpus_cursor.to_list(length=None)
        validate_hardware_list(cpus, "cpu")
        return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]
    except HTTPException as http_exception:
        raise http_exception
    except Exception as e:
        print(f"Error fetching CPUs: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching CPUs: {str(e)}")


async def fetch_cpus_by_brand(brand: str):
    """
    Controller retrieve CPUs with the given brand from the database.

    :param brand: string of brand of the CPU. E.G: AMD and Intel. (Not case-sensitive)
    :return: list of CPUs of the given brand.
    """
    try:
        brand_regex = {"$regex": re.compile(brand, re.IGNORECASE)}
        cpu_regex = {"$regex": re.compile("cpu", re.IGNORECASE)}
        cpus_cursor = collection.find({"brand": brand_regex, "type": cpu_regex})
        cpus = await cpus_cursor.to_list(length=None)
        validate_hardware_list(cpus, "cpu", brand=brand)
        return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]
    except HTTPException as http_exception:
        raise http_exception
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching cpus by model: {str(e)}")

async def fetch_cpus_by_model(model: str):
    """
    Retrieve CPUs with the given model from the database.

    :param model: string of CPU model. E.G: RYZEN3600. (Not case-sensitive)
    :return: list of CPUs of the given model's regex.
    """
    model_regex = {"$regex": re.compile(model, re.IGNORECASE)}
    cpu_regex = {"$regex": re.compile("cpu", re.IGNORECASE)}
    search_query = {
        "$and": [
            {"type": cpu_regex},  # Ensure the hardware is a CPU
            {
                "$or": [  # Match the input's regex with the full name or the shorten model name.
                    {"model": model_regex},
                    {"fullname": model_regex}
                ]
            }
        ]
    }
    try:
        cpus_cursor = collection.find(search_query)
        cpus = await cpus_cursor.to_list()
        # If cpus is empty count it as no games found error
        validate_hardware_list(cpus, "cpu", model=model)
        return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]
    except HTTPException as http_exception:
        raise http_exception
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching cpus by model: {str(e)}")