from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.asynchronous.collection import AsyncCollection


class RepositoryGame:

    def __init__(self, collection: AsyncCollection):
        self.collection = collection

    async def get_games(
        self,
        limit: Optional[int] = None,
        sort_by: Optional[str] = None,
        sort_order: int = 1,  # 1 for ascending, -1 for descending
        additional_query: Optional[Dict[str, Any]] = None,
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

        :param config_name: Name of the configuration.
        :return: Configuration document or None
        """
        config_collection = self.collection.database.get_collection("configs")
        docs = await config_collection.find({"name": config_name}, {"_id": 0}).to_list(length=1)
        return docs[0] if docs else None

    async def create_game(self, game_data: dict) -> str | None:
        """
        Inserts a new game document into the collection.
        :param game_data: Dictionary containing game fields.
        :return: The inserted document's ID as a string.
        """
        # Check for existing game with same id
        existing = await self.collection.find_one({"game_id": game_data["game_id"]})
        if existing:
            return None  # Indicate already exists
        result = await self.collection.insert_one(game_data)
        return str(result.inserted_id)

    async def delete_game(self, game_id: str) -> bool:
        """
        Deletes a game document by its id.
        :param game_id: The unique id of the game to delete (MongoDB ObjectId as string).
        :return: True if deleted, False if not found or invalid id.
        """
        try:
            object_id = ObjectId(game_id)
        except InvalidId:
            return False
        result = await self.collection.delete_one({"_id": object_id})
        return result.deleted_count > 0

    async def bulk_insert_games(self, games_data: list[dict]) -> dict:
        """
        Bulk insert games into the collection, skipping duplicates by id.
        :param games_data: List of game dicts to insert.
        :return: Dict with 'inserted' and 'skipped' lists of ids.
        """
        inserted = []
        skipped = []
        for game_data in games_data:
            existing = await self.collection.find_one({"game_id": game_data["game_id"]})
            if existing:
                skipped.append(game_data["game_id"])
                continue
            await self.collection.insert_one(game_data)
            inserted.append(game_data["game_id"])
        return {"inserted": inserted, "skipped": skipped}
