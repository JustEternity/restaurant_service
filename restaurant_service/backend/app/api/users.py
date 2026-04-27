from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.database import get_async_db
from app.db_models import User, CookGroup, CooksInGroup, Specialization
from app.db_models.user_roles import Role  # <-- добавлен импорт
from app.schemas.users_schemas import *
from app.schemas.cook_group_schemas import CookGroupResponse
from app.core.security import get_password_hash, get_current_user

router = APIRouter(prefix="/users", tags=["Пользователи"])

@router.get("/", response_model=List[UserResponse])
async def get_all_users(
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    stmt = select(User).options(
        selectinload(User.role_of_user),
        selectinload(User.specialization_of_user),
        selectinload(User.user_in_group).selectinload(CooksInGroup.group_of_cooks)
    )

    if role:
        stmt = stmt.join(User.role_of_user).where(Role.name == role)

    stmt = stmt.order_by(User.id)
    result = await db.execute(stmt)
    users = result.unique().scalars().all()

    response = []
    for user in users:
        cook_groups = []
        for link in user.user_in_group:
            if link.group_of_cooks:
                cook_groups.append(CookGroupResponse(
                    id=link.group_of_cooks.id,
                    name=link.group_of_cooks.name
                ))

        response.append(UserResponse(
            id=user.id,
            name=user.name,
            login=user.login,
            role=user.role_of_user.name if user.role_of_user else None,
            is_available=user.is_available,
            specialization=user.specialization_of_user,
            cook_groups=cook_groups
        ))
    return response

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.id != user_id and current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    stmt = select(User).where(User.id == user_id).options(
        selectinload(User.role_of_user),
        selectinload(User.specialization_of_user),
        selectinload(User.user_in_group).selectinload(CooksInGroup.group_of_cooks)
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    cook_groups = []
    for link in user.user_in_group:
        if link.group_of_cooks:
            cook_groups.append(CookGroupResponse(
                id=link.group_of_cooks.id,
                name=link.group_of_cooks.name
            ))
    return UserResponse(
        id=user.id,
        name=user.name,
        login=user.login,
        role=user.role_of_user.name if user.role_of_user else None,
        is_available=user.is_available,
        specialization=user.specialization_of_user,
        cook_groups=cook_groups
    )

@router.post("/", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    stmt = select(User).where(User.login == user_data.login)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Логин уже существует")

    hashed_password = get_password_hash(user_data.password)

    role_stmt = select(Role).where(Role.name == user_data.role)
    role_result = await db.execute(role_stmt)
    role_obj = role_result.scalar_one_or_none()
    if not role_obj:
        raise HTTPException(status_code=400, detail="Роль не найдена")

    user = User(
        name=user_data.name,
        login=user_data.login,
        password=hashed_password,
        role=role_obj.id,
        is_available=user_data.is_available,
        specialization=user_data.specialization_id
    )
    db.add(user)
    await db.flush()

    if user_data.cook_group_ids:
        groups_stmt = select(CookGroup).where(CookGroup.id.in_(user_data.cook_group_ids))
        groups_result = await db.execute(groups_stmt)
        groups = groups_result.scalars().all()
        if len(groups) != len(user_data.cook_group_ids):
            raise HTTPException(status_code=404, detail="Одна или несколько групп не найдены")
        for group in groups:
            db.add(CooksInGroup(cook=user.id, group=group.id))

    await db.commit()
    await db.refresh(user, attribute_names=["role_of_user", "specialization_of_user", "user_in_group"])

    cook_groups = []
    for link in user.user_in_group:
        if link.group_of_cooks:
            cook_groups.append(CookGroupResponse(
                id=link.group_of_cooks.id,
                name=link.group_of_cooks.name
            ))
    return UserResponse(
        id=user.id,
        name=user.name,
        login=user.login,
        role=user.role_of_user.name if user.role_of_user else None,
        is_available=user.is_available,
        specialization=user.specialization_of_user,
        cook_groups=cook_groups
    )

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.id != user_id and current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    stmt = select(User).where(User.id == user_id).options(
        selectinload(User.role_of_user),
        selectinload(User.user_in_group).selectinload(CooksInGroup.group_of_cooks)
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if user_data.login and user_data.login != user.login:
        check_stmt = select(User).where(User.login == user_data.login, User.id != user_id)
        check_result = await db.execute(check_stmt)
        if check_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Логин уже используется")

    if user_data.name is not None:
        user.name = user_data.name
    if user_data.login is not None:
        user.login = user_data.login
    if user_data.password is not None:
        user.password = get_password_hash(user_data.password)
    if user_data.role is not None:
        if current_user.role_of_user.name == "admin":
            role_stmt = select(Role).where(Role.name == user_data.role)
            role_result = await db.execute(role_stmt)
            role_obj = role_result.scalar_one_or_none()
            if not role_obj:
                raise HTTPException(status_code=400, detail="Роль не найдена")
            user.role = role_obj.id
        else:
            raise HTTPException(status_code=403, detail="Только администратор может менять роль")
    if user_data.is_available is not None:
        if current_user.role_of_user.name == "admin":
            user.is_available = user_data.is_available
        else:
            raise HTTPException(status_code=403, detail="Только администратор может менять статус доступности")
    if user_data.specialization_id is not None:
        user.specialization = user_data.specialization_id

    if user_data.cook_group_ids is not None:
        if current_user.role_of_user.name != "admin":
            raise HTTPException(status_code=403, detail="Только администратор может менять группы поваров")
        await db.execute(delete(CooksInGroup).where(CooksInGroup.cook == user_id))
        if user_data.cook_group_ids:
            groups_stmt = select(CookGroup).where(CookGroup.id.in_(user_data.cook_group_ids))
            groups_result = await db.execute(groups_stmt)
            groups = groups_result.scalars().all()
            if len(groups) != len(user_data.cook_group_ids):
                raise HTTPException(status_code=404, detail="Одна или несколько групп не найдены")
            for group in groups:
                db.add(CooksInGroup(cook=user_id, group=group.id))

    await db.commit()
    await db.refresh(user, attribute_names=["role_of_user", "specialization_of_user", "user_in_group"])

    cook_groups = []
    for link in user.user_in_group:
        if link.group_of_cooks:
            cook_groups.append(CookGroupResponse(
                id=link.group_of_cooks.id,
                name=link.group_of_cooks.name
            ))
    return UserResponse(
        id=user.id,
        name=user.name,
        login=user.login,
        role=user.role_of_user.name if user.role_of_user else None,
        is_available=user.is_available,
        specialization=user.specialization_of_user,
        cook_groups=cook_groups
    )

@router.put("/{user_id}/full", response_model=UserResponse)
async def update_user_full(
    user_id: int,
    user_data: UserUpdateFull,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    stmt = select(User).where(User.id == user_id).options(
        selectinload(User.role_of_user),
        selectinload(User.user_in_group).selectinload(CooksInGroup.group_of_cooks)
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if user_data.login != user.login:
        check_stmt = select(User).where(User.login == user_data.login, User.id != user_id)
        check_result = await db.execute(check_stmt)
        if check_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Логин уже используется")

    user.name = user_data.name
    user.login = user_data.login
    user.password = get_password_hash(user_data.password) if user_data.password else user.password
    role_stmt = select(Role).where(Role.name == user_data.role)
    role_result = await db.execute(role_stmt)
    role_obj = role_result.scalar_one_or_none()
    if not role_obj:
        raise HTTPException(status_code=400, detail="Роль не найдена")
    user.role = role_obj.id
    user.is_available = user_data.is_available
    user.specialization = user_data.specialization_id

    await db.execute(delete(CooksInGroup).where(CooksInGroup.cook == user_id))
    if user_data.cook_group_ids:
        groups_stmt = select(CookGroup).where(CookGroup.id.in_(user_data.cook_group_ids))
        groups_result = await db.execute(groups_stmt)
        groups = groups_result.scalars().all()
        if len(groups) != len(user_data.cook_group_ids):
            raise HTTPException(status_code=404, detail="Одна или несколько групп не найдены")
        for group in groups:
            db.add(CooksInGroup(cook=user_id, group=group.id))

    await db.commit()
    await db.refresh(user, attribute_names=["role_of_user", "specialization_of_user", "user_in_group"])

    cook_groups = []
    for link in user.user_in_group:
        if link.group_of_cooks:
            cook_groups.append(CookGroupResponse(
                id=link.group_of_cooks.id,
                name=link.group_of_cooks.name
            ))
    return UserResponse(
        id=user.id,
        name=user.name,
        login=user.login,
        role=user.role_of_user.name if user.role_of_user else None,
        is_available=user.is_available,
        specialization=user.specialization_of_user,
        cook_groups=cook_groups
    )

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    user = await db.get(User, user_id)
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
    if current_user.role_of_user.name != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

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