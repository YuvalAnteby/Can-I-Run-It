from bson import ObjectId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

"""
All function for handling the games in the DB will be here for ease of use and maintainability.
For example: adding new game, adding new hardware requirements, and more.
"""

# Assuming MongoDB instance running locally
client = AsyncIOMotorClient('mongodb://localhost:27017')
db = client['game_db']
games_collection = db.get_collection('games')


async def get_game(game_id: str):
    """
    Gets a game from the database using MongoDB's built-in ids.

    :param game_id: game id made by MongoDB (attribute is called _id)
    :return: a single game of this id
    """
    game_cursor = await games_collection.find_one({"_id": ObjectId(game_id)})
    if game_cursor is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return game_cursor


async def search_game_by_name(name: str):
    """
    Performs a search in the MongoDB database for a game by name.

    :param name: string of the game's name. Will be searched by this as regex
    :return: list of games that match
    """
    name_regex = {"$regex": name, "$options": "i"}
    games_cursor = games_collection.find({"name": name_regex})
    games = await games_cursor.to_list(length=100)
    if not games:
        raise HTTPException(status_code=404, detail="No games found matching the name's regex")
    return games


async def search_game_by_publisher(game_publisher: str):
    """
     Performs a search in the MongoDB database for games that have the provided publisher.

    :param game_publisher: string name of the publisher of the games.
    :return: list of games that match
    """
    publisher_regex = {"$regex": game_publisher, "$options": "i"}
    games_cursor = games_collection.find({"publisher": publisher_regex})
    games = await games_cursor.to_list(length=100)
    if not games:
        raise HTTPException(status_code=404, detail="No games found matching the publisher regex")
    return games


async def search_game_by_release_year(release_year: str):
    """
    Performs a search in the MongoDB database for games that have the provided release year.
    :param release_year: string of the game's release year.
    :return: list of games that match
    """
    games_cursor = games_collection.find({"release_date": release_year})
    games = await games_cursor.to_list(length=100)
    if not games:
        raise HTTPException(status_code=404, detail="No games found matching the year")
    return games


# Add a new requirement setting for a game TODO test
def add_requirement_to_game(game_id, setting_id, hardware_requirements):
    """
    Add a new setting with required hardware to the game.
    E.G:
        new_setting = {
        "cpu_intel": ["intel_i7_9700k"],
        "gpu_nvidia": ["nvidia_rtx_3080"],
        "ram": 16
        }
        add_requirement_to_game("God of War", "4k_high_60fps", new_setting)

    :param game_id: id of the required game. E.G: RTX 4090
    :param setting_id: name of the required setting. E.G: 1080p_high_60fps
    :param hardware_requirements: list of hardware requirements
    """
    game = db.games.find_one({"id": game_id})
    if game:
        db.games.update_one(
            {"id": game_id},
            {"$set": {f"requirements.{setting_id}": hardware_requirements}}
        )
        print(f"Added requirement '{setting_id}' to game '{game_id}'.")
    else:
        print(f"Game '{game_id}' not found.")



# TODO add advanced search function
