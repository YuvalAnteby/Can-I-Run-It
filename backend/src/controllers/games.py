from typing import Any, Dict, List, Optional

from backend.src.repository.games import RepositoryGame
from backend.src.schemas.Game import Game
from backend.src.utils.regex_wrapper import games_genre_regex


async def fetch_all_games(game_repo: RepositoryGame, limit: Optional[int] = None) -> List[Game]:
    """
    Controller, retrieve all games from the database.

    :return: List of all games.
    """
    games: list[Dict[str, Any]] = await game_repo.get_games(limit=limit)
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_games_by_category(game_repo: RepositoryGame, genre: str, limit: Optional[int] = None) -> List[Game]:
    """
    Controller, retrieve all games with given genre from the DB.

    :param game_repo: Repository instance
    :param genre: Genre to filter by (case-insensitive)
    :param limit: Maximum number of games to return
    :return: List of games matching the genre.
    """
    additional_query = {"genres": games_genre_regex(genre)}
    games = await game_repo.get_games(limit=limit, additional_query=additional_query)
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_newly_added_games(game_repo: RepositoryGame, limit: int = 10) -> List[Game]:
    """
    Returns the last `limit` games added to the DB, sorted by creation time.

    :param game_repo: Repository instance
    :param limit: Number of games to return (default: 10)
    :return: List of newly added games.
    """
    games = await game_repo.get_games(limit=limit, sort_by="created_at", sort_order=-1)  # Descending (newest first)
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_home_shelves(game_repo: RepositoryGame) -> List[Dict[str, Any]]:
    """
    Gets the enabled home page shelves from the DB.

    :param game_repo: Repository instance
    :return: List of enabled shelf configurations.
    """
    config = await game_repo.get_config("home_page")

    if not config:
        return []

    # Filter only enabled shelves
    shelves = config.get("shelves", [])
    return [shelf for shelf in shelves if shelf.get("enabled")]
