import io
import os
import re
import threading
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

import crud
from database import Base, engine, get_db
from schemas import MemoryOut, Stats

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("DATA_DIR", BASE_DIR)) / "uploads"
FRONTEND_DIR = BASE_DIR.parent / "frontend"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 5 * 1024 * 1024
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
PHOTO_SLOTS = threading.BoundedSemaphore(2)  # at most 2 photos are processed at once (saves RAM)
RELATIONSHIPS = {"Friend", "Family", "Classmate", "Colleague", "Teacher", "Neighbor", "Other"}
Image.MAX_IMAGE_PIXELS = 60_000_000  # guards against decompression bombs

# ---- Customize the memorial here (or via environment variables) ----
CONFIG = {
    "name": os.getenv("MEMORIAL_NAME", "Amarnath"),
    "birth_date": os.getenv("MEMORIAL_BIRTH", "01 January 1990"),
    "death_date": os.getenv("MEMORIAL_DEATH", "29 September 2026"),
    "portrait": os.getenv("MEMORIAL_PORTRAIT", "/assets/amarnath.jpeg"),
    "hero_quote": "Forever remembered.\nForever loved.\nForever missed.",
    "lives_on": os.getenv("MEMORIAL_LIVES_ON",
                          "He lives on through the memories shared by those whose lives he touched."),
    "thanks": os.getenv("MEMORIAL_THANKS", "Thank you for helping keep his memory alive."),
}

Base.metadata.create_all(bind=engine)
app = FastAPI(title="Memorial API")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; "
        "style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
        "object-src 'none'; frame-ancestors 'none'")
    return resp


def clean(text: Optional[str]) -> str:
    """Strip control characters and trim. HTML is never rendered: the client uses textContent."""
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", (text or "")).strip()


def save_photo(upload: UploadFile) -> str:
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(422, "Photo must be a JPG, JPEG, PNG or WEBP file.")
    raw = upload.file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(422, "Photo must be 5MB or smaller.")
    with PHOTO_SLOTS:
        try:
            img = Image.open(io.BytesIO(raw))
            img.verify()
            img = Image.open(io.BytesIO(raw))
            img = ImageOps.exif_transpose(img)
            img.thumbnail((1600, 1600))
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError):
            raise HTTPException(422, "That file could not be read as an image.")
        name = f"{uuid.uuid4().hex}.webp"  # re-encoded: strips metadata and compresses
        img.save(UPLOAD_DIR / name, "WEBP", quality=82, method=4)
    return f"/uploads/{name}"


@app.get("/api/config")
def get_config():
    return CONFIG


@app.post("/api/memories", response_model=MemoryOut, status_code=201)
def create_memory(
    name: str = Form(...),
    memory: str = Form(...),
    relationship: str = Form("Other"),
    photo_caption: str = Form(""),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    name, memory, caption = clean(name), clean(memory), clean(photo_caption)
    if not 2 <= len(name) <= 100:
        raise HTTPException(422, "Name must be 2 to 100 characters.")
    if not 20 <= len(memory) <= 2000:
        raise HTTPException(422, "Memory must be 20 to 2000 characters.")
    if relationship not in RELATIONSHIPS:
        raise HTTPException(422, "Please choose a relationship from the list.")
    if len(caption) > 200:
        raise HTTPException(422, "Caption must be 200 characters or fewer.")
    path = save_photo(photo) if photo and photo.filename else None
    return crud.create_memory(db, name=name, relationship=relationship, memory=memory,
                              photo_path=path, photo_caption=caption or None)


@app.get("/api/memories", response_model=List[MemoryOut])
def get_memories(response: Response, q: str = Query("", max_length=100),
                 sort: str = "newest", page: int = Query(1, ge=1),
                 limit: int = Query(12, ge=1, le=50), db: Session = Depends(get_db)):
    rows, total = crud.list_memories(db, clean(q), sort, (page - 1) * limit, limit)
    response.headers["X-Total-Count"] = str(total)
    return rows


@app.get("/api/memories/featured", response_model=List[MemoryOut])
def get_featured(db: Session = Depends(get_db)):
    return crud.list_featured(db)


@app.get("/api/photos", response_model=List[MemoryOut])
def get_photos(response: Response, page: int = Query(1, ge=1),
               limit: int = Query(8, ge=1, le=50), db: Session = Depends(get_db)):
    rows, total = crud.list_photos(db, (page - 1) * limit, limit)
    response.headers["X-Total-Count"] = str(total)
    return rows


@app.get("/api/stats", response_model=Stats)
def get_stats(db: Session = Depends(get_db)):
    return crud.stats(db)


app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8000")))