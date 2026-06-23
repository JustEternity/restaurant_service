from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, date

from app.database import get_async_db
from app.db_models import CookingStatusHistory, PlateForOrder, Menu, User, Order
from app.schemas.history_schemas import (
    CookingStatusHistoryCreate,
    CookingStatusHistoryUpdate,
    CookingStatusHistoryResponse
)

from app.websocket.manager import manager
from app.api.orders import get_cooks_to_notify
from app.core.security import get_current_user

router = APIRouter(prefix="/cooking-status-history", tags=["История статусов блюд"])

@router.get("/", response_model=List[CookingStatusHistoryResponse])
async def get_all_cooking_status_history(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    plate_id: Optional[int] = None,
    order_id: Optional[int] = None,
    change_by: Optional[int] = None,
    new_status: Optional[str] = None
):
    """Получить всю историю изменения статусов с фильтрацией"""
    stmt = select(CookingStatusHistory).options(
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.plate),
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.order_of_plate)
    )

    if plate_id is not None or order_id is not None:
        stmt = stmt.join(CookingStatusHistory.status_to_plate)
        if plate_id is not None:
            stmt = stmt.where(PlateForOrder.plate_id == plate_id)
        if order_id is not None:
            stmt = stmt.where(PlateForOrder.order_id == order_id)

    if start_date:
        stmt = stmt.where(CookingStatusHistory.change_time >= start_date)
    if end_date:
        stmt = stmt.where(CookingStatusHistory.change_time <= end_date)
    if change_by is not None:
        stmt = stmt.where(CookingStatusHistory.change_by == change_by)
    if new_status is not None:
        stmt = stmt.where(CookingStatusHistory.new_status == new_status)

    stmt = stmt.order_by(CookingStatusHistory.change_time.desc())

    result = await db.execute(stmt)
    items = result.scalars().all()

    response = []
    for item in items:
        plate_for_order = item.status_to_plate
        plate_name = plate_for_order.plate.name if plate_for_order and plate_for_order.plate else None
        order_id = plate_for_order.order_of_plate.id if plate_for_order and plate_for_order.order_of_plate else None
        order_number = f"Заказ #{order_id}" if order_id else None

        user_name = None
        if item.change_by:
            user = await db.get(User, item.change_by)
            user_name = user.name if user else None

        response.append(CookingStatusHistoryResponse(
            id=item.id,
            change_time=item.change_time,
            new_status=item.new_status,
            change_by=item.change_by,
            plate_name=plate_name,
            user_name=user_name,
            order_id=order_id,
            order_number=order_number
        ))

    return response

