from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.db_models import Order, User, Table, Menu, PlateForOrder, TableForOrder, CookingStatusHistory, CookingStatus
from app.schemas.orders_schemas import *

router = APIRouter(prefix="/orders", tags=["Заказы"])

@router.get("/", response_model=List[OrderResponse])
def get_all_orders(status: Optional[str] = None, waiter_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Получить все заказы"""
    query = db.query(Order)

    if status:
        query = query.filter(Order.status == status)
    if waiter_id:
        query = query.filter(Order.waiter == waiter_id)

    orders = query.order_by(Order.timestart.desc()).all()

    result = []
    for order in orders:
        order_data = OrderResponse(
            id=order.id,
            waiter=order.waiter,
            status=order.status,
            timestart=order.timestart,
            endtime=order.endtime,
            waiter_name=order.waiter_user.name if order.waiter_user else None,
            table_numbers=[table.table_for_order.number for table in order.tables if table.table_for_order],
            plates=[]
        )

        # Добавляем блюда
        for plate in order.plates:
            plate_data = PlateInOrderResponse(
                id=plate.id,
                plate_id=plate.plate_id,
                count=plate.count,
                comment=plate.comment,
                cooking_status=plate.cooking_status,
                price=plate.price,
                plate_name=plate.menu_item.name if plate.menu_item else None
            )
            order_data.plates.append(plate_data)

        result.append(order_data)

    return result

@router.get("/active", response_model=List[OrderResponse])
def get_active_orders(db: Session = Depends(get_db)):
    """Получить активные заказы"""
    return get_all_orders(status="active", db=db)

@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    """Получить заказ по ID"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order_data = OrderResponse(
        id=order.id,
        waiter=order.waiter,
        status=order.status,
        timestart=order.timestart,
        endtime=order.endtime,
        waiter_name=order.waiter_user.name if order.waiter_user else None,
        table_numbers=[table.table_for_order.number for table in order.tables if table.table_for_order],
        plates=[]
    )

    # Добавление блюд
    for plate in order.plates:
        plate_data = PlateInOrderResponse(
            id=plate.id,
            plate_id=plate.plate_id,
            count=plate.count,
            comment=plate.comment,
            cooking_status=plate.cooking_status,
            price=plate.price,
            plate_name=plate.menu_item.name if plate.menu_item else None
        )
        order_data.plates.append(plate_data)

    return order_data

@router.post("/", response_model=OrderResponse)
def create_order(order_data: OrderCreate, db: Session = Depends(get_db)):
    """Создать новый заказ"""
    # Проверка существования официанта
    waiter = db.query(User).filter(User.id == order_data.waiter).first()
    if not waiter:
        raise HTTPException(status_code=404, detail="Официант не найден")

    # Проверка существования столов
    tables = db.query(Table).filter(Table.id.in_(order_data.tables)).all()
    if len(tables) != len(order_data.tables):
        raise HTTPException(status_code=404, detail="Один или несколько столов не найдены")

    # Проверка что столы свободны
    occupied_tables = [t for t in tables if t.status != "free"]
    if occupied_tables:
        raise HTTPException(
            status_code=400,
            detail=f"Столы {[t.number for t in occupied_tables]} заняты"
        )

    # Проверка существования позиций меню
    plate_ids = [plate.plate_id for plate in order_data.plates]
    dishes = db.query(Menu).filter(Menu.id.in_(plate_ids)).all()

    if len(dishes) != len(plate_ids):
        raise HTTPException(status_code=404, detail="Одно или несколько блюд не найдены")

    # Создание заказа
    order = Order(
        waiter=order_data.waiter,
        status=order_data.status,
        timestart=order_data.timestart,
        endtime=None
    )

    db.add(order)
    db.commit()
    db.refresh(order)

    for table in tables:
        table_link = TableForOrder(order=order.id, table=table.id)
        db.add(table_link)
        table.status = "occupied"

    # Добавление блюд в заказ
    for plate_data in order_data.plates:
        plate = PlateForOrder(
            order_id=order.id,
            plate_id=plate_data.plate_id,
            count=plate_data.count,
            comment=plate_data.comment,
            cooking_status=plate_data.cooking_status,
            price=plate_data.price
        )
        db.add(plate)

    db.commit()

    return get_order(order.id, db)

@router.put("/{order_id}", response_model=OrderResponse)
def update_order(order_id: int, order_data: OrderUpdate, db: Session = Depends(get_db)):
    """Обновить заказ"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order_data.status is not None:
        order.status = order_data.status
    if order_data.endtime is not None:
        order.endtime = order_data.endtime

    db.commit()
    db.refresh(order)

    return get_order(order.id, db)

@router.put("/{order_id}/complete")
def complete_order(order_id: int, db: Session = Depends(get_db)):
    """Завершить заказ"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order.status = "completed"
    order.endtime = datetime.utcnow()

    for table_link in order.tables:
        table = table_link.table_for_order
        if table:
            table.status = "free"

    db.commit()

    return {"message": "Заказ завершен"}

