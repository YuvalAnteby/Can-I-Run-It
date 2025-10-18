from typing import List

from fastapi import Depends, HTTPException

from backend.src.repository.games import RepositoryGame
from backend.src.schemas.Game import GameCreateDTO


async def create_game_controller(game: GameCreateDTO, games_repo: RepositoryGame = Depends()) -> str:
    """
    Creates a new game in the database if it does not already exist.
    - Generates a unique id from the name and release year.
    - Checks for existence by id before insertion.
    - Raises HTTP 409 if a game with the same id exists.
    :param game: DTO containing game details
    :param games_repo: Repository instance for DB operations
    :return: The inserted document's database ID as a string
    """
    game_data = game.model_dump(exclude={"id"})
    game_data["game_id"] = f"{game.name.strip().lower().replace(' ', '_')}_{game.release_date}"
    inserted_id = await games_repo.create_game(game_data)
    if inserted_id is None:
        raise HTTPException(
            status_code=409,
            detail=f"Game '{game.fullname} {game.release_date}' already exists.",
        )
    return inserted_id


async def delete_game_controller(game_id: str, games_repo: RepositoryGame = Depends()) -> str:
    """
    Deletes a game by its unique id. Raises 404 if not found.
    :param game_id: The unique id of the game to delete
    :param games_repo: Repository instance for DB operations
    :return: Success message if deleted
    """
    deleted = await games_repo.delete_game(game_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Game with id '{game_id}' not found.")
    return f"Game with id '{game_id}' deleted successfully."


async def bulk_create_games_controller(games: List[GameCreateDTO], games_repo: RepositoryGame = Depends()) -> dict:
    """
    Bulk create games in the database, skipping duplicates.
    :param games: List of GameCreateDTO objects
    :param games_repo: Repository instance for DB operations
    :return: Dict with lists of inserted and skipped ids
    """
    games_data = [
        game.model_dump(exclude={"id"})
        | {"game_id": f"{game.name.strip().lower().replace(' ', '_')}_{game.release_date}"}
        for game in games
    ]
    result = await games_repo.bulk_insert_games(games_data)
    return result
