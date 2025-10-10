from typing import Dict, Optional, Any

from pymongo.asynchronous.collection import AsyncCollection
from backend.src.schemas.Cpu import Cpu
from backend.src.utils.regex_wrapper import hardware_type_regex


class RepositoryCPU:

    def __init__(self, collection: AsyncCollection):
        self.collection = collection

    async def get_cpus(
            self,
            limit: Optional[int] = None,
            additional_query: Optional[Dict[str, Any]] = None
    ) -> list[Cpu]:
        """
       Fetches CPUs from the MongoDB collection with optional additional query parameters.
       :param limit: Maximum number of results to return
       :param additional_query: Additional MongoDB query parameters, if none provided will get all CPUs
       :Returns: List of CPU documents
       """
        base_query = {"type": hardware_type_regex("cpu")}
        if additional_query:
            # Properly combine queries using $and to avoid overwriting
            query = {"$and": [base_query, additional_query]}
        else:
            query = base_query
        cpus_cursor = self.collection.find(query)
        return await cpus_cursor.to_list(length=limit)
