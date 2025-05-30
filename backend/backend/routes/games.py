import os
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
from backend.app.database import mongodb
from backend.schemas.Game import Game
from backend.utils.validation import validate_games_list
import json

# Connect to MongoDB (this assumes MongoDB is running on localhost)
client = AsyncIOMotorClient(os.environ["MONGODB_URI"])
db = client["game_db"]  # Use your desired database name
router = APIRouter()
# Use the games collection
collection = db.games


@router.get("/games")
async def get_all_games():
    """
    Retrieve all CPUs from the database.

    :return: List of all games as dictionaries.
    """
    games_cursor = collection.find()
    games = await games_cursor.to_list(length=None)
    validate_games_list(games)
    return [Game(**game, id=str(game["_id"])) for game in games]


@router.get("/games/category")
async def get_games_by_category(genre, limit: Optional[int] = None):
    """
    Retrieve all games with given genre from the DB.
    :return: List of dictionaries with matching genre.
    """
    genre_regex = {"$regex": re.compile(genre, re.IGNORECASE)}
    games_cursor = collection.find({"genres": genre_regex})
    games = await games_cursor.to_list(length=limit)
    validate_games_list(games, limit=limit, genre=genre)
    return [Game(**game, id=str(game["_id"])) for game in games]


@router.get("/games/newly_added")
async def get_newly_added_games(limit: Optional[int] = 10):
    """
       Returns the last `limit` games added to the DB, sorted by creation time.
       Default limit = 10
       """
    games_cursor = collection.find().sort("created_at", -1).limit(limit)
    games = await games_cursor.to_list(length=limit)
    validate_games_list(games, limit=limit)
    return [Game(**game, id=str(game["_id"])) for game in games]


# TODO needs more work
# TODO create tests
# @router.get("/games/search", response_model=List[Game])
async def search_games(name: Optional[str] = None, year: Optional[str] = None, publisher: Optional[str] = None):
    """
    Performs a search in the MongoDB database for games that match the provided search criteria.
    E.G: name, release year, and publisher.
    The search is flexible and can handle partial matches for the game name and publisher.

    :param name: (str, optional): The name of the game to search for (case-insensitive).
    :param year: (str, optional): The release year of the game. TODO change to int
    :param publisher: (str, optional): The publisher of the game.
    :return: List[GameResponse]: A list of games that match the search criteria.

    :raises: HTTPException: If no games match the search criteria.
    """
    query = {}
    if name:
        query["name"] = {"$regex": name, "$options": "i"}  # Case-insensitive search
    if year:
        query["release_date"] = year
    if publisher:
        query["publisher"] = {"$regex": publisher, "$options": "i"}  # Case-insensitive search

    games_collection = mongodb.get_collection("games")
    games = await games_collection.find(query).to_list(None)  # Fetch all matching games

    if not games:
        raise HTTPException(status_code=404, detail="No games found matching the criteria")

    return [Game(**game) for game in games]

@router.get("/games/home-rows")
async def get_home_shelves():
    """
    Gets the home page shelves from the DB
    """
    config_collection = db.get_collection("configs")
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
