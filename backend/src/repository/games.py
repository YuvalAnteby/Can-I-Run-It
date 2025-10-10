from typing import Optional, Any, Dict, List
from pymongo.asynchronous.collection import AsyncCollection



class RepositoryGame:

    def __init__(self, collection: AsyncCollection):
        self.collection = collection

    async def get_games(
            self,
            limit: Optional[int] = None,
            sort_by: Optional[str] = None,
            sort_order: int = 1,  # 1 for ascending, -1 for descending
            additional_query: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetches games from the MongoDB collection with optional filters and sorting.

        :param limit: Maximum number of results to return
        :param sort_by: Field to sort by
        :param sort_order: Sort direction (1 = ascending, -1 = descending)
        :param additional_query: Additional MongoDB query parameters
        :return: List of game documents
        """
        query = additional_query if additional_query else {}

        cursor = self.collection.find(query)

        if sort_by:
            cursor = cursor.sort(sort_by, sort_order)

        if limit:
            cursor = cursor.limit(limit)

        return await cursor.to_list(length=limit)

    async def get_config(self, config_name: str) -> Optional[Dict[str, Any]]:
        """
        Fetches a configuration document by name.

        :param config_name: Name of the configuration
        :return: Configuration document or None
        """
        config_collection = self.collection.database.get_collection("configs")
        docs = await config_collection.find(
            {"name": config_name},
            {"_id": 0}
        ).to_list(length=1)
        return docs[0] if docs else None