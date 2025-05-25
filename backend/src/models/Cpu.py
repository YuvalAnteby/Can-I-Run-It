from pydantic import BaseModel
from bson import ObjectId

class Cpu(BaseModel):
    brand: str
    model: str
    fullname: str
    type: str
    # Convert ObjectId to string
    id: str

    class Config:
        json_encoders = {
            ObjectId: str  # This will convert ObjectId to a string automatically
        }
