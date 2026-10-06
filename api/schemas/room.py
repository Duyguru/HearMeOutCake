from pydantic import BaseModel, Field
from typing import Optional, List
from api.schemas.cake import CakeResponse


class RoomCreate(BaseModel):
    title: str = Field(default="Ortak Hear Me Out Pasta", max_length=60)
    creator_nickname: str = Field(..., min_length=1, max_length=24)
    max_participants: int = Field(default=4, ge=2, le=24)
    items_per_participant: int = Field(default=3, ge=1, le=10)


class JoinRoomRequest(BaseModel):
    nickname: str = Field(..., min_length=1, max_length=24)


class ParticipantResponse(BaseModel):
    id: str
    room_id: str
    nickname: str
    slice_index: int
    is_creator: bool = False
    token: Optional[str] = None
    joined_at: Optional[str] = None

    class Config:
        from_attributes = True


class RoomResponse(BaseModel):
    id: str
    cake_id: str
    invite_code: str
    max_participants: int
    items_per_participant: int
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class RoomCreateResponse(BaseModel):
    room: RoomResponse
    cake: CakeResponse
    participant: ParticipantResponse
    invite_url: str
