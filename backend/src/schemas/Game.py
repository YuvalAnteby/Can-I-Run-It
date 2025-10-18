from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, Field, field_validator


class Game(BaseModel):
    """
    Schema for a game with all relevant attributes
    """
    game_id: str = Field(..., min_length=1, description="Unique game identifier")
    name: str = Field(..., min_length=1, description="Name of the game")
    publisher: str = Field(..., min_length=1)
    developer: str = Field(..., min_length=1)
    release_date: int = Field(..., ge=1970, le=2100, description="Release year of the game")
    genres: List[str] = Field(..., min_length=1, description="List of game genres as strings")
    desc: str = Field(..., min_length=1, description="Description of the game, usually from a game store")
    trailer_url: str  # Could use HttpUrl for stricter validation
    portrait_url: Optional[str] = None
    buy_links: List[str] = Field(default_factory=list)
    landscape_s: Optional[str] = Field(default=None, description="Small landscape image URL")
    landscape_m: Optional[str] = Field(default=None, description="Medium landscape image URL")
    landscape_l: Optional[str] = Field(default=None, description="Large landscape image URL")
    landscape_xl: Optional[str] = Field(default=None, description="XL landscape image URL")
    available_resolutions: List[str] = Field(default_factory=list, description="List of available resolutions (e.g., 1080p, 4K)")
    supported_settings: List[str] = Field(default_factory=list, description="List of supported settings from the lowest to highest (e.g., Low, Medium, High, Ultra)")
    is_ssd_recommended: bool = Field(default=False, description="True if SSD is recommended for the game by devs or community")
    upscale_support: List[str] = Field(default_factory=list, description="List of upscaling technologies supported (e.g., DLSS, FSR)")
    api_support: List[str] = Field(default_factory=list, description="List of graphics APIs supported (e.g., DirectX 11, DirectX 12, Vulkan)")
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

class GameCreateDTO(Game):
    game_id: str = Field(..., min_length=1, description="Unique game identifier")
    id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GameUpdateDTO(BaseModel):
    """Schema for updating a game (all fields optional)"""
    name: Optional[str] = Field(None, min_length=1)
    publisher: Optional[str] = Field(None, min_length=1)
    developer: Optional[str] = Field(None, min_length=1)
    release_date: Optional[int] = Field(None, ge=1970, le=2100)
    genres: Optional[List[str]] = None
    desc: Optional[str] = Field(None, min_length=1)
    trailer_url: Optional[str] = None
    portrait_url: Optional[str] = None
    buy_links: Optional[List[str]] = None
    landscape_s: Optional[str] = None
    landscape_m: Optional[str] = None
    landscape_l: Optional[str] = None
    landscape_xl: Optional[str] = None
    available_resolutions: Optional[List[str]] = None
    supported_settings: Optional[List[str]] = None
    is_ssd_recommended: Optional[bool] = None
    upscale_support: Optional[List[str]] = None
    api_support: Optional[List[str]] = None