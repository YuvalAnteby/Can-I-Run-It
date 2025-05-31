"""
All functions for handling the games' performances in the DB will be here
For example: fetching a certain setup performance data for a game
"""
from fastapi import HTTPException
from typing import List, Optional, Dict, Any

from backend.src.app.database import mongo_db
from backend.src.schemas.Performance import build_setup_response

collection = mongo_db.game_requirements


async def fetch_game_doc(game_id: str, resolution: str, setting_name: str):
    """
    Controller: fetch a game document in performance data collection that has the same game id, resolution and setting.
    :raises HTTPException:
        - 404 if not found
    """
    try:
        query = {
            "game_id": game_id,
            "resolution": resolution,
            "setting_name": setting_name,
        }
        game_doc = await collection.find_one(query)
        if game_doc is None:
            raise HTTPException(status_code=404, detail="Combination not found")
        return game_doc
    except HTTPException:
        raise
    except Exception as e:
        print(f"[fetch_game_doc] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Database requirements error")

# TODO Added with the correct code what part isn't strong enough for running in the desired way
def find_matching_setup(
        setups: List[Dict[str, Any]],
        cpu_id: str,
        gpu_id: str,
        ram: int,
        fps: Optional[int] = None
):
    """
     Given a list of setup-documents, find one that matches cpu_id, gpu_id, ram, and (optionally) fps.
     :raises HTTPException:
        - 404 if not found matching setups
        - 422 if none of the found ones meet the desired FPS
     """
    # Got no setups
    if not setups:
        raise HTTPException(status_code=404, detail="No setups exist for that game")
    for setup in setups:
        # Check the CPU, GPU first, continue if they don't match
        if setup.get("cpu_id") != cpu_id or setup.get("gpu_id") != gpu_id:
            continue
        # Check the RAM, we should have more than the user for it to be irrelevant
        stored_ram = setup.get("ram")
        if not (isinstance(stored_ram, int) and stored_ram <= ram):
            continue
        # If we did get FPS, make sure the stored value is more or equal to the desired amount for a positive
        if fps is not None:
            stored_fps = setup.get("fps")
            # User can't run at desired FPS
            if isinstance(stored_fps, int) is not None and stored_fps < fps:
                raise HTTPException(status_code=422, detail="Setup found but doesn't meet desired FPS")
        # If we reached here that means we found a positive performance data for user
        return setup
    # If we reached here we looped through all the setups and didn't find a matching setup
    raise HTTPException(status_code=404, detail="No matching setup found for the provided filters")

