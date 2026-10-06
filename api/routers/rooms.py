from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from api import db
from api.config import settings
from api.schemas.room import RoomCreate, JoinRoomRequest, RoomCreateResponse
from api.services.slices import calculate_slice_angles

router = APIRouter(tags=["rooms"])


@router.post("/api/rooms", response_model=RoomCreateResponse)
@router.post("/rooms", response_model=RoomCreateResponse)
async def create_room_endpoint(payload: RoomCreate):
    # 1. Ortak pasta oluştur
    cake_data = {
        "title": payload.title,
        "shape": "round",
        "layers": 1,
        "cake_color": "#FFD6E0",
        "frosting_color": "#FFF1E6",
        "slice_count": payload.max_participants,
        "mode": "collab",
        "is_locked": False
    }
    cake = db.create_cake(cake_data)

    # 2. Odayı oluştur
    room = db.create_room(
        cake_id=cake["id"],
        max_participants=payload.max_participants,
        items_per_participant=payload.items_per_participant
    )

    # 3. Oluşturucuyu ilk katılımcı (dilim 0) olarak kaydet
    creator_participant = db.create_participant(
        room_id=room["id"],
        nickname=payload.creator_nickname,
        slice_index=0,
        is_creator=True
    )

    invite_url = f"{settings.APP_BASE_URL}/join.html?room={room['invite_code']}"

    return {
        "room": room,
        "cake": cake,
        "participant": creator_participant,
        "invite_url": invite_url
    }


@router.get("/api/rooms/{invite_code}")
@router.get("/rooms/{invite_code}")
async def get_room_status(invite_code: str):
    room = db.get_room_by_invite(invite_code)
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı.")

    cake = db.get_cake_by_id(room["cake_id"])
    participants = db.get_participants(room["id"])

    # Hassas token alanlarını yanıttan gizle
    safe_participants = [
        {
            "id": p["id"],
            "nickname": p["nickname"],
            "slice_index": p["slice_index"],
            "is_creator": p["is_creator"]
        }
        for p in participants
    ]

    is_full = len(participants) >= room["max_participants"]

    return {
        "room": {
            "id": room["id"],
            "invite_code": room["invite_code"],
            "max_participants": room["max_participants"],
            "items_per_participant": room["items_per_participant"],
            "created_at": room["created_at"]
        },
        "cake": {
            "id": cake["id"],
            "title": cake["title"],
            "slice_count": cake["slice_count"],
            "is_locked": cake["is_locked"],
            "share_code": cake["share_code"]
        },
        "participants_count": len(participants),
        "is_full": is_full,
        "participants": safe_participants
    }


@router.post("/api/rooms/{invite_code}/join")
@router.post("/rooms/{invite_code}/join")
async def join_room_endpoint(invite_code: str, payload: JoinRoomRequest):
    room = db.get_room_by_invite(invite_code)
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı.")

    cake = db.get_cake_by_id(room["cake_id"])
    if cake.get("is_locked"):
        raise HTTPException(status_code=403, detail="Bu pasta kilitlendiği için odaya yeni katılımcı kabul edilmiyor.")

    participants = db.get_participants(room["id"])
    if len(participants) >= room["max_participants"]:
        raise HTTPException(status_code=409, detail="Oda dolu! Maksimum katılımcı sayısına ulaşıldı.")

    # Sıradaki boş dilim numarasını bul (0 ile max_participants-1 arasında)
    taken_slices = {p["slice_index"] for p in participants}
    assigned_slice = None
    for i in range(room["max_participants"]):
        if i not in taken_slices:
            assigned_slice = i
            break

    if assigned_slice is None:
        raise HTTPException(status_code=409, detail="Boş dilim kalmadı.")

    new_participant = db.create_participant(
        room_id=room["id"],
        nickname=payload.nickname.strip(),
        slice_index=assigned_slice,
        is_creator=False
    )

    return {
        "room": room,
        "cake": cake,
        "participant": new_participant,
        "token": new_participant["token"]
    }


@router.get("/api/rooms/{invite_code}/state")
@router.get("/rooms/{invite_code}/state")
async def get_room_state(
    invite_code: str,
    x_participant_token: Optional[str] = Header(None, alias="X-Participant-Token")
):
    room = db.get_room_by_invite(invite_code)
    if not room:
        raise HTTPException(status_code=404, detail="Oda bulunamadı.")

    cake = db.get_cake_by_id(room["cake_id"])
    items = db.get_items_by_cake_id(room["cake_id"])
    participants = db.get_participants(room["id"])

    # İstekte bulunan katılımcıyı belirle
    my_part = None
    remaining_quota = None
    if x_participant_token:
        for p in participants:
            if p.get("token") == x_participant_token:
                my_part = p
                item_count = db.count_items_by_participant(cake["id"], p["id"])
                remaining_quota = max(0, room["items_per_participant"] - item_count)
                break

    safe_participants = [
        {
            "id": p["id"],
            "nickname": p["nickname"],
            "slice_index": p["slice_index"],
            "is_creator": p["is_creator"]
        }
        for p in participants
    ]

    slices = calculate_slice_angles(cake["slice_count"])

    return {
        "room": room,
        "cake": cake,
        "items": items,
        "participants": safe_participants,
        "my_participant": {
            "id": my_part["id"],
            "nickname": my_part["nickname"],
            "slice_index": my_part["slice_index"],
            "is_creator": my_part["is_creator"]
        } if my_part else None,
        "remaining_quota": remaining_quota,
        "slices": slices
    }
