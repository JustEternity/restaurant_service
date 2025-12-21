from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.db_models import TableForOrder, Order, Table
from app.schemas.table_orders_schemas import *

router = APIRouter(prefix="/tables-for-order", tags=["Столы для заказов"])

@router.get("/", response_model=List[TableForOrderResponse])
def get_all_tables_for_order(db: Session = Depends(get_db), order_id: Optional[int] = None, table_id: Optional[int] = None):
    """Получить все связи столов и заказов"""
    query = db.query(TableForOrder)

    if order_id is not None:
        query = query.filter(TableForOrder.order == order_id)

    if table_id is not None:
        query = query.filter(TableForOrder.table == table_id)

    return query.order_by(TableForOrder.id).all()

@router.get("/order/{order_id}", response_model=List[TableForOrderResponse])
def get_tables_by_order(order_id: int, db: Session = Depends(get_db)):
    """Получить все столы, привязанные к заказу"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    return db.query(TableForOrder)\
        .filter(TableForOrder.order == order_id)\
        .order_by(TableForOrder.id)\
        .all()

@router.get("/table/{table_id}", response_model=List[TableForOrderResponse])
def get_orders_by_table(table_id: int, db: Session = Depends(get_db)):
    """Получить все заказы, привязанные к столу"""
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    return db.query(TableForOrder)\
        .filter(TableForOrder.table == table_id)\
        .order_by(TableForOrder.id)\
        .all()

@router.post("/", response_model=TableForOrderResponse)
def create_table_for_order(record_data: TableForOrderCreate, db: Session = Depends(get_db)):
    """Создать связь стола и заказа"""
    order = db.query(Order).filter(Order.id == record_data.order).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    table = db.query(Table).filter(Table.id == record_data.table).first()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    existing = db.query(TableForOrder).filter(
        TableForOrder.order == record_data.order,
        TableForOrder.table == record_data.table
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Связь уже существует")

    record = TableForOrder(
        order=record_data.order,
        table=record_data.table
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return record

@router.put("/{record_id}", response_model=TableForOrderResponse)
def update_table_for_order(record_id: int, record_data: TableForOrderUpdate, db: Session = Depends(get_db)):
    """Обновить связь стола и заказа"""
    record = db.query(TableForOrder).filter(TableForOrder.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Связь не найдена")

    if record_data.order is not None:
        order = db.query(Order).filter(Order.id == record_data.order).first()
        if not order:
            raise HTTPException(status_code=404, detail="Заказ не найден")
        record.order = record_data.order

    if record_data.table is not None:
        table = db.query(Table).filter(Table.id == record_data.table).first()
        if not table:
            raise HTTPException(status_code=404, detail="Стол не найден")
        record.table = record_data.table

    db.commit()
    db.refresh(record)

    return record

@router.delete("/{record_id}")
def delete_table_for_order(record_id: int, db: Session = Depends(get_db)):
    """Удалить связь стола и заказа"""
    record = db.query(TableForOrder).filter(TableForOrder.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Связь не найдена")

    db.delete(record)
    db.commit()

    return {"message": "Связь удалена"}