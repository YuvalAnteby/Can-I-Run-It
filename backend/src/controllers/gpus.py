"""
All function for handling the GPUs in the DB will be here for ease of use and maintainability.
For example: adding new hardware, fetching hardware, and more.
"""
import re

from backend.src.app.database import mongo_db
from backend.src.schemas.Gpu import Gpu
from backend.src.utils.validation import validate_hardware_list

collection = mongo_db.hardware


async def fetch_all_gpus():
    """
       Controller, retrieve all GPUs from the database.

       :return: List of all GPUs as dictionaries.
       """
    gpu_regex = {"$regex": re.compile("gpu", re.IGNORECASE)}
    gpus_cursor = collection.find({"type": gpu_regex})
    gpus = await gpus_cursor.to_list(length=None)
    validate_hardware_list(gpus, "gpu")
    return [Gpu(**gpu, id=str(gpu["_id"])) for gpu in gpus]


async def fetch_gpus_by_brand(brand: str):
    """
    Controller, retrieve GPUs with the given brand from the database.

    :param brand: string of brand of the GPU. E.G: Nvidia. (Not case-sensitive)
    :return: list of GPUs of the given brand.
    """
    brand_regex = {"$regex": re.compile(brand, re.IGNORECASE)}
    gpu_regex = {"$regex": re.compile("gpu", re.IGNORECASE)}
    gpus_cursor = collection.find({"brand": brand_regex, "type": gpu_regex})
    gpus = await gpus_cursor.to_list(length=None)
    validate_hardware_list(gpus, "gpu", brand=brand)
    return [Gpu(**gpu, id=str(gpu["_id"])) for gpu in gpus]


async def fetch_gpus_by_model(model: str):
    """
        Performs a search in the MongoDB collection for GPUs using regex of the model.

        :param model: string of GPU model, E.G: RTX4090 (Not case-sensitive)
        :return: list of GPUS with matching fullname or model
        """
    model_regex = {"$regex": re.compile(model, re.IGNORECASE)}
    gpu_regex = {"$regex": re.compile("gpu", re.IGNORECASE)}
    search_query = {
        "$and": [
            {"type": gpu_regex},  # Ensure the hardware is a CPU
            {
                "$or": [  # Match the input's regex with the full name or the shorten model name.
                    {"model": model_regex},
                    {"fullname": model_regex}
                ]
            }
        ]
    }
    gpus_cursor = collection.find(search_query)
    gpus = await gpus_cursor.to_list()
    validate_hardware_list(gpus, "gpu", model=model)
    return [Gpu(**gpu, id=str(gpu["_id"])) for gpu in gpus]
