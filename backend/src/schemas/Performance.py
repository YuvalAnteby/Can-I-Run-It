from bson import ObjectId
from fastapi import HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

# Schema
class GameSetupRequest(BaseModel):
    game_id: str
    cpu_id: str
    gpu_id: str
    ram: int
    resolution: str
    setting_name: str
    fps: Optional[int] = None
    taken_by: str
    notes: str
    verified: bool
    # Convert ObjectId to string
    id: str

    class Config:
        json_encoders = {
            ObjectId: str  # This will convert ObjectId to a string automatically
        }


def build_setup_response(game_doc: Dict[str, Any], setup: Dict[str, Any]):
    """
    Combines the relevant data from game doc and the setup for the Pydantic model according to our schema.
    :param game_doc: The game document
    :param setup: the user setup found in the game document's setup array
    :return: a pydantic model according to the schema
    """
    try:
        response_model = GameSetupRequest(
            game_id=game_doc["game_id"],
            cpu_id=setup["cpu_id"],
            gpu_id=setup["gpu_id"],
            ram=setup["ram"],
            resolution=game_doc["resolution"],
            setting_name=game_doc["setting_name"],
            fps=setup.get("fps"),
            taken_by=setup.get("taken_by") or "Unknown",
            notes=setup.get("notes") or "",
            verified=setup.get("verified", False),
            id=str(game_doc["_id"])
        )
        return response_model.model_dump()
    except Exception as e:
        print(f"[build_setup_response] Error constructing response: {e}")
        raise HTTPException(status_code=500, detail="Invalid data structure for response")