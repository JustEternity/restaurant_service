from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from sqlalchemy.orm import selectinload, aliased
from datetime import date, datetime
from typing import Optional

from app.database import get_async_db
from app.db_models import Order, PlateForOrder, CookingStatusHistory, TableForOrder, Table, Menu, User
from app.db_models.user_roles import Role
from app.core.security import get_current_user

router = APIRouter(prefix="/statistics", tags=["Статистика"])

@router.get("/general")
async def general_statistics(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
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
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
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
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
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
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
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
        .join(Menu, PlateForOrder.plate_id == Menu.id)
        .where(
            Menu.is_selfserve == False,
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
        .join(Menu, PlateForOrder.plate_id == Menu.id)
        .where(
            Menu.is_selfserve == False,
            WaitAlias.change_time >= start_dt,
            WaitAlias.change_time <= end_dt
        )
        .group_by(PlateForOrder.plate_id)
    )
    if plate_id:
        wait_stmt = wait_stmt.where(PlateForOrder.plate_id == plate_id)
    if cook_id:
        wait_stmt = wait_stmt.where(PrepAlias.change_by == cook_id)

    wait_result = await db.execute(wait_stmt)
    wait_rows = wait_result.all()

    freq_stmt = (
        select(
            CookingStatusHistory.change_by,
            PlateForOrder.plate_id,
            func.sum(PlateForOrder.count).label("total_cooked")
        )
        .select_from(PlateForOrder)
        .join(CookingStatusHistory, PlateForOrder.id == CookingStatusHistory.ordered_plate)
        .join(Menu, PlateForOrder.plate_id == Menu.id)
        .where(
            Menu.is_selfserve == False,
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

    all_plate_ids = (
        {row.plate_id for row in prep_rows} |
        {row.plate_id for row in wait_rows} |
        {row.plate_id for row in freq_rows if row.plate_id}
    )
    all_cook_ids = {row.change_by for row in freq_rows if row.change_by}

    menu_map = {}
    if all_plate_ids:
        menu_res = await db.execute(select(Menu.id, Menu.name).where(Menu.id.in_(all_plate_ids)))
        menu_map = {mid: mname for mid, mname in menu_res.all()}

    cook_name_map = {}
    if all_cook_ids:
        cook_res = await db.execute(select(User.id, User.name).where(User.id.in_(all_cook_ids)))
        cook_name_map = {uid: uname for uid, uname in cook_res.all()}

    avg_preparation = []
    for row in prep_rows:
        avg_preparation.append({
            "plate_id": row.plate_id,
            "plate_name": menu_map.get(row.plate_id, "Неизвестно"),
            "avg_minutes": round(row[1], 1) if row[1] else 0.0
        })

    avg_waiting = []
    for row in wait_rows:
        avg_waiting.append({
            "plate_id": row.plate_id,
            "plate_name": menu_map.get(row.plate_id, "Неизвестно"),
            "avg_minutes": round(row[1], 1) if row[1] else 0.0
        })

    cook_freq = []
    for row in freq_rows:
        cook_freq.append({
            "cook_id": row.change_by,
            "cook_name": cook_name_map.get(row.change_by, "Неизвестный"),
            "plate_id": row.plate_id,
            "plate_name": menu_map.get(row.plate_id, "Неизвестно"),
            "cooked_count": int(row.total_cooked)
        })

    return {
        "avg_preparation_time": avg_preparation,
        "avg_waiting_time": avg_waiting,
        "cook_dish_frequency": cook_freq
    }

@router.get("/kitchen/workload")
async def kitchen_workload(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    latest_time_subq = (
        select(
            CookingStatusHistory.ordered_plate,
            func.max(CookingStatusHistory.change_time).label("latest_time")
        )
        .group_by(CookingStatusHistory.ordered_plate)
        .subquery()
    )

    stmt = (
        select(
            CookingStatusHistory.change_by,
            CookingStatusHistory.new_status,
            PlateForOrder.plate_id,
            PlateForOrder.count,
        )
        .join(
            latest_time_subq,
            (CookingStatusHistory.ordered_plate == latest_time_subq.c.ordered_plate) &
            (CookingStatusHistory.change_time == latest_time_subq.c.latest_time)
        )
        .join(PlateForOrder, CookingStatusHistory.ordered_plate == PlateForOrder.id)
        .join(Order, PlateForOrder.order_id == Order.id)
        .where(
            CookingStatusHistory.new_status.in_(["preparing", "ready"]),
            Order.status.notin_(["completed", "cancelled"])
        )
    )

    result = await db.execute(stmt)
    rows = result.all()

    plate_ids = {row.plate_id for row in rows}
    cook_ids = {row.change_by for row in rows if row.change_by}

    menu_map = {}
    if plate_ids:
        menu_res = await db.execute(
            select(Menu.id, Menu.name).where(Menu.id.in_(plate_ids))
        )
        menu_map = {mid: mname for mid, mname in menu_res.all()}

    cook_name_map = {}
    if cook_ids:
        cook_res = await db.execute(
            select(User.id, User.name).where(User.id.in_(cook_ids))
        )
        cook_name_map = {uid: uname for uid, uname in cook_res.all()}

    cook_map: dict = {}
    for row in rows:
        cid = row.change_by
        if cid not in cook_map:
            cook_map[cid] = {
                "cook_id": cid,
                "cook_name": cook_name_map.get(cid, "Неизвестный"),
                "dishes": []
            }
        cook_map[cid]["dishes"].append({
            "plate_id": row.plate_id,
            "plate_name": menu_map.get(row.plate_id, "Неизвестно"),
            "count": row.count,
            "status": row.new_status,
        })

    for cook in cook_map.values():
        cook["dishes"].sort(key=lambda d: 0 if d["status"] == "preparing" else 1)
        cook["total_count"] = sum(d["count"] for d in cook["dishes"])

    return list(cook_map.values())

@router.get("/waiters")
async def waiters_statistics(
    start_date: date = Query(...),
    end_date: date = Query(...),
    waiter_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    start_dt = datetime(start_date.year, start_date.month, start_date.day)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59)

    base_cond = [
        Order.status == "completed",
        Order.timestart >= start_dt,
        Order.timestart <= end_dt
    ]
    if waiter_id:
        base_cond.append(Order.waiter == waiter_id)

    stmt_count = select(func.count(Order.id)).where(*base_cond)
    total_orders = (await db.execute(stmt_count)).scalar() or 0

    stmt_revenue = (
        select(func.sum(PlateForOrder.price * PlateForOrder.count))
        .select_from(Order)
        .join(PlateForOrder, Order.id == PlateForOrder.order_id)
        .where(*base_cond)
    )
    total_revenue = (await db.execute(stmt_revenue)).scalar() or 0

    stmt_dishes = (
        select(func.sum(PlateForOrder.count))
        .select_from(Order)
        .join(PlateForOrder, Order.id == PlateForOrder.order_id)
        .where(*base_cond)
    )
    total_dishes = (await db.execute(stmt_dishes)).scalar() or 0

    avg_check = total_revenue / total_orders if total_orders else 0
    avg_dishes_per_order = total_dishes / total_orders if total_orders else 0

    return {
        "total_orders": total_orders,
        "total_revenue": float(total_revenue),
        "avg_check": float(avg_check),
        "total_dishes": int(total_dishes),
        "avg_dishes_per_order": float(avg_dishes_per_order),
    }