@router.get("/{history_id}", response_model=CookingStatusHistoryResponse)
async def get_cooking_status_history(history_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить запись истории статуса по ID (ID = plate_for_order_id)"""
    stmt = select(CookingStatusHistory).where(CookingStatusHistory.id == history_id).options(
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.plate),
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.order_of_plate)
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Запись истории не найдена")

    plate_for_order = item.status_to_plate
    plate_name = plate_for_order.plate.name if plate_for_order and plate_for_order.plate else None
    order_id = plate_for_order.order_of_plate.id if plate_for_order and plate_for_order.order_of_plate else None
    order_number = f"Заказ #{order_id}" if order_id else None

    user_name = None
    if item.change_by:
        user = await db.get(User, item.change_by)
        user_name = user.name if user else None

    return CookingStatusHistoryResponse(
        id=item.id,
        change_time=item.change_time,
        new_status=item.new_status,
        change_by=item.change_by,
        plate_name=plate_name,
        user_name=user_name,
        order_id=order_id,
        order_number=order_number
    )

@router.post("/", response_model=CookingStatusHistoryResponse)
async def create_cooking_status_history(history_data: CookingStatusHistoryCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Создать запись истории изменения статуса"""
    plate_for_order = await db.get(PlateForOrder, history_data.plate_for_order_id)
    if not plate_for_order:
        raise HTTPException(status_code=404, detail="Позиция в заказе не найдена")

    if history_data.change_by:
        user = await db.get(User, history_data.change_by)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

    history_item = CookingStatusHistory(
        ordered_plate=history_data.plate_for_order_id,
        change_time=datetime.now(),
        new_status=history_data.new_status,
        change_by=history_data.change_by
    )
    db.add(history_item)
    await db.commit()
    await db.refresh(history_item)

    await db.refresh(history_item, attribute_names=["status_to_plate"])
    if history_item.status_to_plate:
        await db.refresh(history_item.status_to_plate, attribute_names=["plate", "order_of_plate"])

    await manager.broadcast_to_role({
        "type": "plate_status_changed",
        "plate_id": history_item.ordered_plate,
        "new_status": history_item.new_status,
        "order_id": order_id,
    }, "waiter")

    await manager.broadcast_to_role({
        "type": "plate_status_changed",
        "plate_id": history_item.ordered_plate,
        "new_status": history_item.new_status,
        "order_id": order_id,
    }, "admin")

    await manager.broadcast_to_role({
        "type": "plate_status_changed",
        "plate_id": history_item.ordered_plate,
        "new_status": history_item.new_status,
        "order_id": order_id,
    }, "cook")

    await manager.broadcast_to_role({
        "type": "plate_status_changed",
        "plate_id": history_item.ordered_plate,
        "new_status": history_item.new_status,
        "order_id": order_id,
    }, "superadmin")

    plate_for_order = history_item.status_to_plate
    plate_name = plate_for_order.plate.name if plate_for_order and plate_for_order.plate else None
    order_id = plate_for_order.order_of_plate.id if plate_for_order and plate_for_order.order_of_plate else None
    order_number = f"Заказ #{order_id}" if order_id else None

    user_name = None
    if history_data.change_by:
        user = await db.get(User, history_data.change_by)
        user_name = user.name if user else None

    return CookingStatusHistoryResponse(
        id=history_item.id,
        change_time=history_item.change_time,
        new_status=history_item.new_status,
        change_by=history_item.change_by,
        plate_name=plate_name,
        user_name=user_name,
        order_id=order_id,
        order_number=order_number
    )

@router.delete("/rollback/{plate_for_order_id}")
async def rollback_status(
    plate_for_order_id: int,
    expected_current_status: str = Query(..., description="Ожидаемый текущий статус"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    lock_key = hash(f"plate_rollback:{plate_for_order_id}") % 2_147_483_647
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

    stmt = select(CookingStatusHistory).where(
        CookingStatusHistory.ordered_plate == plate_for_order_id
    ).order_by(CookingStatusHistory.change_time.desc())
    result = await db.execute(stmt)
    history_records = result.scalars().all()

    if not history_records:
        raise HTTPException(status_code=404, detail="История статусов не найдена")

    last_record = history_records[0]
    if last_record.new_status not in ("preparing", "ready"):
        raise HTTPException(status_code=400, detail="Откат возможен только со статусов 'preparing' или 'ready'")

    if last_record.new_status != expected_current_status:
        raise HTTPException(status_code=409, detail="Статус уже откачен другим пользователем")

    await db.delete(last_record)
    await db.commit()

    await manager.broadcast_to_role({"type": "plate_status_changed"}, "admin")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "superadmin")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "cook")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "waiter")

    plate_for_order = await db.get(PlateForOrder, plate_for_order_id)
    if plate_for_order:
        if len(history_records) > 1:
            previous_record = history_records[1]
            plate_for_order.current_status = previous_record.new_status
        else:
            plate_for_order.current_status = "waiting"
        await db.commit()

    order_id_result = await db.execute(
        select(PlateForOrder.order_id).where(PlateForOrder.id == plate_for_order_id)
    )
    order_id = order_id_result.scalar_one_or_none()

    cooks_to_notify = await get_cooks_to_notify(order_id, db)
    if cooks_to_notify:
        await manager.broadcast_to_users({
            "type": "plate_status_changed",
            "message": "Статус блюда изменен"
        }, list(cooks_to_notify))

    return {"message": "Последний статус успешно отменён", "new_status": plate_for_order.current_status if plate_for_order else None}

@router.put("/{history_id}", response_model=CookingStatusHistoryResponse)
async def update_cooking_status_history(history_id: int, history_data: CookingStatusHistoryUpdate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Обновить запись истории статуса"""
    item = await db.get(CookingStatusHistory, history_id)
    if not item:
        raise HTTPException(status_code=404, detail="Запись истории не найдена")

    if history_data.new_status is not None:
        item.new_status = history_data.new_status
    if history_data.change_by is not None:
        user = await db.get(User, history_data.change_by)
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        item.change_by = history_data.change_by

    await db.commit()
    await db.refresh(item)

    await db.refresh(item, attribute_names=["status_to_plate"])
    if item.status_to_plate:
        await db.refresh(item.status_to_plate, attribute_names=["plate", "order_of_plate"])

    await manager.broadcast_to_role({"type": "plate_status_changed"}, "admin")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "superadmin")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "cook")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "waiter")

    plate_for_order = item.status_to_plate
    plate_name = plate_for_order.plate.name if plate_for_order and plate_for_order.plate else None
    order_id = plate_for_order.order_of_plate.id if plate_for_order and plate_for_order.order_of_plate else None
    order_number = f"Заказ #{order_id}" if order_id else None

    user_name = None
    if item.change_by:
        user = await db.get(User, item.change_by)
        user_name = user.name if user else None

    return CookingStatusHistoryResponse(
        id=item.id,
        change_time=item.change_time,
        new_status=item.new_status,
        change_by=item.change_by,
        plate_name=plate_name,
        user_name=user_name,
        order_id=order_id,
        order_number=order_number
    )

@router.delete("/{history_id}")
async def delete_cooking_status_history(history_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Удалить запись истории статуса"""
    item = await db.get(CookingStatusHistory, history_id)
    if not item:
        raise HTTPException(status_code=404, detail="Запись истории не найдена")

    await db.delete(item)
    await db.commit()
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "admin")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "superadmin")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "cook")
    await manager.broadcast_to_role({"type": "plate_status_changed"}, "waiter")
    return {"message": "Запись истории удалена"}

