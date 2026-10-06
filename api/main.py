import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from api.config import settings

# Router importları
from api.routers.cakes import router as cakes_router
from api.routers.rooms import router as rooms_router
from api.routers.items import router as items_router
from api.routers.uploads import router as uploads_router

app = FastAPI(
    title="Hear Me Out Cake API",
    description="Sanal pasta oluşturma, dilimleme ve ortak süsleme platformu",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def vercel_routing_middleware(request, call_next):
    # Vercel serverless rewrite durumlarında path normalizasyonu
    path = request.scope.get("path", "")
    matched_path = request.headers.get("x-matched-path") or request.headers.get("x-forwarded-uri")
    
    if matched_path and matched_path.startswith("/api/"):
        request.scope["path"] = matched_path
    elif path.startswith("/api/index.py"):
        suffix = path[len("/api/index.py"):]
        request.scope["path"] = f"/api{suffix}" if suffix else "/api"
    elif path.startswith("/api/main.py"):
        suffix = path[len("/api/main.py"):]
        request.scope["path"] = f"/api{suffix}" if suffix else "/api"

    response = await call_next(request)
    return response


# Health check
@app.get("/api/health")
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "Hear Me Out Cake API",
        "database_mode": "supabase" if settings.is_supabase_configured else "local_sqlite",
        "uploads_mode": "supabase_storage" if settings.is_supabase_configured else "local_storage"
    }

# API Router kayıtları
app.include_router(cakes_router)
app.include_router(rooms_router)
app.include_router(items_router)
app.include_router(uploads_router)

# Statik dosya sunumu (Yerel ortam için)
if not os.environ.get("VERCEL"):
    root_path = Path(__file__).resolve().parent.parent
    public_path = root_path / "public" if (root_path / "public").exists() else root_path

    if (public_path / "index.html").exists():
        @app.get("/", include_in_schema=False)
        async def serve_index():
            return FileResponse(public_path / "index.html")

        @app.get("/editor", include_in_schema=False)
        @app.get("/editor.html", include_in_schema=False)
        async def serve_editor():
            return FileResponse(public_path / "editor.html")

        @app.get("/join", include_in_schema=False)
        @app.get("/join.html", include_in_schema=False)
        async def serve_join():
            return FileResponse(public_path / "join.html")

        @app.get("/gallery", include_in_schema=False)
        @app.get("/gallery.html", include_in_schema=False)
        async def serve_gallery():
            return FileResponse(public_path / "gallery.html")

        uploads_dir = public_path / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)
        app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
        app.mount("/", StaticFiles(directory=str(public_path), html=True), name="public_root")

