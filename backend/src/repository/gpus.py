from typing import Dict, Optional, Any

from motor.motor_asyncio import AsyncIOMotorCollection
from backend.src.schemas.Gpu import Gpu
from backend.src.utils.regex_wrapper import hardware_type_regex


class RepositoryGPU:

    def __init__(self, collection: AsyncIOMotorCollection):
        self.collection = collection

    async def get_gpus(
            self,
            limit: Optional[int] = None,
            additional_query: Optional[Dict[str, Any]] = None
    ) -> list[Gpu]:
        """
       Fetches GPUs from the MongoDB collection with optional additional query parameters.
       :param limit: Maximum number of results to return
       :param additional_query: Additional MongoDB query parameters, if none provided will get all GPUs
       :Returns: List of GPU documents
       """
        base_query = {"type": hardware_type_regex("gpu")}
        if additional_query:
            # Properly combine queries using $and to avoid overwriting
            query = {"$and": [base_query, additional_query]}
        else:
            query = base_query
        gpus_cursor = self.collection.find(query)
        return await gpus_cursor.to_list(length=limit)
