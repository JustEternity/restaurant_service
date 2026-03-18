from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from app.database import get_async_db
from app.db_models import CookGroup, cooks_in_groups
from app.schemas.cook_group_schemas import CookGroupCreate, CookGroupUpdate, CookGroupResponse
from app.core.security import get_current_user
from app.db_models import User

router = APIRouter(prefix="/cook-groups", tags=["Группы поваров"])

@router.get("/", response_model=List[CookGroupResponse])
async def get_all_cook_groups(db: AsyncSession = Depends(get_async_db)):
    """Получить все группы поваров"""
    stmt = select(CookGroup).order_by(CookGroup.name)
    result = await db.execute(stmt)
    groups = result.scalars().all()
    return groups

@router.get("/{group_id}", response_model=CookGroupResponse)
async def get_cook_group(group_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить группу поваров по ID"""
    stmt = select(CookGroup).where(CookGroup.id == group_id)
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    return group

@router.post("/", response_model=CookGroupResponse)
async def create_cook_group(
    group_data: CookGroupCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Создать группу поваров (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    # Проверка уникальности имени
    stmt = select(CookGroup).where(CookGroup.name == group_data.name)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Группа с таким именем уже существует")

    group = CookGroup(name=group_data.name, description=group_data.description)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group

@router.put("/{group_id}", response_model=CookGroupResponse)
async def update_cook_group(
    group_id: int,
    group_data: CookGroupUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить группу поваров (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    stmt = select(CookGroup).where(CookGroup.id == group_id)
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    if group_data.name is not None and group_data.name != group.name:
        check_stmt = select(CookGroup).where(CookGroup.name == group_data.name, CookGroup.id != group_id)
        check_result = await db.execute(check_stmt)
        existing = check_result.scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Группа с таким именем уже существует")
        group.name = group_data.name

    if group_data.description is not None:
        group.description = group_data.description

    await db.commit()
    await db.refresh(group)
    return group

@router.delete("/{group_id}")
async def delete_cook_group(
    group_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить группу поваров (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    stmt = select(CookGroup).where(CookGroup.id == group_id)
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    # Проверяем, есть ли пользователи в группе
    count_stmt = select(func.count()).select_from(cooks_in_groups).where(cooks_in_groups.c.group_id == group_id)
    count_result = await db.execute(count_stmt)
    count = count_result.scalar()
    if count > 0:
        raise HTTPException(status_code=400, detail="Нельзя удалить группу, в которой есть пользователи")

    await db.delete(group)
    await db.commit()
    return {"message": "Группа удалена"}