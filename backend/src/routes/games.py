from typing import Optional

from fastapi import APIRouter, Query

from backend.src.controllers.games import (
    fetch_all_games,
    fetch_games_by_category,
    fetch_newly_added_games,
    fetch_home_shelves
)
from backend.src.schemas.Game import Game

router = APIRouter(prefix="/games", tags=["Games"])


@router.get("", response_model=list[Game])
async def get_games(
        genre: Optional[str] = Query(None, description="Filter by game genre"),
        limit: Optional[int] = Query(None, ge=1, le=1000, description="Maximum number of results")
) -> list[Game]:
    """
    Retrieve games with optional filters.

    - **No params**: Returns all games
    - **genre**: Filter by genre (case-insensitive)
    - **limit**: Limit number of results
    """
    if genre:
        return await fetch_games_by_category(genre, limit)
    else:
        return await fetch_all_games()


@router.get("/newly-added", response_model=list[Game])
async def get_newly_added_games(
        limit: int = Query(10, ge=1, le=100, description="Number of games to return")
) -> list[Game]:
    """
    Get the most recently added games, sorted by creation date.
    """
    return await fetch_newly_added_games(limit)


@router.get("/home-rows")
async def get_home_shelves():
    """
    Get the enabled home page shelf configurations.
    """
    return await fetch_home_shelves()