from typing import Optional

from fastapi import APIRouter

from backend.src.controllers.games import fetch_all_games, fetch_games_by_category, fetch_newly_added_games, \
    fetch_home_shelves

router = APIRouter(prefix="/games", tags=["Games"])


@router.get("")
async def get_all_games():
    return await fetch_all_games()


@router.get("/category")
async def get_games_by_category(genre, limit: Optional[int] = None):
    return await fetch_games_by_category(genre, limit)


@router.get("/newly_added")
async def get_newly_added_games(limit: Optional[int] = 10):
    return await fetch_newly_added_games(limit)


@router.get("/home-rows")
async def get_home_shelves():
    return await fetch_home_shelves()
