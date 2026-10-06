from fastapi import HTTPException
from api import db


def check_can_add_item(cake_id: str, participant_token: str = None) -> db.Dict[str, db.Any]:
    """
    Pastaya yeni öğe ekleme yetkisi ve kotasını kontrol eder.
    Döner: {"cake": cake, "participant": participant, "remaining_quota": int or None}
    """
    cake = db.get_cake_by_id(cake_id)
    if not cake:
        raise HTTPException(status_code=404, detail="Pasta bulunamadı.")

    if cake.get("is_locked"):
        raise HTTPException(status_code=403, detail="Bu pasta kilitlenmiştir, yeni öğe eklenemez.")

    # Solo mod
    if cake.get("mode") == "solo":
        return {"cake": cake, "participant": None, "remaining_quota": None}

    # Ortak (collab) mod
    room = db.get_room_by_cake_id(cake_id)
    if not room:
        raise HTTPException(status_code=404, detail="Pastaya ait oda bulunamadı.")

    if not participant_token:
        raise HTTPException(status_code=401, detail="Ortak pastaya öğe eklemek için katılımcı jetonu gereklidir.")

    participant = db.get_participant_by_token(participant_token)
    if not participant or participant.get("room_id") != room["id"]:
        raise HTTPException(status_code=403, detail="Geçersiz katılımcı jetonu.")

    # Kota kontrolü
    item_count = db.count_items_by_participant(cake_id, participant["id"])
    max_quota = room["items_per_participant"]

    if item_count >= max_quota:
        raise HTTPException(
            status_code=403,
            detail=f"Kişi başı ekleme hakkınız doldu! (Maksimum {max_quota} öğe eklenebilir)"
        )

    remaining = max_quota - item_count - 1
    return {
        "cake": cake,
        "participant": participant,
        "remaining_quota": remaining
    }