@router.put("/plate/{plate_id}/status/{status}")
def update_plate_status(plate_id: int, status: str, db: Session = Depends(get_db)):
    """Изменить статус блюда"""
    # Проверка допустимости статуса
    allowed_statuses = ["ordered", "preparing", "ready", "served"]
    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Неверный статус. Допустимые: {', '.join(allowed_statuses)}"
        )

    plate = db.query(PlateForOrder).filter(PlateForOrder.id == plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    # Запись в истории
    status_history = CookingStatusHistory(
        order_id=plate.order_id,
        plate_id=plate.plate_id,
        new_status=status,
        change_time=datetime.utcnow(),
        change_by=25
    )

    db.add(status_history)
    plate.cooking_status = status
    db.commit()

    return {"message": f"Статус блюда изменен на {status}"}

@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """Удалить заказ"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    # Освобождаем столы перед удалением
    for table_link in order.tables:
        table = table_link.table_for_order
        if table:
            table.status = "free"

    db.delete(order)
    db.commit()

    return {"message": "Заказ удален"}

@router.post("/{order_id}/plates", response_model=PlateInOrderResponse)
def add_plate_to_order(order_id: int, plate_data: PlateInOrderCreate, db: Session = Depends(get_db)):
    """Добавить блюдо к заказу"""
    # Проверка существования заказа
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    # Проверка что заказ активен
    if order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя добавлять блюда в завершенный или отмененный заказ")

    # Проверка существования блюда в меню
    menu_item = db.query(Menu).filter(Menu.id == plate_data.plate_id).first()
    if not menu_item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено в меню")

    # Проверка допустимости статуса
    allowed_statuses = [status.value for status in CookingStatus]
    if plate_data.cooking_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Неверный статус. Допустимые: {', '.join(allowed_statuses)}"
        )

    # Блюдо
    plate = PlateForOrder(
        order_id=order_id,
        plate_id=plate_data.plate_id,
        count=plate_data.count,
        comment=plate_data.comment,
        cooking_status=plate_data.cooking_status,
        price=plate_data.price
    )

    db.add(plate)
    db.commit()
    db.refresh(plate)

    status_history = CookingStatusHistory(
        order_id=order.id,
        plate_id=plate.plate_id,
        new_status=plate_data.cooking_status,
        change_by=25,  # Временно, до реализации авторизации
        change_time=datetime.utcnow()
    )
    db.add(status_history)
    db.commit()

    plate_response = PlateInOrderResponse(
        id=plate.id,
        plate_id=plate.plate_id,
        count=plate.count,
        comment=plate.comment,
        cooking_status=plate.cooking_status,
        price=plate.price,
        plate_name=menu_item.name if menu_item else None
    )

    return plate_response

@router.put("/plates/{plate_id}", response_model=PlateInOrderResponse)
def update_plate_in_order(plate_id: int, plate_data: PlateInOrderUpdate, db: Session = Depends(get_db)):
    """Изменить блюдо в заказе"""
    # Поиск блюда в заказе
    plate = db.query(PlateForOrder).filter(PlateForOrder.id == plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо в заказе не найдено")

    # Проверка существования заказа
    order = db.query(Order).filter(Order.id == plate.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    # Проверка что заказ активен
    if order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя изменять блюда в завершенном или отмененном заказе")

    old_total = plate.price * plate.count

    # Обновление полей
    if plate_data.count is not None:
        plate.count = plate_data.count

    if plate_data.comment is not None:
        plate.comment = plate_data.comment

    if plate_data.price is not None:
        plate.price = plate_data.price

    if plate_data.cooking_status is not None:
        # Проверка допустимости статуса
        allowed_statuses = [status.value for status in CookingStatus]
        if plate_data.cooking_status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Неверный статус. Допустимые: {', '.join(allowed_statuses)}"
            )

        status_history = CookingStatusHistory(
            order_id=order.id,
            plate_id=plate.plate_id,
            new_status=plate_data.cooking_status,
            change_by=25,  # Временно, до реализации авторизации
            change_time=datetime.utcnow()
        )
        plate.cooking_status = plate_data.cooking_status
        db.add(status_history)

    new_total = plate.price * plate.count

    db.commit()
    db.refresh(plate)

    menu_item = db.query(Menu).filter(Menu.id == plate.plate_id).first()

    plate_response = PlateInOrderResponse(
        id=plate.id,
        plate_id=plate.plate_id,
        count=plate.count,
        comment=plate.comment,
        cooking_status=plate.cooking_status,
        price=plate.price,
        plate_name=menu_item.name if menu_item else None
    )

    return plate_response

@router.delete("/plates/{plate_id}")
def delete_plate_from_order(plate_id: int,db: Session = Depends(get_db)):
    """Удалить блюдо из заказа"""
    # Поиск блюда в заказе
    plate = db.query(PlateForOrder).filter(PlateForOrder.id == plate_id).first()
    if not plate:
        raise HTTPException(status_code=404, detail="Блюдо в заказе не найдено")

    # Проверка существования заказа
    order = db.query(Order).filter(Order.id == plate.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    # Проверка что заказ активен
    if order.status not in ["active", "waiting"]:
        raise HTTPException(status_code=400, detail="Нельзя удалять блюда из завершенного или отмененного заказа")

    db.delete(plate)
    db.commit()

    return {"message": "Блюдо удалено из заказа"}