@router.get("/plate/{plate_id}", response_model=List[CookingStatusHistoryResponse])
async def get_history_by_plate(plate_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить историю статусов для блюда"""
    plate = await db.get(Menu, plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    stmt = select(CookingStatusHistory).join(
        CookingStatusHistory.status_to_plate
    ).where(PlateForOrder.plate_id == plate_id).options(
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.order_of_plate)
    ).order_by(CookingStatusHistory.change_time.desc())

    result = await db.execute(stmt)
    items = result.scalars().all()

    response = []
    for item in items:
        plate_for_order = item.status_to_plate
        order_id = plate_for_order.order_of_plate.id if plate_for_order and plate_for_order.order_of_plate else None
        order_number = f"Заказ #{order_id}" if order_id else None

        user_name = None
        if item.change_by:
            user = await db.get(User, item.change_by)
            user_name = user.name if user else None

        response.append(CookingStatusHistoryResponse(
            id=item.id,
            change_time=item.change_time,
            new_status=item.new_status,
            change_by=item.change_by,
            plate_name=plate.name,
            user_name=user_name,
            order_id=order_id,
            order_number=order_number
        ))

    return response

@router.get("/order/{order_id}", response_model=List[CookingStatusHistoryResponse])
async def get_history_by_order(order_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить историю статусов для заказа"""
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    stmt = select(CookingStatusHistory).join(
        CookingStatusHistory.status_to_plate
    ).where(PlateForOrder.order_id == order_id).options(
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.plate)
    ).order_by(CookingStatusHistory.change_time.desc())

    result = await db.execute(stmt)
    items = result.scalars().all()

    response = []
    for item in items:
        plate_for_order = item.status_to_plate
        plate_name = plate_for_order.plate.name if plate_for_order and plate_for_order.plate else None

        user_name = None
        if item.change_by:
            user = await db.get(User, item.change_by)
            user_name = user.name if user else None

        response.append(CookingStatusHistoryResponse(
            id=item.id,
            change_time=item.change_time,
            new_status=item.new_status,
            change_by=item.change_by,
            plate_name=plate_name,
            user_name=user_name,
            order_id=order_id,
            order_number=f"Заказ #{order_id}"
        ))

    return response

@router.get("/user/{user_id}", response_model=List[CookingStatusHistoryResponse])
async def get_history_by_user(user_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить историю статусов, измененных пользователем"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    stmt = select(CookingStatusHistory).where(CookingStatusHistory.change_by == user_id).options(
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.plate),
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.order_of_plate)
    ).order_by(CookingStatusHistory.change_time.desc())

    result = await db.execute(stmt)
    items = result.scalars().all()

    response = []
    for item in items:
        plate_for_order = item.status_to_plate
        plate_name = plate_for_order.plate.name if plate_for_order and plate_for_order.plate else None
        order_id = plate_for_order.order_of_plate.id if plate_for_order and plate_for_order.order_of_plate else None
        order_number = f"Заказ #{order_id}" if order_id else None

        response.append(CookingStatusHistoryResponse(
            id=item.id,
            change_time=item.change_time,
            new_status=item.new_status,
            change_by=item.change_by,
            plate_name=plate_name,
            user_name=user.name,
            order_id=order_id,
            order_number=order_number
        ))

    return response

@router.get("/latest/plate/{plate_id}", response_model=CookingStatusHistoryResponse)
async def get_latest_status_for_plate(plate_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить последний статус для блюда"""
    plate = await db.get(Menu, plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    stmt = select(CookingStatusHistory).join(
        CookingStatusHistory.status_to_plate
    ).where(PlateForOrder.plate_id == plate_id).options(
        selectinload(CookingStatusHistory.status_to_plate).selectinload(PlateForOrder.order_of_plate)
    ).order_by(CookingStatusHistory.change_time.desc()).limit(1)

    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="История статусов для этого блюда не найдена")

    plate_for_order = item.status_to_plate
    order_id = plate_for_order.order_of_plate.id if plate_for_order and plate_for_order.order_of_plate else None
    order_number = f"Заказ #{order_id}" if order_id else None

    user_name = None
    if item.change_by:
        user = await db.get(User, item.change_by)
        user_name = user.name if user else None

    return CookingStatusHistoryResponse(
        id=item.id,
        change_time=item.change_time,
        new_status=item.new_status,
        change_by=item.change_by,
        plate_name=plate.name,
        user_name=user_name,
        order_id=order_id,
        order_number=order_number
    )