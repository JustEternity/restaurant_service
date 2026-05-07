from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from sqlalchemy.orm import selectinload, aliased
from datetime import date, datetime
from typing import Optional

from app.database import get_async_db
from app.db_models import Order, PlateForOrder, CookingStatusHistory, TableForOrder, Table, Menu, User
from app.db_models.user_roles import Role

router = APIRouter(prefix="/statistics", tags=["Статистика"])

@router.get("/general")
async def general_statistics(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_async_db)
):
    start_dt = datetime(start_date.year, start_date.month, start_date.day)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)

    total_orders_stmt = select(func.count(Order.id)).where(
        Order.status == "completed",
        Order.timestart >= start_dt,
        Order.timestart <= end_dt
    )
    total_orders = (await db.execute(total_orders_stmt)).scalar() or 0

    revenue_stmt = select(func.sum(PlateForOrder.price * PlateForOrder.count)).select_from(Order).join(
        PlateForOrder, Order.id == PlateForOrder.order_id
    ).where(
        Order.status == "completed",
        Order.timestart >= start_dt,
        Order.timestart <= end_dt
    )
    total_revenue = (await db.execute(revenue_stmt)).scalar() or 0

    avg_check = total_revenue / total_orders if total_orders else 0

    total_dishes_stmt = select(func.sum(PlateForOrder.count)).select_from(Order).join(
        PlateForOrder, Order.id == PlateForOrder.order_id
    ).where(
        Order.status == "completed",
        Order.timestart >= start_dt,
        Order.timestart <= end_dt
    )
    total_dishes = (await db.execute(total_dishes_stmt)).scalar() or 0
    avg_dishes = total_dishes / total_orders if total_orders else 0

    avg_time_stmt = select(
        func.avg(
            func.extract('epoch', Order.endtime) - func.extract('epoch', Order.timestart)
        ) / 60
    ).where(
        Order.status == "completed",
        Order.timestart >= start_dt,
        Order.timestart <= end_dt
    )
    avg_time_minutes = (await db.execute(avg_time_stmt)).scalar() or 0

    return {
        "total_orders": total_orders,
        "total_revenue": float(total_revenue),
        "avg_check": float(avg_check),
        "total_dishes": int(total_dishes),
        "avg_dishes_per_order": float(avg_dishes),
        "avg_order_time_minutes": float(avg_time_minutes),
    }

@router.get("/general/tables")
async def table_order_count(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_async_db)
):
    start_dt = datetime(start_date.year, start_date.month, start_date.day)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)

    stmt = (
        select(Table.number, func.count(Order.id))
        .join(TableForOrder, Table.id == TableForOrder.table)
        .join(Order, TableForOrder.order == Order.id)
        .where(
            Order.status == "completed",
            Order.timestart >= start_dt,
            Order.timestart <= end_dt
        )
        .group_by(Table.number)
        .order_by(Table.number)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [{"table_number": row[0], "order_count": row[1]} for row in rows]

@router.get("/kitchen")
async def kitchen_statistics(
    start_date: date = Query(...),
    end_date: date = Query(...),
    cook_id: Optional[int] = Query(None),
    plate_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_async_db)
):
    start_dt = datetime(start_date.year, start_date.month, start_date.day)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)

    stmt = (
        select(
            PlateForOrder.plate_id,
            func.sum(PlateForOrder.count).label("total_cooked")
        )
        .select_from(PlateForOrder)
        .join(CookingStatusHistory, PlateForOrder.id == CookingStatusHistory.ordered_plate)
        .where(
            CookingStatusHistory.new_status == "ready",
            CookingStatusHistory.change_time >= start_dt,
            CookingStatusHistory.change_time <= end_dt
        )
    )
    if cook_id:
        stmt = stmt.where(CookingStatusHistory.change_by == cook_id)
    if plate_id:
        stmt = stmt.where(PlateForOrder.plate_id == plate_id)

    stmt = stmt.group_by(PlateForOrder.plate_id)
    result = await db.execute(stmt)
    rows = result.all()

    plate_ids = [row.plate_id for row in rows]
    menu_map = {}
    if plate_ids:
        menu_stmt = select(Menu.id, Menu.name).where(Menu.id.in_(plate_ids))
        menu_res = await db.execute(menu_stmt)
        for mid, mname in menu_res.all():
            menu_map[mid] = mname

    dishes = []
    total_cooked = 0
    for row in rows:
        count = int(row.total_cooked)
        total_cooked += count
        dishes.append({
            "plate_id": row.plate_id,
            "plate_name": menu_map.get(row.plate_id, "Неизвестно"),
            "cooked_count": count
        })

    top_dishes = sorted(dishes, key=lambda d: d["cooked_count"], reverse=True)[:3]

    return {
        "total_cooked": total_cooked,
        "top_dishes": top_dishes
    }

