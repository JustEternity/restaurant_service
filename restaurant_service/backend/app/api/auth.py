from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from app.database import get_db
from app.db_models import User
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
def register(
    user_data: UserRegister,
    db: Session = Depends(get_db)
):
    """Регистрация нового пользователя"""
    existing_user = db.query(User).filter(User.login == user_data.login).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким логином уже существует"
        )

    hashed_password = get_password_hash(user_data.password)

    user = User(
        name=user_data.name,
        login=user_data.login,
        password=hashed_password,
        role=user_data.role,
        is_available=True
    )

    db.add(user)
    db.commit()
    db.refresh(user)

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

@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Вход в систему"""
    user = db.query(User).filter(User.login == form_data.username).first()

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
def login_json(
    user_data: dict,
    db: Session = Depends(get_db)
):
    """Вход в систему с использованием JSON"""
    try:
        username = user_data.get("username") or user_data.get("login")
        password = user_data.get("password")

        if not username or not password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Требуются поля username и password"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Неверные данные: {str(e)}"
        )

    user = db.query(User).filter(User.login == username).first()

    if not user or not verify_password(password, user.password):
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

@router.post("/logout")
def logout():
    """Выход из системы"""
    return {"message": "Успешный выход из системы"}

@router.get("/me")
def get_me(
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
def change_password(
    password_data: ChangePassword,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Смена пароля"""
    if not verify_password(password_data.old_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный текущий пароль"
        )

    hashed_password = get_password_hash(password_data.new_password)
    current_user.password = hashed_password

    db.commit()

    return {"message": "Пароль успешно изменен"}

@router.post("/refresh-token")
def refresh_token(
    current_user: User = Depends(get_current_user)
):
    """Обновление токена"""
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