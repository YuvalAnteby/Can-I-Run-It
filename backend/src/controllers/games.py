from typing import Optional, List, Dict, Any

from fastapi.params import Depends

from backend.src.repository.games import RepositoryGame
from backend.src.schemas.Game import Game
from backend.src.utils.regex_wrapper import games_genre_regex


async def fetch_all_games(game_repo: RepositoryGame = Depends()) -> List[Game]:
    """
    Controller, retrieve all games from the database.

    :return: List of all games.
    """
    games = await game_repo.get_games()
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_games_by_category(
        genre: str,
        limit: Optional[int] = None,
        game_repo: RepositoryGame = Depends()
) -> List[Game]:
    """
    Controller, retrieve all games with given genre from the DB.

    :param genre: Genre to filter by (case-insensitive)
    :param limit: Maximum number of games to return
    :return: List of games matching the genre.
    """
    additional_query = {"genres": games_genre_regex(genre)}
    games = await game_repo.get_games(limit=limit, additional_query=additional_query)
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_newly_added_games(limit: int = 10, game_repo: RepositoryGame = Depends()) -> List[Game]:
    """
    Returns the last `limit` games added to the DB, sorted by creation time.

    :param limit: Number of games to return (default: 10)
    :return: List of newly added games.
    """
    games = await game_repo.get_games(
        limit=limit,
        sort_by="created_at",
        sort_order=-1  # Descending (newest first)
    )
    return [Game(**game, id=str(game["_id"])) for game in games]


async def fetch_home_shelves(game_repo: RepositoryGame = Depends()) -> List[Dict[str, Any]]:
    """
    Gets the enabled home page shelves from the DB.

    :return: List of enabled shelf configurations.
    """
    config = await game_repo.get_config("home_page")

    if not config:
        return []

    # Filter only enabled shelves
    shelves = config.get("shelves", [])
    return [shelf for shelf in shelves if shelf.get("enabled")]
