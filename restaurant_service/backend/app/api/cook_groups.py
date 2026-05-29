from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_async_db
from app.db_models import CookGroup, CooksInGroup, User
from app.schemas.cook_group_schemas import (
    CookGroupCreate, CookGroupUpdate, CookGroupResponse,
    CookToGroup, BatchCookToGroup
)
from app.schemas.users_schemas import UserResponse
from app.core.security import get_current_user

router = APIRouter(prefix="/cook-groups", tags=["Группы поваров"])

# ===== ЭНДПОИНТЫ ГРУПП =====
@router.get("/", response_model=List[CookGroupResponse])
async def get_all_cook_groups(db: AsyncSession = Depends(get_async_db)):
    """Получить все группы поваров"""
    stmt = select(CookGroup).order_by(CookGroup.name)
    result = await db.execute(stmt)
    return result.scalars().all()

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
    """Создать группу поваров"""
    if not current_user.role_of_user:
        await db.refresh(current_user, attribute_names=["role_of_user"])
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    stmt = select(CookGroup).where(CookGroup.name == group_data.name)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Группа с таким именем уже существует")

    group = CookGroup(name=group_data.name)
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
    """Обновить группу поваров"""
    if not current_user.role_of_user:
        await db.refresh(current_user, attribute_names=["role_of_user"])
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    stmt = select(CookGroup).where(CookGroup.id == group_id)
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    if group_data.name is not None and group_data.name != group.name:
        check_stmt = select(CookGroup).where(
            CookGroup.name == group_data.name,
            CookGroup.id != group_id
        )
        check_result = await db.execute(check_stmt)
        if check_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Группа с таким именем уже существует")
        group.name = group_data.name

    await db.commit()
    await db.refresh(group)
    return group

@router.delete("/{group_id}")
async def delete_cook_group(
    group_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить группу поваров"""
    if not current_user.role_of_user:
        await db.refresh(current_user, attribute_names=["role_of_user"])
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    stmt = select(CookGroup).where(CookGroup.id == group_id)
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    count_stmt = select(func.count()).select_from(CooksInGroup).where(CooksInGroup.group == group_id)
    count_result = await db.execute(count_stmt)

    await db.delete(group)
    await db.commit()
    return {"message": "Группа удалена"}

# ===== ПОВАРА В ГРУППЕ =====
@router.get("/{group_id}/cooks/", response_model=List[UserResponse])
async def get_group_cooks(group_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить всех поваров, входящих в группу"""
    group = await db.get(CookGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    stmt = select(User).join(CooksInGroup).where(CooksInGroup.group == group_id).options(
        selectinload(User.role_of_user),
        selectinload(User.specialization_of_user))
    result = await db.execute(stmt)
    users = result.scalars().all()
    response = []
    for u in users:
        response.append(UserResponse(
            id=u.id,
            name=u.name,
            login=u.login,
            role=u.role_of_user.name if u.role_of_user else None,
            is_available=u.is_available,
            specialization=u.specialization_of_user,
            cook_groups=[]
        ))
    return response

@router.post("/{group_id}/cooks/")
async def add_cook_to_group(
    group_id: int,
    payload: CookToGroup,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Добавить повара в группу (только для администраторов)"""
    if not current_user.role_of_user:
        await db.refresh(current_user, attribute_names=["role_of_user"])
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    group = await db.get(CookGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    stmt = select(User).where(User.id == payload.user_id).options(selectinload(User.role_of_user))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if not user.role_of_user or user.role_of_user.name != "cook":
        raise HTTPException(status_code=400, detail="Пользователь не является поваром")

    exist_stmt = select(CooksInGroup).where(
        CooksInGroup.group == group_id,
        CooksInGroup.cook == payload.user_id
    )
    exist_result = await db.execute(exist_stmt)
    if exist_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Повар уже состоит в этой группе")

    new_link = CooksInGroup(group=group_id, cook=payload.user_id)
    db.add(new_link)
    await db.commit()
    return {"message": "Повар добавлен в группу"}

@router.delete("/{group_id}/cooks/{user_id}")
async def remove_cook_from_group(
    group_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить повара из группы (только для администраторов)"""
    if not current_user.role_of_user:
        await db.refresh(current_user, attribute_names=["role_of_user"])
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    group = await db.get(CookGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    stmt = delete(CooksInGroup).where(
        CooksInGroup.group == group_id,
        CooksInGroup.cook == user_id
    )
    result = await db.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Повар не найден в группе")
    await db.commit()
    return {"message": "Повар удалён из группы"}

@router.post("/{group_id}/cooks/batch")
async def add_cooks_to_group_batch(
    group_id: int,
    payload: BatchCookToGroup,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Добавить нескольких поваров в группу (только для администраторов)"""
    if not current_user.role_of_user:
        await db.refresh(current_user, attribute_names=["role_of_user"])
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    group = await db.get(CookGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    stmt = select(User).where(User.id.in_(payload.user_ids)).options(selectinload(User.role_of_user))
    result = await db.execute(stmt)
    users = result.scalars().all()

    if len(users) != len(payload.user_ids):
        missing = set(payload.user_ids) - {u.id for u in users}
        raise HTTPException(status_code=404, detail=f"Пользователи с ID {missing} не найдены")

    for u in users:
        if not u.role_of_user or u.role_of_user.name != "cook":
            raise HTTPException(status_code=400, detail=f"Пользователь {u.id} не является поваром")

    exist_stmt = select(CooksInGroup.cook).where(
        CooksInGroup.group == group_id,
        CooksInGroup.cook.in_(payload.user_ids)
    )
    exist_result = await db.execute(exist_stmt)
    existing_cook_ids = {row[0] for row in exist_result}
    if existing_cook_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Повара с ID {existing_cook_ids} уже состоят в группе"
        )

    for cook_id in payload.user_ids:
        db.add(CooksInGroup(group=group_id, cook=cook_id))

    await db.commit()
    return {"message": f"{len(payload.user_ids)} поваров добавлены в группу"}