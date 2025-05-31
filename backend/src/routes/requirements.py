from typing import List, Optional, Dict, Any
from backend.src.app.database import mongo_db

from fastapi import APIRouter, HTTPException

from backend.src.controllers.requirements import fetch_game_doc, find_matching_setup
from backend.src.schemas.Performance import GameSetupRequest, build_setup_response

router = APIRouter()
# Use the games collection
collection = mongo_db.game_requirements


# TODO add the rest of the variables from setup element of the DB
@router.get("/game-requirements/", response_model=Dict[str, Any])
async def get_requirement(
        game_id: str,
        cpu_id: str,
        gpu_id: str,
        ram: int,
        resolution: str,
        setting_name: str,
        fps: Optional[int] = None):
    """
    Gets the setup's performance result from the DB.

    :param game_id: game's id made by MongoDB as a string.
    :param cpu_id: CPU's id made by MongoDB as a string.
    :param gpu_id: GPU's id made by MongoDB as a string.
    :param ram: RAM amount in GB (int).
    :param resolution: full resolution string. E.G: 1920x1080
    :param setting_name: setting name as specified per game. E.G Ultra
    :param fps: minimum FPS the setup should reach (optional & int)
    :return: a dictionary of the setup's performance in the game with provided filtering.
    Consists of basic information of combination provided & FPS & notes & source
    """
    game_doc = await fetch_game_doc(game_id, resolution, setting_name)
    matching_setup = find_matching_setup(
        setups=game_doc.get("setups", []),
        cpu_id=cpu_id,
        gpu_id=gpu_id,
        ram=ram,
        fps=fps
    )
    return build_setup_response(game_doc, matching_setup)


@router.get("/game-requirements/all", response_model=List[Dict[str, Any]])
async def get_all_game_requirements():
    try:
        cursor = collection.find()
        documents = await cursor.to_list(length=None)
        result = []
        # for each game, resolution and setting
        for document in documents:
            # get all the setups
            for setup in document["setups"]:
                response = build_setup_response(game_doc=document, setup=setup)
                result.append(response)
        return result  # Returns all documents as JSON
    except Exception as e:
        print(f"Error fetching documents: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching documents: {str(e)}")
