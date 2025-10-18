from typing import Literal, Optional

from bson import ObjectId
from pydantic import BaseModel, Field, field_validator


class Gpu(BaseModel):
    hardware_id: str = Field(
        ...,
        min_length=1,
        description="Unique hardware identifier. made from the brand and model.",
    )
    brand: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    fullname: str = Field(..., min_length=1)
    type: str = Field(..., pattern="^(?i)gpu$")  # Case-insensitive "gpu"
    # Convert ObjectId to string
    id: str
    model_config = {"json_encoders": {ObjectId: str}}

    @field_validator("type")
    def validate_type(cls, v: str) -> str:
        if v.lower() != "gpu":
            raise ValueError("Type must be GPU")
        return v.lower()

    @field_validator("brand")
    def validate_brand(cls, v: str) -> str:
        return v.strip()


class GpuCreateDTO(Gpu):
    hardware_id: Optional[str] = Field(default=None, min_length=1)
    id: Optional[str] = Field(
        default=None, min_length=24, max_length=24
    )  # client may omit; server will generate if None
    type: Literal["gpu"] = Field(default="gpu")  # default to 'gpu' if not provided
