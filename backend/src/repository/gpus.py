from typing import Any, Dict, Optional

from pymongo.asynchronous.collection import AsyncCollection

from backend.src.utils.regex_wrapper import hardware_type_regex


class RepositoryGPU:

    def __init__(self, collection: AsyncCollection):
        self.collection = collection

    async def get_gpus(
        self,
        limit: Optional[int] = None,
        additional_query: Optional[Dict[str, Any]] = None,
    ) -> list[Dict[str, Any]]:
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

    async def create_gpu(self, gpu_data: dict) -> str:
        """
        Inserts a new GPU document into the collection.
        :param gpu_data: Dictionary containing GPU fields.
        :return: The inserted document's ID as a string.
        """
        result = await self.collection.insert_one(gpu_data)
        return str(result.inserted_id)

    async def delete_gpu(self, gpu_id: str) -> bool:
        """
        Deletes a GPU document by its id and type.
        :param gpu_id: The unique id of the GPU to delete.
        :return: True if deleted, False if not found.
        """
        result = await self.collection.delete_one({"id": gpu_id, "type": "gpu"})
        return result.deleted_count > 0

    async def bulk_insert_gpus(self, gpus_data: list[dict]) -> dict:
        """
        Bulk insert GPUs into the collection, skipping duplicates by id.
        :param gpus_data: List of GPU dicts to insert.
        :return: Dict with 'inserted' and 'skipped' lists of ids.
        """
        inserted = []
        skipped = []
        for gpu_data in gpus_data:
            result = await self.create_gpu(gpu_data)
            if result:
                inserted.append(gpu_data["hardware_id"])
            else:
                skipped.append(gpu_data["hardware_id"])
        return {"inserted": inserted, "skipped": skipped}
