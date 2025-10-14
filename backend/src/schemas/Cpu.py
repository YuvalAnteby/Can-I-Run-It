from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, field_validator, Field

class Cpu(BaseModel):
    brand: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    fullname: str = Field(..., min_length=1)
    type: str = Field(..., pattern="^(?i)cpu$")  # Case-insensitive "cpu"
    # Convert ObjectId to string
    id: str
    model_config = {
        "json_encoders": {ObjectId: str}
    }

    @field_validator('type')
    def validate_type(cls, v: str) -> str:
        if v.lower() != 'cpu':
            raise ValueError('Type must be CPU')
        return v.lower()

    @field_validator('brand')
    def validate_brand(cls, v: str) -> str:
        return v.strip()


class CpuCreateDTO(Cpu):
    id: Optional[str] = Field(default=None, min_length=24, max_length=24)  # client may omit; server will generate if None
    type: Optional[str] = 'cpu'  # default to 'cpu' if not provided