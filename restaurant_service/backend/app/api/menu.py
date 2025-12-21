from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.db_models import Menu, Category
from app.schemas.menu_schemas import *

router = APIRouter(prefix="/menu", tags=["Меню"])

# ===== ЭНДПОИНТЫ ДЛЯ БЛЮД =====
@router.get("/", response_model=List[MenuResponse])
def get_all_menu(category_id: Optional[int] = None, is_available: Optional[bool] = None, db: Session = Depends(get_db)):
    """Получить все блюда"""
    query = db.query(Menu)

    if category_id is not None:
        query = query.filter(Menu.category == category_id)

    if is_available is not None:
        query = query.filter(Menu.is_available == is_available)

    menu_items = query.order_by(Menu.name).all()

    return menu_items

@router.get("/{menu_id}", response_model=MenuResponse)
def get_menu_item(menu_id: int, db: Session = Depends(get_db)):
    """Получить блюдо по ID"""
    item = db.query(Menu).filter(Menu.id == menu_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    item_dict = item.__dict__.copy()
    item_dict['category_name'] = item.category_of_item.name if item.category_of_item else None
    return MenuResponse(**item_dict)

@router.post("/", response_model=MenuResponse)
def create_menu_item(menu_data: MenuCreate, db: Session = Depends(get_db)):
    """Создать блюдо"""
    category = db.query(Category).filter(Category.id == menu_data.category).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    menu_item = Menu(
        name=menu_data.name,
        description=menu_data.description,
        photo=menu_data.photo,
        price=menu_data.price,
        category=menu_data.category,
        is_available=menu_data.is_available
    )

    db.add(menu_item)
    db.commit()
    db.refresh(menu_item)

    item_dict = menu_item.__dict__.copy()
    item_dict['category_name'] = category.name
    return MenuResponse(**item_dict)

@router.put("/{menu_id}", response_model=MenuResponse)
def update_menu_item(menu_id: int, menu_data: MenuUpdate, db: Session = Depends(get_db)):
    """Обновить блюдо"""
    item = db.query(Menu).filter(Menu.id == menu_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    if menu_data.name is not None:
        item.name = menu_data.name
    if menu_data.description is not None:
        item.description = menu_data.description
    if menu_data.photo is not None:
        item.photo = menu_data.photo
    if menu_data.price is not None:
        item.price = menu_data.price
    if menu_data.is_available is not None:
        item.is_available = menu_data.is_available
    if menu_data.category is not None:
        # Проверяем существование новой категории
        category = db.query(Category).filter(Category.id == menu_data.category).first()
        if not category:
            raise HTTPException(status_code=404, detail="Категория не найдена")
        item.category = menu_data.category

    db.commit()
    db.refresh(item)

    item_dict = item.__dict__.copy()
    item_dict['category_name'] = item.category_of_item.name if item.category_of_item else None
    return MenuResponse(**item_dict)

@router.delete("/{menu_id}")
def delete_menu_item(menu_id: int, db: Session = Depends(get_db)):
    """Удалить блюдо"""
    item = db.query(Menu).filter(Menu.id == menu_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    db.delete(item)
    db.commit()

    return {"message": "Блюдо удалено"}

# ===== ЭНДПОИНТЫ ДЛЯ КАТЕГОРИЙ =====
@router.get("/categories/", response_model=List[CategoryResponse])
def get_all_categories(db: Session = Depends(get_db)):
    """Получить все категории"""
    return db.query(Category).order_by(Category.name).all()

@router.get("/categories/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int, db: Session = Depends(get_db)):
    """Получить категорию по ID"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    return category

@router.post("/categories/", response_model=CategoryResponse)
def create_category(category_data: CategoryCreate, db: Session = Depends(get_db)):
    """Создать категорию"""
    category = Category(name=category_data.name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category

@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, category_data: CategoryCreate, db: Session = Depends(get_db)):
    """Обновить категорию"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    category.name = category_data.name
    db.commit()
    db.refresh(category)
    return category

@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    """Удалить категорию"""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    db.delete(category)
    db.commit()

    return {"message": "Категория удалена"}