from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.database import get_async_db
from app.db_models import Table
from app.schemas.tables_schemas import TableCreate, TableUpdate, TableResponse

router = APIRouter(prefix="/tables", tags=["Столы"])

@router.get("/", response_model=List[TableResponse])
async def get_all_tables(
    status: Optional[str] = None,
    is_available: Optional[bool] = None,
    db: AsyncSession = Depends(get_async_db)
):
    """Получить все столы с возможностью фильтрации"""
    stmt = select(Table)
    if status:
        stmt = stmt.where(Table.status == status)
    if is_available is not None:
        stmt = stmt.where(Table.is_available == is_available)
    stmt = stmt.order_by(Table.number)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{table_id}", response_model=TableResponse)
async def get_table(table_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить стол по ID"""
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")
    return table

@router.get("/status/{status}", response_model=List[TableResponse])
async def get_tables_by_status(status: str, db: AsyncSession = Depends(get_async_db)):
    """Получить столы по статусу"""
    stmt = select(Table).where(Table.status == status).order_by(Table.number)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/", response_model=TableResponse)
async def create_table(table_data: TableCreate, db: AsyncSession = Depends(get_async_db)):
    """Создать стол"""
    stmt = select(Table).where(Table.number == table_data.number)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Стол с таким номером уже существует")

    table = Table(
        number=table_data.number,
        pos_x=table_data.pos_x,
        pos_y=table_data.pos_y,
        status=table_data.status,
        is_available=table_data.is_available
    )
    db.add(table)
    await db.commit()
    await db.refresh(table)
    return table

@router.put("/{table_id}", response_model=TableResponse)
async def update_table(table_id: int, table_data: TableUpdate, db: AsyncSession = Depends(get_async_db)):
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
async def delete_table(table_id: int, db: AsyncSession = Depends(get_async_db)):
    """Удалить стол"""
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    await db.delete(table)
    await db.commit()
    return {"message": "Стол удалён"}