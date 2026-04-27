from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_async_db
from app.db_models import Specialization
from app.schemas.specialization_schemas import (
    SpecializationCreate,
    SpecializationUpdate,
    SpecializationResponse
)

router = APIRouter(prefix="/specializations", tags=["Специализации"])

@router.get("/", response_model=List[SpecializationResponse])
async def get_all_specializations(db: AsyncSession = Depends(get_async_db)):
    """Получить список всех специализаций"""
    stmt = select(Specialization).order_by(Specialization.name)
    result = await db.execute(stmt)
    specializations = result.scalars().all()
    return specializations

@router.get("/{spec_id}", response_model=SpecializationResponse)
async def get_specialization(spec_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить специализацию по ID"""
    spec = await db.get(Specialization, spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Специализация не найдена")
    return spec

@router.post("/", response_model=SpecializationResponse)
async def create_specialization(
    spec_data: SpecializationCreate,
    db: AsyncSession = Depends(get_async_db)
):
    """Создать новую специализацию"""
    stmt = select(Specialization).where(Specialization.name == spec_data.name)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Специализация с таким именем уже существует")

    spec = Specialization(name=spec_data.name)
    db.add(spec)
    await db.commit()
    await db.refresh(spec)
    return spec

@router.put("/{spec_id}", response_model=SpecializationResponse)
async def update_specialization(
    spec_id: int,
    spec_data: SpecializationUpdate,
    db: AsyncSession = Depends(get_async_db)
):
    """Обновить название специализации"""
    spec = await db.get(Specialization, spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Специализация не найдена")

    if spec_data.name is not None:
        stmt = select(Specialization).where(
            Specialization.name == spec_data.name,
            Specialization.id != spec_id
        )
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Специализация с таким именем уже существует")
        spec.name = spec_data.name

    await db.commit()
    await db.refresh(spec)
    return spec

@router.delete("/{spec_id}")
async def delete_specialization(spec_id: int, db: AsyncSession = Depends(get_async_db)):
    """Удалить специализацию"""
    spec = await db.get(Specialization, spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Специализация не найдена")

    await db.delete(spec)
    await db.commit()
    return {"message": f"Специализация '{spec.name}' удалена"}