from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from api import db
from api.schemas.item import ItemCreate, ItemUpdate, ItemResponse
from api.services.quota import check_can_add_item

router = APIRouter(tags=["items"])


@router.post("/api/cakes/{cake_id}/items", response_model=ItemResponse)
async def add_item_to_cake(
    cake_id: str,
    payload: ItemCreate,
    x_participant_token: Optional[str] = Header(None, alias="X-Participant-Token"),
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token")
):
    token = x_participant_token or x_creator_token

    # Yetki ve kota kontrolü
    check_res = check_can_add_item(cake_id, token)
    participant = check_res.get("participant")

    item_dict = payload.model_dump()
    item_dict["cake_id"] = cake_id
    item_dict["participant_id"] = participant["id"] if participant else None

    # Güvenlik: Metin içeriğini temizle (strip)
    if item_dict.get("type") in ("text", "topper"):
        item_dict["content"] = item_dict["content"].strip()
        if item_dict.get("style") and "caption" in item_dict["style"]:
            item_dict["style"]["caption"] = str(item_dict["style"]["caption"]).strip()[:60]

    created = db.create_item(item_dict)
    return created


@router.patch("/api/items/{item_id}", response_model=ItemResponse)
async def update_item_endpoint(
    item_id: str,
    payload: ItemUpdate,
    x_participant_token: Optional[str] = Header(None, alias="X-Participant-Token"),
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token")
):
    token = x_participant_token or x_creator_token
    item = db.get_item_by_id(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Öğe bulunamadı.")

    cake = db.get_cake_by_id(item["cake_id"])
    if not cake:
        raise HTTPException(status_code=404, detail="Pasta bulunamadı.")

    if cake.get("is_locked"):
        raise HTTPException(status_code=403, detail="Kilitli pastada düzenleme yapılamaz.")

    # İzin kontrolü: Ya pastayı oluşturan kişi (creator) ya da öğeyi ekleyen katılımcı olmalı
    is_authorized = False
    if cake.get("creator_token") == token:
        is_authorized = True
    elif token and item.get("participant_id"):
        participant = db.get_participant_by_token(token)
        if participant and (participant.get("is_creator") or participant.get("id") == item["participant_id"]):
            is_authorized = True
    elif cake.get("mode") == "solo":
        # Solo modda creator_token kontrolü
        if cake.get("creator_token") == token:
            is_authorized = True

    if not is_authorized:
        raise HTTPException(status_code=403, detail="Yalnızca kendi eklediğiniz öğeleri düzenleyebilirsiniz.")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated_item = db.update_item(item_id, updates)
    return updated_item


@router.delete("/api/items/{item_id}")
async def delete_item_endpoint(
    item_id: str,
    x_participant_token: Optional[str] = Header(None, alias="X-Participant-Token"),
    x_creator_token: Optional[str] = Header(None, alias="X-Creator-Token")
):
    token = x_participant_token or x_creator_token
    item = db.get_item_by_id(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Öğe bulunamadı.")

    cake = db.get_cake_by_id(item["cake_id"])
    if not cake:
        raise HTTPException(status_code=404, detail="Pasta bulunamadı.")

    if cake.get("is_locked"):
        raise HTTPException(status_code=403, detail="Kilitli pastada öğe silinemez.")

    # İzin kontrolü
    is_authorized = False
    if cake.get("creator_token") == token:
        is_authorized = True
    elif token and item.get("participant_id"):
        participant = db.get_participant_by_token(token)
        if participant and (participant.get("is_creator") or participant.get("id") == item["participant_id"]):
            is_authorized = True
    elif cake.get("mode") == "solo":
        if cake.get("creator_token") == token:
            is_authorized = True

    if not is_authorized:
        raise HTTPException(status_code=403, detail="Yalnızca kendi eklediğiniz öğeleri silebilirsiniz.")

    db.delete_item(item_id)
    return {"message": "Öğe başarıyla silindi.", "id": item_id}
