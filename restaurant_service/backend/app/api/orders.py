from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from datetime import datetime
from typing import List, Optional

from app.database import get_async_db
from app.db_models import Order, User, Table, Menu, PlateForOrder, TableForOrder
from app.db_models.cooking_history import CookingStatusHistory
from app.schemas.orders_schemas import *

router = APIRouter(prefix="/orders", tags=["Заказы"])

@router.get("/", response_model=List[OrderResponse])
async def get_all_orders(
    status: Optional[str] = None,
    waiter_id: Optional[int] = None,
    db: AsyncSession = Depends(get_async_db)
):
    stmt = select(Order).options(
        selectinload(Order.waiter_user),
        selectinload(Order.tables).selectinload(TableForOrder.table_for_order),
        selectinload(Order.plates).selectinload(PlateForOrder.menu_item),
        selectinload(Order.plates).selectinload(PlateForOrder.statuses_of_plate)
    )
    if status:
        stmt = stmt.where(Order.status == status)
    if waiter_id:
        stmt = stmt.where(Order.waiter == waiter_id)
    stmt = stmt.order_by(Order.timestart.desc())
    result = await db.execute(stmt)
    orders = result.scalars().all()

    response = []
    for order in orders:
        table_numbers = [link.table_for_order.number for link in order.tables if link.table_for_order]
        plates_resp = []
        for plate in order.plates:
            current_status = plate.statuses_of_plate.new_status if plate.statuses_of_plate else None
            plates_resp.append(PlateInOrderResponse(
                id=plate.id,
                plate_id=plate.plate_id,
                count=plate.count,
                comment=plate.comment,
                current_status=current_status,
                price=plate.price,
                plate_name=plate.menu_item.name if plate.menu_item else None
            ))
        response.append(OrderResponse(
            id=order.id,
            waiter=order.waiter,
            status=order.status,
            timestart=order.timestart,
            endtime=order.endtime,
            waiter_name=order.waiter_user.name if order.waiter_user else None,
            table_numbers=table_numbers,
            plates=plates_resp
        ))
    return response

@router.get("/active", response_model=List[OrderResponse])
async def get_active_orders(db: AsyncSession = Depends(get_async_db)):
    return await get_all_orders(status="active", db=db)

