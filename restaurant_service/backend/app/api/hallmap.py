import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pathlib import Path

from app.db_models import HallMapSettings
from app.database import get_async_db
from app.schemas.hallmap_settings_schemas import HallMapSettingsResponse, HallMapSettingsUpdate

router = APIRouter(prefix="/hallmap", tags=["Схема зала"])

UPLOAD_DIR = Path("uploads/hallmap")
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 5 * 1024 * 1024

def _photo_url(path: str | None) -> str | None:
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if path.startswith("/uploads/"):
        return path
    return f"/uploads/{path}"

async def _get_or_create_settings(db: AsyncSession) -> HallMapSettings:
    stmt = select(HallMapSettings)
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()
    if not settings:
        settings = HallMapSettings(table_size=30)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings

@router.get("/settings", response_model=HallMapSettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_async_db)):
    settings = await _get_or_create_settings(db)
    return HallMapSettingsResponse(
        id=settings.id,
        hallmap_image=_photo_url(settings.hallmap_image),
        table_size=float(settings.table_size)
    )

@router.put("/settings", response_model=HallMapSettingsResponse)
async def update_settings(data: HallMapSettingsUpdate, db: AsyncSession = Depends(get_async_db)):
    settings = await _get_or_create_settings(db)
    if data.table_size is not None:
        settings.table_size = data.table_size
    if data.hallmap_image is not None:
        settings.hallmap_image = data.hallmap_image
    await db.commit()
    await db.refresh(settings)
    return HallMapSettingsResponse(
        id=settings.id,
        hallmap_image=_photo_url(settings.hallmap_image),
        table_size=float(settings.table_size)
    )

@router.post("/upload-background")
async def upload_background(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db)
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Разрешены только JPEG, PNG, WebP")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 5MB)")
    if file.content_type == "image/jpeg" and content[:2] != b'\xff\xd8':
        raise HTTPException(status_code=400, detail="Невалидный JPEG")
    if file.content_type == "image/png" and content[:4] != b'\x89PNG':
        raise HTTPException(status_code=400, detail="Невалидный PNG")

    settings = await _get_or_create_settings(db)

    if settings.hallmap_image:
        old_path = UPLOAD_DIR / settings.hallmap_image.split('/')[-1]
        if old_path.exists():
            old_path.unlink()

    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"hallmap_{uuid.uuid4().hex}.{ext}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(content)

    settings.hallmap_image = f"hallmap/{filename}"
    await db.commit()
    await db.refresh(settings)

    return {"url": _photo_url(settings.hallmap_image)}