"""
All functions for handling the CPUs in the DB will be here for ease of use and maintainability.
For example: fetching all CPUs, fetch CPUs by brand, etc.
"""

from backend.src.app.database import mongo_db
from backend.src.schemas.Cpu import Cpu
from backend.src.utils.regex_wrapper import hardware_type_regex, hardware_model_regex, hardware_brand_regex
from backend.src.utils.validation import validate_hardware_list

collection = mongo_db.hardware


async def fetch_all_cpus():  # TODO -> list[Cpu]
    """
        Controller, fetches all CPUs from the database.

        :return: List of all CPUs as dictionaries.
        """
    query = {
        "type": hardware_type_regex("cpu")
    }
    cpus_cursor = collection.find(query)
    cpus = await cpus_cursor.to_list(length=None)
    validate_hardware_list(cpus, "cpu")
    return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]


async def fetch_cpus_by_brand(brand: str):
    """
    Controller retrieve CPUs with the given brand from the database.

    :param brand: string of brand of the CPU. E.G: AMD and Intel. (Not case-sensitive)
    :return: list of CPUs of the given brand.
    """
    query = {
        "brand": hardware_brand_regex(brand),
        "type": hardware_type_regex("cpu")
    }
    cpus_cursor = collection.find(query)
    cpus = await cpus_cursor.to_list(length=None)
    validate_hardware_list(cpus, "cpu", brand=brand)
    return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]


async def fetch_cpus_by_model(model: str):
    """
    Retrieve CPUs with the given model from the database.

    :param model: string of CPU model. E.G: RYZEN3600. (Not case-sensitive)
    :return: list of CPUs of the given model's regex.
    """
    search_query = {
        "$and": [
            {"type": hardware_type_regex("cpu")},  # Ensure the hardware is a CPU
            {
                "$or": [  # Match the input's regex with the full name or the shorten model name.
                    {"model": hardware_model_regex(model)},
                    {"fullname": hardware_model_regex(model)}
                ]
            }
        ]
    }
    cpus_cursor = collection.find(search_query)
    cpus = await cpus_cursor.to_list()
    # If cpus is empty count it as no games found error
    validate_hardware_list(cpus, "cpu", model=model)
    return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]
