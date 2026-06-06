from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from datetime import timedelta

from app.database import get_async_db
from app.db_models import User, UserRole, Role
from app.schemas.auth_schemas import Token, UserRegister, ChangePassword
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    get_current_active_user
)
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["Аутентификация"])

@router.post("/register", response_model=Token)
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_async_db)
):
    """Регистрация нового пользователя"""
    stmt = select(User).where(User.login == user_data.login)
    result = await db.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким логином уже существует"
        )

    role_stmt = select(UserRole).where(UserRole.name == user_data.role)
    role_result = await db.execute(role_stmt)
    role_obj = role_result.scalar_one_or_none()
    if not role_obj:
        raise HTTPException(status_code=400, detail="Роль не найдена")

    hashed_password = get_password_hash(user_data.password)

    user = User(
        name=user_data.name,
        login=user_data.login,
        password=hashed_password,
        role=role_obj.id,
        is_available=True
    )

    db.add(user)

    try:
        await db.commit()
        await db.refresh(user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ошибка при создании пользователя"
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        role=user_data.role,
        name=user.name
    )

@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_async_db)
):
    """Вход в систему"""
    stmt = select(User).where(User.login == form_data.username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_available:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь заблокирован"
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        role=user.role,
        name=user.name
    )

@router.post("/login-json", response_model=Token)
async def login_json(
    user_data: dict,
    db: AsyncSession = Depends(get_async_db)
):
    username = user_data.get("login") or user_data.get("username")
    password = user_data.get("password")

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Требуются поля login и password"
        )

    stmt = select(User).where(User.login == username).options(selectinload(User.role_of_user))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль"
        )

    if not user.is_available:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь заблокирован"
        )

    role_name = user.role_of_user.name if user.role_of_user else "unknown"

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": role_name},
        expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        role=role_name,
        name=user.name
    )

@router.post("/logout")
async def logout():
    return {"message": "Успешный выход из системы"}

@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_active_user)
):
    """Получение информации о текущем пользователе"""
    return {
        "id": current_user.id,
        "name": current_user.name,
        "login": current_user.login,
        "role": current_user.role,
        "is_available": current_user.is_available
    }

@router.post("/change-password")
async def change_password(
    password_data: ChangePassword,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_async_db)
):
    if not verify_password(password_data.old_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный текущий пароль"
        )

    hashed_password = get_password_hash(password_data.new_password)
    current_user.password = hashed_password

    await db.commit()

    return {"message": "Пароль успешно изменен"}

@router.post("/refresh-token")
async def refresh_token(
    current_user: User = Depends(get_current_user)
):
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(current_user.id), "role": current_user.role},
        expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=current_user.id,
        role=current_user.role,
        name=current_user.name
    )