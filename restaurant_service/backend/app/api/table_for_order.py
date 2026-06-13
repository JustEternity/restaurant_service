from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.database import get_async_db
from app.db_models import TableForOrder, Order, Table, User
from app.schemas.table_orders_schemas import (
    TableForOrderCreate,
    TableForOrderUpdate,
    TableForOrderResponse
)
from app.core.security import get_current_user

router = APIRouter(prefix="/tables-for-order", tags=["Столы для заказов"])

@router.get("/", response_model=List[TableForOrderResponse])
async def get_all_tables_for_order(
    order_id: Optional[int] = None,
    table_id: Optional[int] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Получить все связи столов и заказов"""
    stmt = select(TableForOrder)

    if order_id is not None:
        stmt = stmt.where(TableForOrder.order == order_id)
    if table_id is not None:
        stmt = stmt.where(TableForOrder.table == table_id)

    stmt = stmt.order_by(TableForOrder.id)
    result = await db.execute(stmt)
    records = result.scalars().all()
    return records

@router.get("/order/{order_id}", response_model=List[TableForOrderResponse])
async def get_tables_by_order(order_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить все столы, привязанные к заказу"""
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    stmt = select(TableForOrder).where(TableForOrder.order == order_id).order_by(TableForOrder.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/table/{table_id}", response_model=List[TableForOrderResponse])
async def get_orders_by_table(table_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить все заказы, привязанные к столу"""
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    stmt = select(TableForOrder).where(TableForOrder.table == table_id).order_by(TableForOrder.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/", response_model=TableForOrderResponse)
async def create_table_for_order(record_data: TableForOrderCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Создать связь стола и заказа"""
    order = await db.get(Order, record_data.order)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    table = await db.get(Table, record_data.table)
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    stmt = select(TableForOrder).where(
        TableForOrder.order == record_data.order,
        TableForOrder.table == record_data.table
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Связь уже существует")

    record = TableForOrder(
        order=record_data.order,
        table=record_data.table
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record

@router.put("/{record_id}", response_model=TableForOrderResponse)
async def update_table_for_order(record_id: int, record_data: TableForOrderUpdate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Обновить связь стола и заказа"""
    record = await db.get(TableForOrder, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Связь не найдена")

    if record_data.order is not None:
        order = await db.get(Order, record_data.order)
        if not order:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        record.order = record_data.order

    if record_data.table is not None:
        table = await db.get(Table, record_data.table)
        if not table:
            raise HTTPException(status_code=404, detail="Стол не найден")
        record.table = record_data.table

    await db.commit()
    await db.refresh(record)
    return record

@router.delete("/{record_id}")
async def delete_table_for_order(record_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Удалить связь стола и заказа"""
    record = await db.get(TableForOrder, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Связь не найдена")

    await db.delete(record)
    await db.commit()
    return {"message": "Связь удалена"}