@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, db: AsyncSession = Depends(get_async_db)):
    stmt = select(Order).where(Order.id == order_id).options(
        selectinload(Order.waiter_user),
        selectinload(Order.tables).selectinload(TableForOrder.table_for_order),
        selectinload(Order.plates).selectinload(PlateForOrder.menu_item),
        selectinload(Order.plates).selectinload(PlateForOrder.statuses_of_plate)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    table_numbers = [link.table_for_order.number for link in order.tables if link.table_for_order]
    plates_resp = []
    for plate in order.plates:
        current_status = plate.statuses_of_plate.new_status if plate.statuses_of_plate else None
        plates_resp.append(PlateInOrderResponse(
            id=plate.id,
            plate_id=plate.plate_id,
            count=plate.count,
            comment=plate.comment,
            current_status=current_status,
            price=plate.price,
            plate_name=plate.menu_item.name if plate.menu_item else None
        ))
    return OrderResponse(
        id=order.id,
        waiter=order.waiter,
        status=order.status,
        timestart=order.timestart,
        endtime=order.endtime,
        waiter_name=order.waiter_user.name if order.waiter_user else None,
        table_numbers=table_numbers,
        plates=plates_resp
    )

@router.post("/", response_model=OrderResponse)
async def create_order(order_data: OrderCreate, db: AsyncSession = Depends(get_async_db)):
    waiter = await db.get(User, order_data.waiter)
    if not waiter:
        raise HTTPException(status_code=404, detail="Официант не найден")

    tables_stmt = select(Table).where(Table.id.in_(order_data.tables))
    tables_result = await db.execute(tables_stmt)
    tables = tables_result.scalars().all()
    if len(tables) != len(order_data.tables):
        raise HTTPException(status_code=404, detail="Один или несколько столов не найдены")
    occupied_tables = [t for t in tables if t.status != "free"]
    if occupied_tables:
        raise HTTPException(status_code=400, detail=f"Столы {[t.number for t in occupied_tables]} заняты")

    plate_ids = [p.plate_id for p in order_data.plates]
    dishes_stmt = select(Menu).where(Menu.id.in_(plate_ids))
    dishes_result = await db.execute(dishes_stmt)
    dishes = dishes_result.scalars().all()
    if len(dishes) != len(plate_ids):
        raise HTTPException(status_code=404, detail="Одно или несколько блюд не найдены")
    dishes_dict = {d.id: d for d in dishes}

    # Создание заказа
    timestart = order_data.timestart or datetime.utcnow()
    order = Order(
        waiter=order_data.waiter,
        status=order_data.status,
        timestart=timestart,
        endtime=None
    )
    db.add(order)
    await db.flush()

    for table in tables:
        db.add(TableForOrder(order=order.id, table=table.id))
        table.status = "occupied"

    for plate_data in order_data.plates:
        dish = dishes_dict[plate_data.plate_id]
        price = dish.price if dish.price else 0.0
        plate = PlateForOrder(
            order_id=order.id,
            plate_id=plate_data.plate_id,
            count=plate_data.count,
            comment=plate_data.comment,
            price=price
        )
        db.add(plate)
        await db.flush()

        status_history = CookingStatusHistory(
            id=plate.id,
            change_time=datetime.utcnow(),
            new_status=plate_data.initial_status,
            change_by=order_data.waiter
        )
        db.add(status_history)

    await db.commit()
    await db.refresh(order, attribute_names=["waiter_user", "tables", "plates"])
    return await get_order(order.id, db)

@router.put("/{order_id}", response_model=OrderResponse)
async def update_order(order_id: int, order_data: OrderUpdate, db: AsyncSession = Depends(get_async_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order_data.status is not None:
        order.status = order_data.status
    if order_data.endtime is not None:
        order.endtime = order_data.endtime
    await db.commit()
    await db.refresh(order)
    return await get_order(order.id, db)

@router.put("/{order_id}/complete")
async def complete_order(order_id: int, db: AsyncSession = Depends(get_async_db)):
    order = await db.get(Order, order_id, options=[selectinload(Order.tables).selectinload(TableForOrder.table_for_order)])
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    order.status = "completed"
    order.endtime = datetime.utcnow()
    for link in order.tables:
        if link.table_for_order:
            link.table_for_order.status = "free"
    await db.commit()
    return {"message": "Заказ завершён"}

@router.put("/plate/{plate_id}/status/{status}")
async def update_plate_status(plate_id: int, status: str, db: AsyncSession = Depends(get_async_db)):
    allowed_statuses = ["waiting", "preparing", "ready", "served"]
    if status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Недопустимый статус. Допустимые: {', '.join(allowed_statuses)}")

    plate = await db.get(PlateForOrder, plate_id, options=[selectinload(PlateForOrder.statuses_of_plate)])
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо в заказе не найдено")

    if plate.statuses_of_plate:
        plate.statuses_of_plate.new_status = status
        plate.statuses_of_plate.change_time = datetime.utcnow()
    else:
        history = CookingStatusHistory(
            id=plate.id,
            change_time=datetime.utcnow(),
            new_status=status,
            change_by=None
        )
        db.add(history)
    await db.commit()
    return {"message": f"Статус блюда изменён на {status}"}

@router.delete("/{order_id}")
async def delete_order(order_id: int, db: AsyncSession = Depends(get_async_db)):
    order = await db.get(Order, order_id, options=[selectinload(Order.tables).selectinload(TableForOrder.table_for_order)])
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    for link in order.tables:
        if link.table_for_order:
            link.table_for_order.status = "free"
    await db.delete(order)
    await db.commit()
    return {"message": "Заказ удалён"}

@router.post("/{order_id}/plates", response_model=PlateInOrderResponse)
async def add_plate_to_order(order_id: int, plate_data: PlateInOrderCreate, db: AsyncSession = Depends(get_async_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя добавлять блюда в завершённый или отменённый заказ")

    dish = await db.get(Menu, plate_data.plate_id)
    if not dish:
        raise HTTPException(status_code=404, detail="Блюдо не найдено в меню")

    price = dish.price if dish.price else 0.0
    plate = PlateForOrder(
        order_id=order_id,
        plate_id=plate_data.plate_id,
        count=plate_data.count,
        comment=plate_data.comment,
        price=price
    )
    db.add(plate)
    await db.flush()

    history = CookingStatusHistory(
        id=plate.id,
        change_time=datetime.utcnow(),
        new_status=plate_data.initial_status,
        change_by=None
    )
    db.add(history)
    await db.commit()
    await db.refresh(plate, attribute_names=["menu_item", "statuses_of_plate"])

    current_status = plate.statuses_of_plate.new_status if plate.statuses_of_plate else None
    return PlateInOrderResponse(
        id=plate.id,
        plate_id=plate.plate_id,
        count=plate.count,
        comment=plate.comment,
        current_status=current_status,
        price=plate.price,
        plate_name=plate.menu_item.name if plate.menu_item else None
    )

@router.put("/plates/{plate_id}", response_model=PlateInOrderResponse)
async def update_plate_in_order(plate_id: int, plate_data: PlateInOrderUpdate, db: AsyncSession = Depends(get_async_db)):
    plate = await db.get(PlateForOrder, plate_id, options=[
        selectinload(PlateForOrder.menu_item),
        selectinload(PlateForOrder.order),
        selectinload(PlateForOrder.statuses_of_plate)
    ])
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо в заказе не найдено")
    if plate.order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя изменять блюда в завершённом или отменённом заказе")

    if plate_data.count is not None:
        plate.count = plate_data.count
    if plate_data.comment is not None:
        plate.comment = plate_data.comment
    if plate_data.price is not None:
        plate.price = plate_data.price
    if plate_data.new_status is not None:
        allowed_statuses = ["waiting", "preparing", "ready", "served"]
        if plate_data.new_status not in allowed_statuses:
            raise HTTPException(status_code=400, detail=f"Недопустимый статус. Допустимые: {', '.join(allowed_statuses)}")
        if plate.statuses_of_plate:
            plate.statuses_of_plate.new_status = plate_data.new_status
            plate.statuses_of_plate.change_time = datetime.utcnow()
        else:
            history = CookingStatusHistory(
                id=plate.id,
                change_time=datetime.utcnow(),
                new_status=plate_data.new_status,
                change_by=None
            )
            db.add(history)

    await db.commit()
    await db.refresh(plate)
    current_status = plate.statuses_of_plate.new_status if plate.statuses_of_plate else None
    return PlateInOrderResponse(
        id=plate.id,
        plate_id=plate.plate_id,
        count=plate.count,
        comment=plate.comment,
        current_status=current_status,
        price=plate.price,
        plate_name=plate.menu_item.name if plate.menu_item else None
    )

@router.delete("/plates/{plate_id}")
async def delete_plate_from_order(plate_id: int, db: AsyncSession = Depends(get_async_db)):
    plate = await db.get(PlateForOrder, plate_id, options=[selectinload(PlateForOrder.order)])
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо в заказе не найдено")
    if plate.order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя удалять блюда из завершённого или отменённого заказа")

    await db.delete(plate)
    await db.commit()
    return {"message": "Блюдо удалено из заказа"}