from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date
from app.database import get_db
from app.db_models import CookingStatusHistory, Menu, User, Order
from app.schemas.history_schemas import *

router = APIRouter(prefix="/cooking-status-history", tags=["История статусов блюд"])

# ===== ЭНДПОИНТЫ =====
@router.get("/", response_model=List[CookingStatusHistoryResponse])
def get_all_cooking_status_history(
    db: Session = Depends(get_db),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    plate_id: Optional[int] = None,
    order_id: Optional[int] = None,
    change_by: Optional[int] = None,
    new_status: Optional[str] = None
):
    """Получить всю историю изменения статусов с фильтрацией"""
    query = db.query(CookingStatusHistory)

    if start_date:
        query = query.filter(CookingStatusHistory.change_time >= start_date)
    if end_date:
        query = query.filter(CookingStatusHistory.change_time <= end_date)
    if plate_id:
        query = query.filter(CookingStatusHistory.plate_id == plate_id)
    if order_id:
        query = query.filter(CookingStatusHistory.order_id == order_id)
    if change_by:
        query = query.filter(CookingStatusHistory.change_by == change_by)
    if new_status:
        query = query.filter(CookingStatusHistory.new_status == new_status)

    history_items = query.order_by(CookingStatusHistory.change_time.desc()).all()

    result = []
    for item in history_items:
        item_dict = item.__dict__.copy()

        # Добавление информации о блюде
        plate = db.query(Menu).filter(Menu.id == item.plate_id).first()
        item_dict['plate_name'] = plate.name if plate else None

        # Добавление информации о пользователе
        if item.change_by:
            user = db.query(User).filter(User.id == item.change_by).first()
            item_dict['user_name'] = user.name if user else None

        # Добавление информации о заказе
        if item.order_id:
            order = db.query(Order).filter(Order.id == item.order_id).first()
            item_dict['order_number'] = f"Заказ #{item.order_id}"

        result.append(CookingStatusHistoryResponse(**item_dict))

    return result

@router.get("/{history_id}", response_model=CookingStatusHistoryResponse)
def get_cooking_status_history(history_id: int, db: Session = Depends(get_db)):
    """Получить запись истории статуса по ID"""
    history_item = db.query(CookingStatusHistory).filter(CookingStatusHistory.id == history_id).first()
    if not history_item:
        raise HTTPException(status_code=404, detail="Запись истории не найдена")

    item_dict = history_item.__dict__.copy()

    # Добавление информации о блюде
    plate = db.query(Menu).filter(Menu.id == history_item.plate_id).first()
    item_dict['plate_name'] = plate.name if plate else None

    # Добавление информации о пользователе
    if history_item.change_by:
        user = db.query(User).filter(User.id == history_item.change_by).first()
        item_dict['user_name'] = user.name if user else None

    # Добавление информации о заказе
    if history_item.order_id:
        order = db.query(Order).filter(Order.id == history_item.order_id).first()
        item_dict['order_number'] = f"Заказ #{history_item.order_id}"

    return CookingStatusHistoryResponse(**item_dict)

