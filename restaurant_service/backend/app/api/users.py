from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.db_models import User
from app.schemas.users_schemas import *
from app.core.security import get_password_hash, get_current_user
from app.core.config import settings

router = APIRouter(prefix="/users", tags=["Пользователи"])

@router.get("/", response_model=List[UserResponse])
def get_all_users(db: Session = Depends(get_db),current_user: User = Depends(get_current_user)):

    """Получить всех пользователей (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )

    return db.query(User).all()

@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить пользователя по ID"""
    if current_user.id != user_id and current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user

@router.post("/", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создать пользователя (только для администраторов)"""
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )

    existing = db.query(User).filter(User.login == user_data.login).first()
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

    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        name=user.name,
        login=user.login,
        role=user.role,
        is_available=user.is_available
    )

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить пользователя"""
    if current_user.id != user_id and current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if user_data.name is not None:
        user.name = user_data.name
    if user_data.login is not None:
        existing = db.query(User).filter(User.login == user_data.login, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Логин уже используется")
        user.login = user_data.login
    if user_data.password is not None:
        user.password = get_password_hash(user_data.password)
    if user_data.role is not None and current_user.role in ["admin"]:
        user.role = user_data.role
    if user_data.is_available is not None and current_user.role in ["admin"]:
        user.is_available = user_data.is_available

    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        name=user.name,
        login=user.login,
        role=user.role,
        is_available=user.is_available
    )

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Удалить пользователя"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    db.delete(user)
    db.commit()

    return {"message": "Пользователь удален"}

@router.get("/password/{login}")
def get_password(login: str, db: Session = Depends(get_db)):
    """Получить пароль пользователя по логину (админка)"""
    user = db.query(User).filter(User.login == login).first()
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
def update_user_full(user_id: int, user_data: UserUpdateFull, db: Session = Depends(get_db)):
    """Полностью обновить данные пользователя (все поля включая пароль)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if user_data.login != user.login:
        existing = db.query(User).filter(User.login == user_data.login, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Логин уже используется другим пользователем")

    user.name = user_data.name
    user.login = user_data.login
    user.password = user_data.password
    user.role = user_data.role
    user.is_available = user_data.is_available

    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        name=user.name,
        login=user.login,
        role=user.role,
        is_available=user.is_available
    )