from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.db_models import Table
from app.schemas.tables_schemas import *

router = APIRouter(prefix="/tables", tags=["Столы"])

@router.get("/", response_model=List[TableResponse])
def get_all_tables(db: Session = Depends(get_db), status: Optional[str] = None, is_available: Optional[bool] = None):
    """Получить все столы с возможностью фильтрации"""
    query = db.query(Table)

    if status:
        query = query.filter(Table.status == status)

    if is_available is not None:
        query = query.filter(Table.is_available == is_available)

    return query.order_by(Table.number).all()

@router.get("/{table_id}", response_model=TableResponse)
def get_table(table_id: int, db: Session = Depends(get_db)):
    """Получить стол по ID"""
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")
    return table

@router.get("/status/{status}", response_model=List[TableResponse])
def get_tables_by_status(status: str, db: Session = Depends(get_db)):
    """Получить столы по статусу"""
    return db.query(Table).filter(Table.status == status).all()

@router.post("/", response_model=TableResponse)
def create_table(table_data: TableCreate, db: Session = Depends(get_db)):
    """Создать стол"""
    existing = db.query(Table).filter(Table.number == table_data.number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Стол с таким номером уже существует")

    table = Table(
        number=table_data.number,
        pos_x=table_data.pos_x,
        pos_y=table_data.pos_y,
        status=table_data.status,
        is_available=table_data.is_available
    )

    db.add(table)
    db.commit()
    db.refresh(table)

    return table

@router.put("/{table_id}", response_model=TableResponse)
def update_table(table_id: int, table_data: TableUpdate, db: Session = Depends(get_db)):
    """Обновить стол"""
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    if table_data.number is not None:
        existing = db.query(Table).filter(Table.number == table_data.number, Table.id != table_id).first()
        if existing:
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

    db.commit()
    db.refresh(table)

    return table

@router.delete("/{table_id}")
def delete_table(table_id: int, db: Session = Depends(get_db)):
    """Удалить стол"""
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    db.delete(table)
    db.commit()

    return {"message": "Стол удален"}