@router.post("/", response_model=CookingStatusHistoryResponse)
def create_cooking_status_history(history_data: CookingStatusHistoryCreate, db: Session = Depends(get_db)):
    """Создать запись истории изменения статуса"""
    plate = db.query(Menu).filter(Menu.id == history_data.plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    if history_data.change_by:
        user = db.query(User).filter(User.id == history_data.change_by).first()
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

    if history_data.order_id:
        order = db.query(Order).filter(Order.id == history_data.order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Заказ не найден")

    history_item = CookingStatusHistory(
        change_time=datetime.now(),
        new_status=history_data.new_status,
        order_id=history_data.order_id,
        plate_id=history_data.plate_id,
        change_by=history_data.change_by
    )

    db.add(history_item)
    db.commit()
    db.refresh(history_item)

    item_dict = history_item.__dict__.copy()
    item_dict['plate_name'] = plate.name
    if history_data.change_by:
        user = db.query(User).filter(User.id == history_data.change_by).first()
        item_dict['user_name'] = user.name if user else None
    if history_data.order_id:
        item_dict['order_number'] = f"Заказ #{history_data.order_id}"

    return CookingStatusHistoryResponse(**item_dict)

@router.put("/{history_id}", response_model=CookingStatusHistoryResponse)
def update_cooking_status_history(history_id: int, history_data: CookingStatusHistoryUpdate, db: Session = Depends(get_db)):
    """Обновить запись истории статуса"""
    history_item = db.query(CookingStatusHistory).filter(CookingStatusHistory.id == history_id).first()
    if not history_item:
        raise HTTPException(status_code=404, detail="Запись истории не найдена")

    if history_data.new_status is not None:
        history_item.new_status = history_data.new_status
    if history_data.order_id is not None:
        order = db.query(Order).filter(Order.id == history_data.order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        history_item.order_id = history_data.order_id
    if history_data.plate_id is not None:
        plate = db.query(Menu).filter(Menu.id == history_data.plate_id).first()
        if not plate:
            raise HTTPException(status_code=404, detail="Блюдо не найдено")
        history_item.plate_id = history_data.plate_id
    if history_data.change_by is not None:
        user = db.query(User).filter(User.id == history_data.change_by).first()
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        history_item.change_by = history_data.change_by

    db.commit()
    db.refresh(history_item)

    item_dict = history_item.__dict__.copy()

    plate = db.query(Menu).filter(Menu.id == history_item.plate_id).first()
    item_dict['plate_name'] = plate.name if plate else None

    if history_item.change_by:
        user = db.query(User).filter(User.id == history_item.change_by).first()
        item_dict['user_name'] = user.name if user else None

    if history_item.order_id:
        item_dict['order_number'] = f"Заказ #{history_item.order_id}"

    return CookingStatusHistoryResponse(**item_dict)

@router.delete("/{history_id}")
def delete_cooking_status_history(history_id: int, db: Session = Depends(get_db)):
    """Удалить запись истории статуса"""
    history_item = db.query(CookingStatusHistory).filter(CookingStatusHistory.id == history_id).first()
    if not history_item:
        raise HTTPException(status_code=404, detail="Запись истории не найдена")

    db.delete(history_item)
    db.commit()

    return {"message": "Запись истории удалена"}

@router.get("/plate/{plate_id}", response_model=List[CookingStatusHistoryResponse])
def get_history_by_plate(plate_id: int, db: Session = Depends(get_db)):
    """Получить историю статусов для конкретного блюда"""
    plate = db.query(Menu).filter(Menu.id == plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    history_items = db.query(CookingStatusHistory)\
        .filter(CookingStatusHistory.plate_id == plate_id)\
        .order_by(CookingStatusHistory.change_time.desc())\
        .all()

    result = []
    for item in history_items:
        item_dict = item.__dict__.copy()
        item_dict['plate_name'] = plate.name

        if item.change_by:
            user = db.query(User).filter(User.id == item.change_by).first()
            item_dict['user_name'] = user.name if user else None

        if item.order_id:
            item_dict['order_number'] = f"Заказ #{item.order_id}"

        result.append(CookingStatusHistoryResponse(**item_dict))

    return result

@router.get("/order/{order_id}", response_model=List[CookingStatusHistoryResponse])
def get_history_by_order(order_id: int, db: Session = Depends(get_db)):
    """Получить историю статусов для конкретного заказа"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    history_items = db.query(CookingStatusHistory)\
        .filter(CookingStatusHistory.order_id == order_id)\
        .order_by(CookingStatusHistory.change_time.desc())\
        .all()

    result = []
    for item in history_items:
        item_dict = item.__dict__.copy()

        plate = db.query(Menu).filter(Menu.id == item.plate_id).first()
        item_dict['plate_name'] = plate.name if plate else None

        if item.change_by:
            user = db.query(User).filter(User.id == item.change_by).first()
            item_dict['user_name'] = user.name if user else None

        item_dict['order_number'] = f"Заказ #{order_id}"

        result.append(CookingStatusHistoryResponse(**item_dict))

    return result

@router.get("/user/{user_id}", response_model=List[CookingStatusHistoryResponse])
def get_history_by_user(user_id: int, db: Session = Depends(get_db)):
    """Получить историю статусов, измененных конкретным пользователем"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    history_items = db.query(CookingStatusHistory)\
        .filter(CookingStatusHistory.change_by == user_id)\
        .order_by(CookingStatusHistory.change_time.desc())\
        .all()

    result = []
    for item in history_items:
        item_dict = item.__dict__.copy()

        plate = db.query(Menu).filter(Menu.id == item.plate_id).first()
        item_dict['plate_name'] = plate.name if plate else None

        item_dict['user_name'] = user.name

        if item.order_id:
            item_dict['order_number'] = f"Заказ #{item.order_id}"

        result.append(CookingStatusHistoryResponse(**item_dict))

    return result

@router.get("/latest/plate/{plate_id}", response_model=CookingStatusHistoryResponse)
def get_latest_status_for_plate(plate_id: int, db: Session = Depends(get_db)):
    """Получить последний статус для конкретного блюда"""
    plate = db.query(Menu).filter(Menu.id == plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    latest_item = db.query(CookingStatusHistory)\
        .filter(CookingStatusHistory.plate_id == plate_id)\
        .order_by(CookingStatusHistory.change_time.desc())\
        .first()

    if not latest_item:
        raise HTTPException(status_code=404, detail="История статусов для этого блюда не найдена")

    item_dict = latest_item.__dict__.copy()
    item_dict['plate_name'] = plate.name

    if latest_item.change_by:
        user = db.query(User).filter(User.id == latest_item.change_by).first()
        item_dict['user_name'] = user.name if user else None

    if latest_item.order_id:
        item_dict['order_number'] = f"Заказ #{latest_item.order_id}"

    return CookingStatusHistoryResponse(**item_dict)