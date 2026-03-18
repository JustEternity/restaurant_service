from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from typing import List
from sqlalchemy.orm import selectinload
from app.db_models import CookGroup
from app.schemas.cook_group_schemas import CookGroupResponse

from app.database import get_async_db
from app.db_models import User
from app.schemas.users_schemas import *
from app.core.security import get_password_hash, get_current_user
from app.core.config import settings

router = APIRouter(prefix="/users", tags=["Пользователи"])

@router.get("/", response_model=List[UserResponse])
async def get_all_users(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Получить всех пользователей (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    stmt = select(User).options(selectinload(User.cook_groups)).order_by(User.id)
    result = await db.execute(stmt)
    users = result.scalars().all()
    return users

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Получить пользователя по ID"""
    if current_user.id != user_id and current_user.role not in ["admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    stmt = select(User).where(User.id == user_id).options(selectinload(User.cook_groups))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user

@router.post("/", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Создать пользователя (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    # Проверка логина
    stmt = select(User).where(User.login == user_data.login)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Логин уже существует")

    hashed_password = get_password_hash(user_data.password)

    user = User(
        name=user_data.name,
        login=user_data.login,
        password=hashed_password,
        role=user_data.role,
        is_available=user_data.is_available
    )

    # Обработка групп поваров
    if user_data.cook_group_ids:
        groups_stmt = select(CookGroup).where(CookGroup.id.in_(user_data.cook_group_ids))
        groups_result = await db.execute(groups_stmt)
        groups = groups_result.scalars().all()
        if len(groups) != len(user_data.cook_group_ids):
            raise HTTPException(status_code=404, detail="Одна или несколько групп не найдены")
        user.cook_groups = groups

    db.add(user)
    await db.commit()
    await db.refresh(user)
    await db.refresh(user, attribute_names=["cook_groups"])
    return user

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить пользователя"""
    if current_user.id != user_id and current_user.role not in ["admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    stmt = select(User).where(User.id == user_id).options(selectinload(User.cook_groups))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Проверка уникальности логина
    if user_data.login is not None and user_data.login != user.login:
        check_stmt = select(User).where(User.login == user_data.login, User.id != user_id)
        check_result = await db.execute(check_stmt)
        existing = check_result.scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Логин уже используется")

    # Обновление основных полей
    if user_data.name is not None:
        user.name = user_data.name
    if user_data.login is not None:
        user.login = user_data.login
    if user_data.password is not None:
        user.password = get_password_hash(user_data.password)
    if user_data.role is not None:
        if current_user.role == "admin":
            user.role = user_data.role
        else:
            raise HTTPException(status_code=403, detail="Только администратор может менять роль")
    if user_data.is_available is not None:
        if current_user.role == "admin":
            user.is_available = user_data.is_available
        else:
            raise HTTPException(status_code=403, detail="Только администратор может менять статус доступности")

    # Обновление групп поваров
    if user_data.cook_group_ids is not None:
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Только администратор может менять группы поваров")
        if user_data.cook_group_ids == []:
            user.cook_groups = []
        else:
            groups_stmt = select(CookGroup).where(CookGroup.id.in_(user_data.cook_group_ids))
            groups_result = await db.execute(groups_stmt)
            groups = groups_result.scalars().all()
            if len(groups) != len(user_data.cook_group_ids):
                raise HTTPException(status_code=404, detail="Одна или несколько групп не найдены")
            user.cook_groups = groups

    await db.commit()
    await db.refresh(user)
    await db.refresh(user, attribute_names=["cook_groups"])
    return user

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить пользователя (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    await db.delete(user)
    await db.commit()

    return {"message": "Пользователь удален"}

@router.get("/password/{login}")
async def get_password(
    login: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Получить пароль пользователя по логину (админка)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )

    stmt = select(User).where(User.login == login)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким логином не найден")

    return {
        "login": user.login,
        "password": user.password,
        "name": user.name,
        "role": user.role,
        "is_available": user.is_available
    }

@router.put("/{user_id}/full", response_model=UserResponse)
async def update_user_full(
    user_id: int,
    user_data: UserUpdateFull,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Полностью обновить данные пользователя (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    stmt = select(User).where(User.id == user_id).options(selectinload(User.cook_groups))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Проверка уникальности логина
    if user_data.login != user.login:
        check_stmt = select(User).where(User.login == user_data.login, User.id != user_id)
        check_result = await db.execute(check_stmt)
        existing = check_result.scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Логин уже используется другим пользователем")

    # Обновление основных полей
    user.name = user_data.name
    user.login = user_data.login
    user.password = get_password_hash(user_data.password) if user_data.password else user.password
    user.role = user_data.role
    user.is_available = user_data.is_available

    # Обновление групп поваров
    if user_data.cook_group_ids is not None:
        groups_stmt = select(CookGroup).where(CookGroup.id.in_(user_data.cook_group_ids))
        groups_result = await db.execute(groups_stmt)
        groups = groups_result.scalars().all()
        if len(groups) != len(user_data.cook_group_ids):
            raise HTTPException(status_code=404, detail="Одна или несколько групп не найдены")
        user.cook_groups = groups

    await db.commit()
    await db.refresh(user)
    await db.refresh(user, attribute_names=["cook_groups"])
    return user