from bson import ObjectId
from pydantic import BaseModel
from typing import Optional

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