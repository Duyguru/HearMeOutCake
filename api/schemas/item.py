from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal


class ItemBase(BaseModel):
    type: Literal["topper", "text", "image", "sticker"]
    content: str
    x: float = Field(default=0.5, ge=0.0, le=1.0)
    y: float = Field(default=0.5, ge=0.0, le=1.0)
    scale: float = Field(default=1.0, ge=0.2, le=4.0)
    rotation: float = Field(default=0.0, ge=-360.0, le=360.0)
    z_index: int = Field(default=0)
    style: Dict[str, Any] = Field(default_factory=dict)


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    scale: Optional[float] = Field(default=None, ge=0.2, le=4.0)
    rotation: Optional[float] = Field(default=None, ge=-360.0, le=360.0)
    z_index: Optional[int] = None
    style: Optional[Dict[str, Any]] = None


class ItemResponse(ItemBase):
    id: str
    cake_id: str
    participant_id: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True
