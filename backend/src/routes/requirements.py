import os
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

# Connect to MongoDB (this assumes MongoDB is running on localhost)
client = AsyncIOMotorClient(os.environ["MONGODB_URI"])
db = client["game_db"]  # Use your desired database name
router = APIRouter()
# Use the games collection
collection = db.game_requirements


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
    # Construct the filter for setups
    setup_filter = {
        "cpu_id": cpu_id,
        "gpu_id": gpu_id,
        "ram": {"$lte": ram}  # Allow cases where stored RAM is less than or equal to input RAM
    }
    if fps is not None:
        setup_filter["fps"] = fps  # Add FPS condition only if provided
    try:
        # Query to find a matching document
        game_doc = await collection.find_one({
            "game_id": game_id,
            "resolution": resolution,
            "setting_name": setting_name,
            # "setups": {"$elemMatch": setup_filter}  # Filter within setups
            # "setups": setup_filter  # Filter within setups
        })
        if game_doc is None:
            raise HTTPException(status_code=404, detail="Combination not found")
        # print("GameDoc: ", game_doc)
        # Extract matching setups
        for setup in game_doc["setups"]:
            if (
                    setup["cpu_id"] == cpu_id and
                    setup["gpu_id"] == gpu_id and
                    setup["ram"] <= ram and
                    (fps is None or (setup["fps"] is not None and setup["fps"] > fps))
            ):
                return (GameSetupRequest(game_id=game_id,
                                         cpu_id=setup["cpu_id"],
                                         gpu_id=setup["gpu_id"],
                                         ram=setup["ram"],
                                         resolution=game_doc["resolution"],
                                         setting_name=game_doc["setting_name"],
                                         fps=setup.get("fps"),
                                         taken_by=setup.get("taken_by"),
                                         notes=setup.get("notes"),
                                         verified=setup.get("verified"),
                                         id=str(game_doc["_id"])
                                         ).model_dump())
            else:
                raise HTTPException(status_code=422, detail="Setup found but doesn't meet desired FPS")
        raise HTTPException(status_code=404, detail="No matching setup found for the provided filters")
    except HTTPException as http_exception:
        raise http_exception
    except Exception as e:
        print(f"Error fetching documents: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching documents: {str(e)}")


@router.get("/game-requirements/all", response_model=List[Dict[str, Any]])
async def get_all_game_requirements():
    """
    TODO remove on release - FOR DEBUGGING ONLY
    Gets all requirements from the DB.

    :return: list of dictionaries of all games and setups performances as recorded in the DB.
    Consists of basic information of combination provided & FPS & notes & source
    """
    try:
        cursor = collection.find()
        documents = await cursor.to_list(length=None)
        result = []
        for document in documents:
            game_id = str(document["game_id"])  # Convert _id to string
            for setup in document["setups"]:
                result.append(GameSetupRequest(game_id=game_id,
                                               cpu_id=setup["cpu_id"],
                                               gpu_id=setup["gpu_id"],
                                               ram=setup["ram"],
                                               resolution=document["resolution"],
                                               setting_name=document["setting_name"],
                                               fps=setup.get("fps"),
                                               id=str(document["_id"])
                                               ).model_dump())
        return result  # Returns all documents as JSON
    except Exception as e:
        print(f"Error fetching documents: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching documents: {str(e)}")

# return [Cpu(**cpu, id=str(cpu["_id"])) for cpu in cpus]
