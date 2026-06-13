from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.database import get_async_db
from app.db_models import Table, TableForOrder, Order, User
from app.schemas.tables_schemas import TableCreate, TableUpdate, TableResponse

from app.websocket.manager import manager
from app.core.security import get_current_user

router = APIRouter(prefix="/tables", tags=["Столы"])

@router.get("/", response_model=List[TableResponse])
async def get_all_tables(
    status: Optional[str] = None,
    is_available: Optional[bool] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Получить все столы с возможностью фильтрации"""
    stmt = select(Table)
    if is_available is None:
        stmt = stmt.where(Table.is_available == True)
    elif is_available is not None:
        stmt = stmt.where(Table.is_available == is_available)
    if status:
        stmt = stmt.where(Table.status == status)
    stmt = stmt.order_by(Table.number)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{table_id}", response_model=TableResponse)
async def get_table(table_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить стол по ID"""
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")
    return table

@router.get("/status/{status}", response_model=List[TableResponse])
async def get_tables_by_status(status: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить столы по статусу"""
    stmt = select(Table).where(Table.status == status).order_by(Table.number)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/", response_model=TableResponse)
async def create_table(table_data: TableCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    stmt_min = select(Table).where(Table.is_available == False).order_by(Table.number).limit(1)
    result_min = await db.execute(stmt_min)
    min_inactive = result_min.scalar_one_or_none()

    if min_inactive:
        min_inactive.pos_x = table_data.pos_x
        min_inactive.pos_y = table_data.pos_y
        min_inactive.status = table_data.status
        min_inactive.is_available = True
        await db.commit()
        await db.refresh(min_inactive)
        await manager.broadcast_to_role({"type": "table_created"}, "admin")
        await manager.broadcast_to_role({"type": "table_created"}, "waiter")
        await manager.broadcast_to_role({"type": "table_created"}, "superadmin")
        return min_inactive

    stmt = select(Table).where(Table.number == table_data.number)
    result = await db.execute(stmt)
    existing_table = result.scalar_one_or_none()

    if existing_table:
        if existing_table.is_available:
            raise HTTPException(status_code=400, detail="Стол с таким номером уже существует")
        existing_table.pos_x = table_data.pos_x
        existing_table.pos_y = table_data.pos_y
        existing_table.status = table_data.status
        existing_table.is_available = True
        await db.commit()
        await db.refresh(existing_table)
        await manager.broadcast_to_role({"type": "table_created"}, "admin")
        await manager.broadcast_to_role({"type": "table_created"}, "waiter")
        await manager.broadcast_to_role({"type": "table_created"}, "superadmin")
        return existing_table

    table = Table(
        number=table_data.number,
        pos_x=table_data.pos_x,
        pos_y=table_data.pos_y,
        status=table_data.status,
        is_available=True
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)
    await manager.broadcast_to_role({"type": "table_created"}, "admin")
    await manager.broadcast_to_role({"type": "table_created"}, "waiter")
    await manager.broadcast_to_role({"type": "table_created"}, "superadmin")
    return table

@router.put("/{table_id}", response_model=TableResponse)
async def update_table(table_id: int, table_data: TableUpdate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Обновить стол"""
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    if table_data.number is not None:
        stmt = select(Table).where(Table.number == table_data.number, Table.id != table_id)
        result = await db.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Стол с таким номером уже существует")
        table.number = table_data.number

    if table_data.pos_x is not None:
        table.pos_x = table_data.pos_x
    if table_data.pos_y is not None:
        table.pos_y = table_data.pos_y
    if table_data.status is not None:
        table.status = table_data.status
    if table_data.is_available is not None:
        table.is_available = table_data.is_available

    await db.commit()
    await db.refresh(table)
    return table

@router.delete("/{table_id}")
async def delete_table(table_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Удалить стол"""
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    stmt = select(TableForOrder).join(Order).where(
        TableForOrder.table == table_id,
        Order.id == TableForOrder.order,
        Order.status.in_(["active", "waiting"])
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Стол нельзя удалить: есть активный заказ")

    table.is_available = False
    await db.commit()
    await db.refresh(table)
    await manager.broadcast_to_role({"type": "table_deleted"}, "admin")
    await manager.broadcast_to_role({"type": "table_deleted"}, "waiter")
    await manager.broadcast_to_role({"type": "table_deleted"}, "superadmin")
    return {"message": "Стол помечен неактивным"}