@router.get("/kitchen/details")
async def kitchen_detail_statistics(
    start_date: date = Query(...),
    end_date: date = Query(...),
    cook_id: Optional[int] = Query(None),
    plate_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_async_db)
):
    start_dt = datetime(start_date.year, start_date.month, start_date.day)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)

    PrepAlias = aliased(CookingStatusHistory)
    WaitAlias = aliased(CookingStatusHistory)

    prep_stmt = (
        select(
            PlateForOrder.plate_id,
            func.avg(
                func.extract('epoch', CookingStatusHistory.change_time) -
                func.extract('epoch', PrepAlias.change_time)
            ) / 60
        )
        .select_from(PlateForOrder)
        .join(PrepAlias, (PlateForOrder.id == PrepAlias.ordered_plate) & (PrepAlias.new_status == "preparing"))
        .join(CookingStatusHistory, (PlateForOrder.id == CookingStatusHistory.ordered_plate) & (CookingStatusHistory.new_status == "ready") & (CookingStatusHistory.change_time > PrepAlias.change_time))
        .where(
            PrepAlias.change_time >= start_dt,
            PrepAlias.change_time <= end_dt
        )
        .group_by(PlateForOrder.plate_id)
    )
    if plate_id:
        prep_stmt = prep_stmt.where(PlateForOrder.plate_id == plate_id)
    if cook_id:
        prep_stmt = prep_stmt.where(PrepAlias.change_by == cook_id)

    prep_result = await db.execute(prep_stmt)
    prep_rows = prep_result.all()
    avg_preparation = []
    for row in prep_rows:
        dish = await db.get(Menu, row.plate_id)
        avg_minutes = round(row[1], 1) if row[1] else 0.0
        avg_preparation.append({
            "plate_id": row.plate_id,
            "plate_name": dish.name if dish else "Неизвестно",
            "avg_minutes": avg_minutes
        })

    wait_stmt = (
        select(
            PlateForOrder.plate_id,
            func.avg(
                func.extract('epoch', PrepAlias.change_time) -
                func.extract('epoch', WaitAlias.change_time)
            ) / 60
        )
        .select_from(PlateForOrder)
        .join(WaitAlias, (PlateForOrder.id == WaitAlias.ordered_plate) & (WaitAlias.new_status == "waiting"))
        .join(PrepAlias, (PlateForOrder.id == PrepAlias.ordered_plate) & (PrepAlias.new_status == "preparing") & (PrepAlias.change_time > WaitAlias.change_time))
        .where(
            WaitAlias.change_time >= start_dt,
            WaitAlias.change_time <= end_dt
        )
        .group_by(PlateForOrder.plate_id)
    )
    if plate_id:
        wait_stmt = wait_stmt.where(PlateForOrder.plate_id == plate_id)
    if cook_id:
        wait_stmt = wait_stmt.where(WaitAlias.change_by == cook_id)

    wait_result = await db.execute(wait_stmt)
    wait_rows = wait_result.all()
    avg_waiting = []
    for row in wait_rows:
        dish = await db.get(Menu, row.plate_id)
        avg_minutes = round(row[1], 1) if row[1] else 0.0
        avg_waiting.append({
            "plate_id": row.plate_id,
            "plate_name": dish.name if dish else "Неизвестно",
            "avg_minutes": avg_minutes
        })

    freq_stmt = (
        select(
            CookingStatusHistory.change_by,
            PlateForOrder.plate_id,
            func.sum(PlateForOrder.count).label("total_cooked")
        )
        .select_from(PlateForOrder)
        .join(CookingStatusHistory, PlateForOrder.id == CookingStatusHistory.ordered_plate)
        .where(
            CookingStatusHistory.new_status == "ready",
            CookingStatusHistory.change_time >= start_dt,
            CookingStatusHistory.change_time <= end_dt
        )
        .group_by(CookingStatusHistory.change_by, PlateForOrder.plate_id)
    )
    if cook_id:
        freq_stmt = freq_stmt.where(CookingStatusHistory.change_by == cook_id)
    if plate_id:
        freq_stmt = freq_stmt.where(PlateForOrder.plate_id == plate_id)

    freq_result = await db.execute(freq_stmt)
    freq_rows = freq_result.all()
    cook_freq = []
    for row in freq_rows:
        cook = await db.get(User, row.change_by) if row.change_by else None
        dish = await db.get(Menu, row.plate_id) if row.plate_id else None
        cook_freq.append({
            "cook_id": row.change_by,
            "cook_name": cook.name if cook else "Неизвестный",
            "plate_id": row.plate_id,
            "plate_name": dish.name if dish else "Неизвестно",
            "cooked_count": int(row.total_cooked)
        })

    return {
        "avg_preparation_time": avg_preparation,
        "avg_waiting_time": avg_waiting,
        "cook_dish_frequency": cook_freq
    }