from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_async_db
from app.db_models import Tag
from app.schemas.tag_schemas import TagCreate, TagUpdate, TagResponse
from app.core.security import get_current_user
from app.db_models import User

router = APIRouter(prefix="/tags", tags=["Теги"])

@router.get("/", response_model=List[TagResponse])
async def get_all_tags(db: AsyncSession = Depends(get_async_db)):
    """Получить все теги"""
    stmt = select(Tag).order_by(Tag.name)
    result = await db.execute(stmt)
    tags = result.scalars().all()
    return tags

@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(tag_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить тег по ID"""
    stmt = select(Tag).where(Tag.id == tag_id)
    result = await db.execute(stmt)
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Тег не найден")
    return tag

@router.post("/", response_model=TagResponse)
async def create_tag(
    tag_data: TagCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Создать тег (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    # Проверяем уникальность имени
    stmt = select(Tag).where(Tag.name == tag_data.name)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Тег с таким именем уже существует")

    tag = Tag(name=tag_data.name)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag

@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: int,
    tag_data: TagUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить тег (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    stmt = select(Tag).where(Tag.id == tag_id)
    result = await db.execute(stmt)
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Тег не найден")

    if tag_data.name is not None and tag_data.name != tag.name:
        check_stmt = select(Tag).where(Tag.name == tag_data.name, Tag.id != tag_id)
        check_result = await db.execute(check_stmt)
        existing = check_result.scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Тег с таким именем уже существует")
        tag.name = tag_data.name

    await db.commit()
    await db.refresh(tag)
    return tag

@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить тег (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    stmt = select(Tag).where(Tag.id == tag_id)
    result = await db.execute(stmt)
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Тег не найден")
    await db.delete(tag)
    await db.commit()
    return {"message": "Тег удален"}