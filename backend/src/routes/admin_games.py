"""
Provides endpoints for creating and deleting games in the database.
These endpoints are intended for admin use and ensure uniqueness of game's metadata entries.
"""

from fastapi import APIRouter, Depends
from typing import List

from backend.src.app.dependencies import get_games_repo
from backend.src.controllers.admin_games import create_game_controller, delete_game_controller, \
    bulk_create_games_controller
from backend.src.schemas.Game import GameCreateDTO

router = APIRouter(prefix="", tags=["Admin - Games"])

@router.post("/", response_model=str)
async def create_game(game: GameCreateDTO, games_repo=Depends(get_games_repo)):
    """
    Create a new game entry in the database.
    - Generates a unique id from the name and release year.
    - Ensures no duplicate game exists before insertion.
    - Returns the database ID of the newly created game.
    - Returns HTTP 409 if a game with the same id already exists.
    :param game: DTO containing game details
    :param games_repo: game repository instance for DB operations
    :returns: Database ID of the created game
    """
    return await create_game_controller(game, games_repo)


@router.delete("/{game_id}", response_model=str)
async def delete_game(game_id: str, games_repo=Depends(get_games_repo)):
    """
    Delete a game entry from the database by its unique id.
    - Returns a success message if deleted.
    - Returns HTTP 404 if the game does not exist.
    :param game_id: The unique id of the game to delete
    :param games_repo: repository instance for DB operations
    :return: Success message if deleted
    """
    return await delete_game_controller(game_id, games_repo)


@router.post("/bulk", response_model=dict)
async def bulk_create_games(games: List[GameCreateDTO], games_repo=Depends(get_games_repo)):
    """
    Bulk create games in the database, skipping duplicates.
    - Accepts a list of game objects.
    - Skips games that already exist (by id).
    - Returns a dict with lists of inserted and skipped ids.
    :param games: List of GameCreateDTO objects
    :param games_repo: repository instance for DB operations
    :return: Dict with 'inserted' and 'skipped' lists of ids
    """
    return await bulk_create_games_controller(games, games_repo)