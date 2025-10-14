from typing import Dict, Optional, Any
from bson import ObjectId
from bson.errors import InvalidId

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

    async def create_cpu(self, cpu_data: dict) -> str | None:
        """
        Inserts a new CPU document into the collection.
        :param cpu_data: Dictionary containing CPU fields.
        :return: The inserted document's ID as a string.
        """
        # Check for existing CPU with same id
        existing_cpu = await self.collection.find_one({"fullname": cpu_data["fullname"], "type": "cpu"})
        if existing_cpu:
            return None  # Indicate already exists
        result = await self.collection.insert_one(cpu_data)
        return str(result.inserted_id)

    async def delete_cpu(self, cpu_id: str) -> bool:
        """
        Deletes a CPU document by its id and type.
        :param cpu_id: The unique id of the CPU to delete (MongoDB ObjectId as string).
        :return: True if deleted, False if not found or invalid id.
        """
        try:
            object_id = ObjectId(cpu_id)
        except InvalidId:
            return False
        result = await self.collection.delete_one({"_id": object_id, "type": "cpu"})
        return result.deleted_count > 0

    async def bulk_insert_cpus(self, cpus_data: list[dict]) -> dict:
        """
        Bulk insert CPUs into the collection, skipping duplicates by id.
        :param cpus_data: List of CPU dicts to insert.
        :return: Dict with 'inserted' and 'skipped' lists of ids.
        """
        inserted = []
        skipped = []
        for cpu_data in cpus_data:
            cpu_id = cpu_data["brand"].lower() + "_" + cpu_data["model"].lower().replace(' ', '_')
            cpu_data["id"] = cpu_id
            existing = await self.collection.find_one({"id": cpu_id, "type": "cpu"})
            if existing:
                skipped.append(cpu_id)
                continue
            await self.collection.insert_one(cpu_data)
            inserted.append(cpu_id)
        return {"inserted": inserted, "skipped": skipped}
