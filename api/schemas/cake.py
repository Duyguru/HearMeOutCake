from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class CakeBase(BaseModel):
    title: str = Field(default="İsimsiz Pasta", max_length=60)
    shape: Literal["round", "square", "heart"] = "round"
    layers: int = Field(default=1, ge=1, le=3)
    cake_color: str = Field(default="#FFD6E0", max_length=20)
    frosting_color: str = Field(default="#FFF1E6", max_length=20)
    slice_count: int = Field(default=8, ge=1, le=24)
    mode: Literal["solo", "collab"] = "solo"


class CakeCreate(CakeBase):
    pass


class CakeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=60)
    cake_color: Optional[str] = Field(default=None, max_length=20)
    frosting_color: Optional[str] = Field(default=None, max_length=20)
    is_locked: Optional[bool] = None


class CakeResponse(CakeBase):
    id: str
    is_locked: bool = False
    share_code: str
    creator_token: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True
