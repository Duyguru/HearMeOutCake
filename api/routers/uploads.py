import os
import uuid
import io
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from PIL import Image
from api.config import settings
from api.supabase_client import get_supabase_client

router = APIRouter(tags=["uploads"])

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/api/uploads")
@router.post("/uploads")
async def upload_image(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Geçersiz dosya türü. Sadece PNG, JPEG ve WEBP formatları desteklenmektedir."
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Dosya boyutu çok büyük. Maksimum dosya boyutu 5 MB'dir."
        )

    # PIL ile resim doğrulaması
    try:
        image = Image.open(io.BytesIO(content))
        image.verify()
        # verify() sonrası görseli tekrar açıp dönüştürüyoruz
        image = Image.open(io.BytesIO(content))
        # Otomatik EXIF yönlendirme (orientation) varsa düzelt
        format_ext = "png" if image.format == "PNG" else "jpeg" if image.format == "JPEG" else "webp"
    except Exception:
        raise HTTPException(status_code=400, detail="Yüklenen dosya geçerli bir resim formatında değil.")

    # Benzersiz dosya adı oluştur
    file_id = f"{uuid.uuid4().hex}.{format_ext}"

    # 1. Supabase Storage yüklenebiliyorsa yükle
    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
                path=file_id,
                file=content,
                file_options={"content-type": file.content_type}
            )
            public_url = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET).get_public_url(file_id)
            return {"url": public_url, "filename": file_id}
        except Exception as e:
            # Supabase yükleme başarısız olursa yerel depolamaya düş
            pass

    # 2. Yerel dosya sistemine kaydet
    uploads_dir = Path(__file__).resolve().parent.parent.parent / settings.LOCAL_UPLOADS_DIR
    uploads_dir.mkdir(parents=True, exist_ok=True)
    target_path = uploads_dir / file_id

    # Boyutlandırma / optimizasyon (Maks 1200x1200px)
    max_dim = 1200
    if image.width > max_dim or image.height > max_dim:
        image.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    
    image.save(target_path)
    local_url = f"/uploads/{file_id}"

    return {"url": local_url, "filename": file_id}
