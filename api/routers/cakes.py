from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional, List
from api import db
from api.schemas.cake import CakeCreate, CakeUpdate, CakeResponse
from api.services.slices import calculate_slice_angles

router = APIRouter(prefix="/api/cakes", tags=["cakes"])


@router.post("", response_model=dict)
async def create_solo_cake(payload: CakeCreate):
    data = payload.model_dump()
    data["mode"] = "solo"
    cake = db.create_cake(data)
    return {
        "cake": cake,
        "creator_token": cake.get("creator_token")
    }


@router.get("/gallery", response_model=List[CakeResponse])
async def list_gallery_cakes(tokens: str = Query(default="")):
    token_list = [t.strip() for t in tokens.split(",") if t.strip()]
    if not token_list:
        return []
    cakes = db.get_cakes_by_tokens(token_list)
    return cakes


@router.get("/id/{cake_id}")
async def get_cake_by_id_endpoint(cake_id: str):
    cake = db.get_cake_by_id(cake_id)
    if not cake:
        raise HTTPException(status_code=404, detail="Pasta bulunamadı.")
    items = db.get_items_by_cake_id(cake_id)
    slices = calculate_slice_angles(cake["slice_count"])
    return {
        "cake": cake,
        "items": items,
        "slices": slices
    }


@router.get("/{share_code}")
async def get_cake_by_share_code_endpoint(share_code: str):
    cake = db.get_cake_by_share_code(share_code)
    if not cake:
        # Fallback to id check if user passed id
        cake = db.get_cake_by_id(share_code)
    if not cake:
        raise HTTPException(status_code=404, detail="Pasta bulunamadı.")

    items = db.get_items_by_cake_id(cake["id"])
    slices = calculate_slice_angles(cake["slice_count"])
    return {
        "cake": cake,
        "items": items,
        "slices": slices
    }


@router.patch("/{cake_id}")
async def update_cake_settings(
    cake_id: str,
    payload: CakeUpdate,
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token"),
    x_participant_token: Optional[str] = Header(None, alias="X-Participant-Token")
):
    token = x_creator_token or x_participant_token
    cake = db.get_cake_by_id(cake_id)
    if not cake:
        raise HTTPException(status_code=404, detail="Pasta bulunamadı.")

    # Yetki kontrolü: creator_token eşleşmeli
    if cake.get("creator_token") != token:
        # Eğer collab modundaysa ve katılımcı creator ise izin ver
        participant = db.get_participant_by_token(token) if token else None
        if not (participant and participant.get("is_creator")):
            raise HTTPException(status_code=403, detail="Bu pastayı düzenleme yetkiniz yok.")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        return cake

    updated_cake = db.update_cake(cake_id, updates)
    return updated_cake


@router.post("/{cake_id}/save")
async def save_and_lock_cake(
    cake_id: str,
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token"),
    x_participant_token: Optional[str] = Header(None, alias="X-Participant-Token")
):
    token = x_creator_token or x_participant_token
    cake = db.get_cake_by_id(cake_id)
    if not cake:
        raise HTTPException(status_code=404, detail="Pasta bulunamadı.")

    # Creator kontrolü
    is_authorized = cake.get("creator_token") == token
    if not is_authorized and token:
        participant = db.get_participant_by_token(token)
        if participant and participant.get("is_creator"):
            is_authorized = True

    if not is_authorized:
        raise HTTPException(status_code=403, detail="Yalnızca pastayı oluşturan kişi kaydedip kilitleyebilir.")

    updated_cake = db.update_cake(cake_id, {"is_locked": True})
    return {
        "message": "Pasta başarıyla kilitlendi ve kaydedildi.",
        "cake": updated_cake
    }


@router.delete("/{cake_id}")
async def delete_cake_endpoint(
    cake_id: str,
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token"),
    x_participant_token: Optional[str] = Header(None, alias="X-Participant-Token")
):
    token = x_creator_token or x_participant_token
    cake = db.get_cake_by_id(cake_id)
    if not cake:
        raise HTTPException(status_code=404, detail="Pasta bulunamadı.")

    # Creator kontrolü
    is_authorized = cake.get("creator_token") == token
    if not is_authorized and token:
        participant = db.get_participant_by_token(token)
        if participant and participant.get("is_creator"):
            is_authorized = True

    if not is_authorized:
        raise HTTPException(status_code=403, detail="Yalnızca pastayı oluşturan kişi pastayı silebilir.")

    db.delete_cake(cake_id)
    return {"message": "Pasta başarıyla silindi."}

