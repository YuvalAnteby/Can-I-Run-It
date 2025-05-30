import re
from typing import Optional

from backend.src.app.database import mongo_db
from backend.src.schemas.Game import Game
from backend.src.utils.validation import validate_games_list

collection = mongo_db.games

async def fetch_all_games():
    """
    Controller, retrieve all CPUs from the database.

    :return: List of all games as dictionaries.
    """
    games_cursor = collection.find()
    games = await games_cursor.to_list(length=None)
    validate_games_list(games)
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_games_by_category(genre, limit: Optional[int] = None):
    """
    Controller, retrieve all games with given genre from the DB.
    :return: List of dictionaries with matching genre.
    """
    genre_regex = {"$regex": re.compile(genre, re.IGNORECASE)}
    games_cursor = collection.find({"genres": genre_regex})
    games = await games_cursor.to_list(length=limit)
    validate_games_list(games, limit=limit, genre=genre)
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_newly_added_games(limit: Optional[int] = 10):
    """
       Returns the last `limit` games added to the DB, sorted by creation time.
       Default limit = 10
       """
    games_cursor = collection.find().sort("created_at", -1).limit(limit)
    games = await games_cursor.to_list(length=limit)
    validate_games_list(games, limit=limit)
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_home_shelves():
    """
    Gets the home page shelves from the DB
    """
    config_collection = mongo_db.get_collection("configs")
    docs = await config_collection.find({"name": "home_page"}, {"_id": 0}).to_list(length=1)
    if not docs:
        return []
    # Make sure only enabled shelves are returned
    shelves = docs[0].get("shelves", [])
    enabled_shelves = []
    for i in shelves:
        if i.get("enabled"):
            enabled_shelves.append(i)
    return enabled_shelves