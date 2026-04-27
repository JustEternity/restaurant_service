from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_async_db
from app.db_models import Role
from app.schemas.role_schemas import RoleCreate, RoleUpdate, RoleResponse

router = APIRouter(prefix="/roles", tags=["Роли пользователей"])

@router.get("/", response_model=List[RoleResponse])
async def get_all_roles(db: AsyncSession = Depends(get_async_db)):
    """Получить список всех ролей"""
    stmt = select(Role).order_by(Role.name)
    result = await db.execute(stmt)
    roles = result.scalars().all()
    return roles

@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(role_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить роль по ID"""
    role = await db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    return role

@router.post("/", response_model=RoleResponse)
async def create_role(role_data: RoleCreate, db: AsyncSession = Depends(get_async_db)):
    """Создать новую роль"""
    stmt = select(Role).where(Role.name == role_data.name)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Роль с таким именем уже существует")

    role = Role(name=role_data.name)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role

@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(role_id: int, role_data: RoleUpdate, db: AsyncSession = Depends(get_async_db)):
    """Обновить название роли"""
    role = await db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")

    if role_data.name is not None:
        stmt = select(Role).where(Role.name == role_data.name, Role.id != role_id)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Роль с таким именем уже существует")
        role.name = role_data.name

    await db.commit()
    await db.refresh(role)
    return role

@router.delete("/{role_id}")
async def delete_role(role_id: int, db: AsyncSession = Depends(get_async_db)):
    """Удалить роль"""
    role = await db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")

    await db.delete(role)
    await db.commit()
    return {"message": f"Роль '{role.name}' удалена"}