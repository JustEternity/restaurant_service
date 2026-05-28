from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_async_db
from ..db_models import PlatesForSpecialization, Menu, Specialization
from ..schemas.plates_for_specialization_schemas import (
    PlateSpecializationCreate,
    PlateSpecializationResponse,
    BatchUpdatePlates
)

router = APIRouter(prefix="/plates-specializations", tags=["Связи блюд и специализаций"])

@router.get("/", response_model=List[PlateSpecializationResponse])
async def get_all_links(db: AsyncSession = Depends(get_async_db)):
    """Получить все связи блюд со специализациями"""
    stmt = select(PlatesForSpecialization).options(
        selectinload(PlatesForSpecialization.spec_plates),
        selectinload(PlatesForSpecialization.spec_of_plates)
    )
    result = await db.execute(stmt)
    links = result.scalars().all()

    response = []
    for link in links:
        response.append(PlateSpecializationResponse(
            id=link.id,
            plate_id=link.plate,
            specialization_id=link.specialization,
            plate_name=link.spec_plates.name if link.spec_plates else None,
            specialization_name=link.spec_of_plates.name if link.spec_of_plates else None
        ))
    return response

@router.post("/", response_model=PlateSpecializationResponse)
async def create_link(link_data: PlateSpecializationCreate, db: AsyncSession = Depends(get_async_db)):
    """Создать связь между блюдом и специализацией"""
    plate = await db.get(Menu, link_data.plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    spec = await db.get(Specialization, link_data.specialization_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Специализация не найдена")

    stmt = select(PlatesForSpecialization).where(
        PlatesForSpecialization.plate == link_data.plate_id,
        PlatesForSpecialization.specialization == link_data.specialization_id
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Такая связь уже существует")

    new_link = PlatesForSpecialization(
        plate=link_data.plate_id,
        specialization=link_data.specialization_id
    )
    db.add(new_link)
    await db.commit()
    await db.refresh(new_link)
    await db.refresh(new_link, attribute_names=["spec_plates", "spec_of_plates"])

    return PlateSpecializationResponse(
        id=new_link.id,
        plate_id=new_link.plate,
        specialization_id=new_link.specialization,
        plate_name=new_link.spec_plates.name if new_link.spec_plates else None,
        specialization_name=new_link.spec_of_plates.name if new_link.spec_of_plates else None
    )

@router.delete("/{link_id}")
async def delete_link(link_id: int, db: AsyncSession = Depends(get_async_db)):
    """Удалить связь по её ID"""
    link = await db.get(PlatesForSpecialization, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Связь не найдена")
    await db.delete(link)
    await db.commit()
    return {"message": "Связь удалена"}

@router.get("/plate/{plate_id}", response_model=List[PlateSpecializationResponse])
async def get_specializations_for_plate(plate_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить все специализации, связанные с конкретным блюдом"""
    plate = await db.get(Menu, plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    stmt = select(PlatesForSpecialization).where(PlatesForSpecialization.plate == plate_id).options(
        selectinload(PlatesForSpecialization.spec_plates),
        selectinload(PlatesForSpecialization.spec_of_plates)
    )
    result = await db.execute(stmt)
    links = result.scalars().all()

    response = []
    for link in links:
        response.append(PlateSpecializationResponse(
            id=link.id,
            plate_id=link.plate,
            specialization_id=link.specialization,
            plate_name=link.spec_plates.name if link.spec_plates else None,
            specialization_name=link.spec_of_plates.name if link.spec_of_plates else None
        ))
    return response

@router.get("/specialization/{spec_id}", response_model=List[PlateSpecializationResponse])
async def get_plates_for_specialization(spec_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить все блюда, связанные с конкретной специализацией"""
    spec = await db.get(Specialization, spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Специализация не найдена")

    stmt = select(PlatesForSpecialization).where(PlatesForSpecialization.specialization == spec_id).options(
        selectinload(PlatesForSpecialization.spec_plates),
        selectinload(PlatesForSpecialization.spec_of_plates)
    )
    result = await db.execute(stmt)
    links = result.scalars().all()

    response = []
    for link in links:
        response.append(PlateSpecializationResponse(
            id=link.id,
            plate_id=link.plate,
            specialization_id=link.specialization,
            plate_name=link.spec_plates.name if link.spec_plates else None,
            specialization_name=link.spec_of_plates.name if link.spec_of_plates else None
        ))
    return response

@router.put("/specialization/{spec_id}/plates")
async def update_plates_for_specialization(
    spec_id: int,
    data: BatchUpdatePlates,
    db: AsyncSession = Depends(get_async_db)
):
    """Заменить все блюда, привязанные к специализации"""
    spec = await db.get(Specialization, spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Специализация не найдена")

    await db.execute(
        delete(PlatesForSpecialization).where(PlatesForSpecialization.specialization == spec_id)
    )

    for plate_id in data.plate_ids:
        db.add(PlatesForSpecialization(plate=plate_id, specialization=spec_id))

    await db.commit()
    return {"message": "Связи обновлены", "plate_ids": data.plate_ids}