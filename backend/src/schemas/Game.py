from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, Field, field_validator


class Game(BaseModel):
    """
    Schema for a game with all relevant attributes
    """
    game_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    publisher: str = Field(..., min_length=1)
    developer: str = Field(..., min_length=1)
    release_date: int = Field(..., ge=1970, le=2100)
    genres: List[str] = Field(..., min_length=1)
    desc: str = Field(..., min_length=1)
    trailer_url: str  # Could use HttpUrl for stricter validation
    portrait_url: Optional[str] = None
    buy_links: List[str] = Field(default_factory=list)
    landscape_s: Optional[str] = None
    landscape_m: Optional[str] = None
    landscape_l: Optional[str] = None
    landscape_xl: Optional[str] = None
    available_resolutions: List[str] = Field(default_factory=list)
    supported_settings: List[str] = Field(default_factory=list)
    is_ssd_recommended: bool = False
    upscale_support: List[str] = Field(default_factory=list)
    api_support: List[str] = Field(default_factory=list)
    created_at: datetime
    id: str

    @field_validator('genres', 'available_resolutions', 'supported_settings', 'upscale_support', 'api_support')
    def validate_non_empty_strings(cls, v):
        """Ensure list items are not empty strings"""
        if v and any(not item.strip() for item in v):
            raise ValueError('List cannot contain empty strings')
        return v

    @field_validator('name', 'publisher', 'developer', 'desc')
    def validate_stripped(cls, v):
        """Strip whitespace from string fields"""
        return v.strip() if v else v

    class Config:
        json_encoders = {
            ObjectId: str
        }