from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, text, exists, and_, desc
from sqlalchemy.orm import selectinload
from datetime import datetime
from typing import List, Optional

from app.database import get_async_db
from app.db_models import Order, User, Table, Menu, PlateForOrder, TableForOrder, CookingStatusHistory, PlatesForSpecialization, CooksInGroup
from app.db_models.user_roles import Role
from app.schemas.orders_schemas import *
from app.core.security import get_current_user
from app.websocket.manager import manager

router = APIRouter(prefix="/orders", tags=["Заказы"])

def get_current_status(plate: PlateForOrder):
    if plate.statuses_of_plate:
        sorted_statuses = sorted(plate.statuses_of_plate, key=lambda x: x.change_time)
        return sorted_statuses[-1].new_status
    return None

async def get_cooks_to_notify(order_id: int, db: AsyncSession, plates_for_first_course: Optional[List[int]] = None):
    """
    Возвращает список id поваров, у которых в специализациях есть блюда из заказа (order_id).
    Блюда с is_selfserve=True игнорируются.
    """
    stmt = select(Order).where(Order.id == order_id).options(
        selectinload(Order.plates).selectinload(PlateForOrder.menu_item)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order or not order.plates:
        return set()

    if plates_for_first_course is not None:
        plate_ids = []
        for p in order.plates:
            if p.id in plates_for_first_course:
                if not (p.menu_item and p.menu_item.is_selfserve):
                    plate_ids.append(p.plate_id)
    else:
        plate_ids = [
            p.plate_id for p in order.plates
            if not (p.menu_item and p.menu_item.is_selfserve)
        ]

    if not plate_ids:
        return set()

    stmt = (
        select(PlatesForSpecialization.specialization)
        .where(PlatesForSpecialization.plate.in_(plate_ids))
        .distinct()
    )
    result = await db.execute(stmt)
    spec_ids = {row[0] for row in result}
    if not spec_ids:
        return set()

    stmt = (
        select(User.id)
        .join(User.role_of_user)
        .where(Role.name == "cook", User.specialization.in_(spec_ids))
    )
    result = await db.execute(stmt)
    direct_cook_ids = {row[0] for row in result}
    if not direct_cook_ids:
        return set()

    stmt = (
        select(CooksInGroup.group)
        .where(CooksInGroup.cook.in_(direct_cook_ids))
        .distinct()
    )
    result = await db.execute(stmt)
    group_ids = {row[0] for row in result}
    if not group_ids:
        return direct_cook_ids

    stmt = (
        select(User.id)
        .join(CooksInGroup, User.id == CooksInGroup.cook)
        .join(User.role_of_user)
        .where(CooksInGroup.group.in_(group_ids), Role.name == "cook")
    )
    result = await db.execute(stmt)
    group_cook_ids = {row[0] for row in result}

    return direct_cook_ids.union(group_cook_ids)

@router.get("/", response_model=List[OrderResponse])
async def get_all_orders(
    status: Optional[str] = None,
    waiter_id: Optional[int] = None,
    table_id: Optional[int] = None,
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
    if table_id is not None:
        stmt = stmt.join(Order.tables).where(TableForOrder.table == table_id)
    stmt = stmt.order_by(Order.timestart.desc())
    result = await db.execute(stmt)
    orders = result.scalars().all()

    response = []
    for order in orders:
        table_numbers = [link.table_for_order.number for link in order.tables if link.table_for_order]
        plates_resp = []
        for plate in order.plates:
            plates_resp.append(PlateInOrderResponse(
                id=plate.id,
                plate_id=plate.plate_id,
                count=plate.count,
                comment=plate.comment,
                current_status=get_current_status(plate),
                price=plate.price,
                plate_name=plate.menu_item.name if plate.menu_item else None,
                course_number=plate.course_number,
                is_selfserve=plate.menu_item.is_selfserve if plate.menu_item else False
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


@router.get("/{cook_id}/active-tasks")
async def get_active_tasks(cook_id: int, db: AsyncSession = Depends(get_async_db)):
    """
    Возвращает список позиций заказа, которые в данный момент готовятся указанным поваром.
    Статус последней записи в истории для позиции должен быть "preparing",
    и change_by == cook_id.
    """
    subq = (
        select(
            CookingStatusHistory.ordered_plate,
            CookingStatusHistory.new_status,
            CookingStatusHistory.change_time,
            CookingStatusHistory.change_by
        )
        .distinct(CookingStatusHistory.ordered_plate)
        .order_by(CookingStatusHistory.ordered_plate, desc(CookingStatusHistory.change_time))
        .subquery()
    )

    stmt = (
        select(PlateForOrder.id, PlateForOrder.plate_id, subq.c.change_time)
        .join(subq, PlateForOrder.id == subq.c.ordered_plate)
        .where(
            subq.c.new_status == "preparing",
            subq.c.change_by == cook_id
        )
    )

    result = await db.execute(stmt)
    rows = result.all()

    tasks = []
    for row in rows:
        tasks.append({
            "plate_order_id": row.id,
            "plate_id": row.plate_id,
            "started_at": row.change_time.isoformat() if row.change_time else None
        })

    return tasks

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
        plates_resp.append(PlateInOrderResponse(
            id=plate.id,
            plate_id=plate.plate_id,
            count=plate.count,
            comment=plate.comment,
            current_status=get_current_status(plate),
            price=plate.price,
            plate_name=plate.menu_item.name if plate.menu_item else None,
            course_number=plate.course_number,
            is_selfserve=plate.menu_item.is_selfserve if plate.menu_item else False
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
async def create_order(
    order_data: OrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    tables_sorted = sorted(order_data.tables)

    if tables_sorted:
        lock_key = hash(f"tables:{','.join(map(str, tables_sorted))}") % 2_147_483_647
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

    if tables_sorted:
        conflict_stmt = select(exists().where(
            and_(
                Order.status == "active",
                TableForOrder.table.in_(tables_sorted),
                TableForOrder.order == Order.id
            )
        ))
        result = await db.execute(conflict_stmt)
        if result.scalar():
            raise HTTPException(status_code=409, detail="Один или несколько столов уже заняты активным заказом")
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

    timestart = order_data.timestart or datetime.now()
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

    first_plates = []
    for plate_data in order_data.plates:
        dish = dishes_dict[plate_data.plate_id]
        price = dish.price if dish.price else 0.0
        plate = PlateForOrder(
            order_id=order.id,
            plate_id=plate_data.plate_id,
            count=plate_data.count,
            comment=plate_data.comment,
            price=price,
            course_number=plate_data.course_number
        )
        db.add(plate)
        await db.flush()

        if not dish.is_selfserve and plate.course_number == 1:
            history = CookingStatusHistory(
                change_time=datetime.now(),
                new_status=plate_data.initial_status,
                change_by=current_user.id,
                ordered_plate=plate.id
            )
            db.add(history)
            first_plates.append(plate)

    await db.commit()
    await db.refresh(order, attribute_names=["waiter_user", "tables", "plates"])
    await manager.broadcast_to_role({
        "type": "order_created",
        "message": f"Создан заказ официантом {order_data.waiter}"
    }, "waiter")
    await manager.broadcast_to_role({
        "type": "order_created",
        "message": f"Создан заказ официантом {order_data.waiter}"
    }, "admin")

    if first_plates:
        first_plate_ids = [p.id for p in first_plates]
        cooks_to_notify = await get_cooks_to_notify(order.id, db, plates_for_first_course=first_plate_ids)
        if cooks_to_notify:
            await manager.broadcast_to_users({
                "type": "new_order",
                "order_id": order.id,
                "message": "Поступил новый заказ"
            }, list(cooks_to_notify))
    return await get_order(order.id, db)

@router.post("/{order_id}/activate-next-course")
async def activate_next_course(
    order_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Order).where(Order.id == order_id).options(
        selectinload(Order.plates).selectinload(PlateForOrder.statuses_of_plate),
        selectinload(Order.plates).selectinload(PlateForOrder.menu_item)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order.status != "active":
        raise HTTPException(status_code=400, detail="Заказ не активен")

    max_activated = 0
    for plate in order.plates:
        if plate.menu_item and plate.menu_item.is_selfserve:
            continue
        if plate.statuses_of_plate:
            if plate.course_number > max_activated:
                max_activated = plate.course_number

    next_course = max_activated + 1

    next_course_plates = [p for p in order.plates if p.course_number == next_course]
    if not next_course_plates:
        raise HTTPException(status_code=400, detail="Все курсы уже активированы или следующий курс отсутствует")

    for plate in next_course_plates:
        if plate.menu_item and plate.menu_item.is_selfserve:
            continue
        history = CookingStatusHistory(
            change_time=datetime.now(),
            new_status="waiting",
            change_by=current_user.id,
            ordered_plate=plate.id
        )
        db.add(history)

    await db.commit()

    activated_plate_ids = [p.id for p in next_course_plates if not (p.menu_item and p.menu_item.is_selfserve)]
    if activated_plate_ids:
        cooks = await get_cooks_to_notify(order.id, db, plates_for_first_course=activated_plate_ids)
        if cooks:
            await manager.broadcast_to_users({
                "type": "new_order",
                "order_id": order.id,
                "message": f"Активирован курс {next_course}"
            }, list(cooks))

    return {"message": f"Курс {next_course} отправлен на кухню", "course": next_course}

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
    await manager.broadcast_to_role({
        "type": "order_updated",
        "message": f"Обновлен заказ официантом {order_data.waiter}"
    }, "waiter")
    await manager.broadcast_to_role({
        "type": "order_updated",
        "message": f"Обновлен заказ официантом {order_data.waiter}"
    }, "admin")

    cooks_to_notify = await get_cooks_to_notify(order_id, db)
    if cooks_to_notify:
        await manager.broadcast_to_users({
            "type": "order_updated",
            "order_id": order_id,
            "message": "Состав заказа изменён"
        }, list(cooks_to_notify))
    return await get_order(order.id, db)

@router.put("/{order_id}/complete")
async def complete_order(order_id: int, db: AsyncSession = Depends(get_async_db)):
    order = await db.get(Order, order_id, options=[selectinload(Order.tables).selectinload(TableForOrder.table_for_order)])
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    order.status = "completed"
    order.endtime = datetime.now()
    for link in order.tables:
        if link.table_for_order:
            link.table_for_order.status = "free"
    await db.commit()
    await manager.broadcast_to_role({
        "type": "order_completed",
        "order_id": order.id,
        "message": "Заказ завершён"
    }, "waiter")
    await manager.broadcast_to_role({
        "type": "order_completed",
        "order_id": order.id,
        "message": "Заказ завершён"
    }, "admin")
    return {"message": "Заказ завершён"}

@router.put("/plate/{plate_id}/status/{status}")
async def update_plate_status(
    plate_id: int,
    status: str,
    change_by: Optional[int] = None,
    db: AsyncSession = Depends(get_async_db)
):
    allowed_statuses = ["waiting", "preparing", "ready", "served"]
    if status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Недопустимый статус. Допустимые: {', '.join(allowed_statuses)}")

    lock_key = hash(f"plate_status:{plate_id}") % 2_147_483_647
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

    stmt = select(PlateForOrder).where(PlateForOrder.id == plate_id).options(
        selectinload(PlateForOrder.statuses_of_plate).selectinload(CookingStatusHistory.status_to_plate),
        selectinload(PlateForOrder.order),
        selectinload(PlateForOrder.menu_item)
    )
    result = await db.execute(stmt)
    plate = result.scalar_one_or_none()

    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо в заказе не найдено")

    current_status = get_current_status(plate)
    if current_status == status:
        raise HTTPException(status_code=409, detail=f"Статус уже '{status}'")

    history = CookingStatusHistory(
        change_time=datetime.now(),
        new_status=status,
        change_by=change_by,
        ordered_plate=plate.id
    )
    db.add(history)
    await db.commit()

    await manager.broadcast_to_role({
        "type": "plate_status_changed",
        "plate_id": plate_id,
        "new_status": status,
        "order_id": plate.order.id if plate.order else None,
        "message": f"Статус блюда изменён на {status}"
    }, "waiter")
    await manager.broadcast_to_role({
        "type": "plate_status_changed",
        "plate_id": plate_id,
        "new_status": status,
        "order_id": plate.order.id if plate.order else None,
        "message": f"Статус блюда изменён на {status}"
    }, "admin")

    cooks_to_notify = await get_cooks_to_notify(plate.order.id, db)
    if cooks_to_notify:
        await manager.broadcast_to_users({
            "type": "plate_status_changed",
            "plate_id": plate_id,
            "new_status": status,
            "order_id": plate.order.id,
            "message": f"Статус блюда изменён на {status}"
        }, list(cooks_to_notify))

    if status == "ready" and plate.order:
        await manager.send_personal_message({
            "type": "plate_ready",
            "plate_name": plate.menu_item.name if plate.menu_item else "Блюдо",
            "order_id": plate.order.id,
            "message": "Блюдо готово к подаче"
        }, plate.order.waiter)

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
async def add_plate_to_order(
    order_id: int,
    plate_data: PlateInOrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя добавлять блюда в завершённый или отменённый заказ")

    dish = await db.get(Menu, plate_data.plate_id)
    if not dish:
        raise HTTPException(status_code=404, detail="Блюдо не найдено в меню")

    stmt = select(PlateForOrder).where(PlateForOrder.order_id == order_id).options(
        selectinload(PlateForOrder.statuses_of_plate),
        selectinload(PlateForOrder.menu_item)
    )
    result = await db.execute(stmt)
    existing_plates = result.scalars().all()

    max_activated = 0
    for ep in existing_plates:
        if ep.menu_item and ep.menu_item.is_selfserve:
            continue
        if ep.statuses_of_plate:
            if ep.course_number > max_activated:
                max_activated = ep.course_number

    price = dish.price if dish.price else 0.0
    plate = PlateForOrder(
        order_id=order_id,
        plate_id=plate_data.plate_id,
        count=plate_data.count,
        comment=plate_data.comment,
        price=price,
        course_number=plate_data.course_number
    )
    db.add(plate)
    await db.flush()

    if not dish.is_selfserve and plate.course_number <= max_activated:
        history = CookingStatusHistory(
            change_time=datetime.now(),
            new_status=plate_data.initial_status,
            change_by=current_user.id,
            ordered_plate=plate.id
        )
        db.add(history)

    await db.commit()
    await db.refresh(plate, attribute_names=["menu_item", "statuses_of_plate"])

    if not dish.is_selfserve and plate.course_number <= max_activated:
        cooks_to_notify = await get_cooks_to_notify(order.id, db, plates_for_first_course=[plate.id])
        if cooks_to_notify:
            plate_name = plate.menu_item.name if plate.menu_item else "Блюдо"
            await manager.broadcast_to_users({
                "type": "new_order",
                "order_id": order.id,
                "message": f"Добавлено блюдо «{plate_name}» (курс {plate.course_number})"
            }, list(cooks_to_notify))

    return PlateInOrderResponse(
        id=plate.id,
        plate_id=plate.plate_id,
        count=plate.count,
        comment=plate.comment,
        current_status=get_current_status(plate),
        price=plate.price,
        plate_name=plate.menu_item.name if plate.menu_item else None,
        course_number=plate.course_number,
        is_selfserve=dish.is_selfserve if dish else False
    )

@router.put("/plates/{plate_id}", response_model=PlateInOrderResponse)
async def update_plate_in_order(
    plate_id: int,
    plate_data: PlateInOrderUpdate,
    db: AsyncSession = Depends(get_async_db)
):
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
        history = CookingStatusHistory(
            change_time=datetime.now(),
            new_status=plate_data.new_status,
            change_by=None,
            ordered_plate=plate.id
        )
        db.add(history)

    await db.commit()
    await db.refresh(plate)
    cooks_to_notify = await get_cooks_to_notify(plate_id, db)
    if cooks_to_notify:
        await manager.broadcast_to_users({
            "type": "new_order",
            "order_id": plate_id,
            "message": "Поступил новый заказ"
        }, list(cooks_to_notify))
    return PlateInOrderResponse(
        id=plate.id,
        plate_id=plate.plate_id,
        count=plate.count,
        comment=plate.comment,
        current_status=get_current_status(plate),
        price=plate.price,
        plate_name=plate.menu_item.name if plate.menu_item else None,
        course_number=plate.course_number,
        is_selfserve=plate.menu_item.is_selfserve if plate.menu_item else False
    )

@router.put("/{order_id}/plates", response_model=OrderResponse)
async def update_order_plates(
    order_id: int,
    plates_data: List[PlateInOrderCreate],
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    order = await db.get(Order, order_id, options=[
        selectinload(Order.plates).selectinload(PlateForOrder.statuses_of_plate),
        selectinload(Order.plates).selectinload(PlateForOrder.menu_item),
        selectinload(Order.tables).selectinload(TableForOrder.table_for_order)
    ])
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя редактировать завершённый или отменённый заказ")

    max_activated = 0
    for plate in order.plates:
        if plate.menu_item and plate.menu_item.is_selfserve:
            continue
        if plate.statuses_of_plate:
            if plate.course_number > max_activated:
                max_activated = plate.course_number

    existing_plates_dict = {p.id: p for p in order.plates}
    kept_plate_ids = set()
    new_activated_plate_ids = []

    for plate_in in plates_data:
        dish = await db.get(Menu, plate_in.plate_id)
        if not dish:
            raise HTTPException(status_code=404, detail=f"Блюдо с id={plate_in.plate_id} не найдено")
        price = dish.price if dish.price else 0.0

        if plate_in.id is not None and plate_in.id in existing_plates_dict:
            existing = existing_plates_dict[plate_in.id]
            if get_current_status(existing) == "waiting":
                existing.count = plate_in.count
                existing.comment = plate_in.comment
                existing.price = price
            kept_plate_ids.add(plate_in.id)
        else:
            new_plate = PlateForOrder(
                order_id=order_id,
                plate_id=plate_in.plate_id,
                count=plate_in.count,
                comment=plate_in.comment,
                price=price,
                course_number=plate_in.course_number
            )
            db.add(new_plate)
            await db.flush()
            if not dish.is_selfserve and new_plate.course_number <= max_activated:
                history = CookingStatusHistory(
                    change_time=datetime.now(),
                    new_status=plate_in.initial_status,
                    change_by=current_user.id,
                    ordered_plate=new_plate.id
                )
                db.add(history)
                new_activated_plate_ids.append(new_plate.id)
            kept_plate_ids.add(new_plate.id)

    for plate in order.plates:
        if plate.id not in kept_plate_ids and get_current_status(plate) == "waiting":
            await db.execute(delete(CookingStatusHistory).where(CookingStatusHistory.ordered_plate == plate.id))
            await db.delete(plate)

    await db.commit()
    await db.refresh(order, attribute_names=["plates", "tables"])

    if new_activated_plate_ids:
        cooks_to_notify = await get_cooks_to_notify(order.id, db, plates_for_first_course=new_activated_plate_ids)
        if cooks_to_notify:
            await manager.broadcast_to_users({
                "type": "new_order",
                "order_id": order.id,
                "message": "Поступил новый заказ"
            }, list(cooks_to_notify))
    return await get_order(order.id, db)

@router.delete("/plates/{plate_id}")
async def delete_plate_from_order(plate_id: int, db: AsyncSession = Depends(get_async_db)):
    plate = await db.get(PlateForOrder, plate_id, options=[selectinload(PlateForOrder.order)])
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо в заказе не найдено")
    if plate.order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя удалять блюда из завершённого или отменённого заказа")
    await db.delete(plate)
    await db.commit()
    cooks_to_notify = await get_cooks_to_notify(plate_id, db)
    if cooks_to_notify:
        await manager.broadcast_to_users({
            "type": "new_order",
            "order_id": plate_id,
            "message": "Поступил новый заказ"
        }, list(cooks_to_notify))
    return {"message": "Блюдо удалено из заказа"}