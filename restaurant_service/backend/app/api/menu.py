from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.database import get_async_db
from app.db_models import Menu, Category
from app.schemas.menu_schemas import *

router = APIRouter(prefix="/menu", tags=["Меню"])

# ===== ЭНДПОИНТЫ ДЛЯ БЛЮД =====
@router.get("/", response_model=List[MenuResponse])
async def get_all_menu(
    category_id: Optional[int] = None,
    is_available: Optional[bool] = None,
    db: AsyncSession = Depends(get_async_db)
):
    """Получить все блюда"""
    stmt = select(Menu)

    if category_id is not None:
        stmt = stmt.where(Menu.category == category_id)

    if is_available is not None:
        stmt = stmt.where(Menu.is_available == is_available)

    stmt = stmt.order_by(Menu.name)

    result = await db.execute(stmt)
    menu_items = result.scalars().all()

    response_items = []
    for item in menu_items:
        category_stmt = select(Category).where(Category.id == item.category)
        category_result = await db.execute(category_stmt)
        category = category_result.scalar_one_or_none()

        item_dict = {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "photo": item.photo,
            "price": item.price,
            "category": item.category,
            "is_available": item.is_available,
            "category_name": category.name if category else None
        }
        response_items.append(MenuResponse(**item_dict))

    return response_items

@router.get("/{menu_id}", response_model=MenuResponse)
async def get_menu_item(menu_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить блюдо по ID"""
    stmt = select(Menu).where(Menu.id == menu_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    category_stmt = select(Category).where(Category.id == item.category)
    category_result = await db.execute(category_stmt)
    category = category_result.scalar_one_or_none()

    item_dict = {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "photo": item.photo,
        "price": item.price,
        "category": item.category,
        "is_available": item.is_available,
        "category_name": category.name if category else None
    }

    return MenuResponse(**item_dict)

@router.post("/", response_model=MenuResponse)
async def create_menu_item(menu_data: MenuCreate, db: AsyncSession = Depends(get_async_db)):
    """Создать блюдо"""
    stmt = select(Category).where(Category.id == menu_data.category)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()

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
    await db.commit()
    await db.refresh(menu_item)

    item_dict = {
        "id": menu_item.id,
        "name": menu_item.name,
        "description": menu_item.description,
        "photo": menu_item.photo,
        "price": menu_item.price,
        "category": menu_item.category,
        "is_available": menu_item.is_available,
        "category_name": category.name
    }

    return MenuResponse(**item_dict)

@router.put("/{menu_id}", response_model=MenuResponse)
async def update_menu_item(menu_id: int, menu_data: MenuUpdate, db: AsyncSession = Depends(get_async_db)):
    """Обновить блюдо"""
    stmt = select(Menu).where(Menu.id == menu_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    update_data = menu_data.dict(exclude_unset=True)

    if "name" in update_data:
        item.name = update_data["name"]
    if "description" in update_data:
        item.description = update_data["description"]
    if "photo" in update_data:
        item.photo = update_data["photo"]
    if "price" in update_data:
        item.price = update_data["price"]
    if "is_available" in update_data:
        item.is_available = update_data["is_available"]
    if "category" in update_data:
        category_stmt = select(Category).where(Category.id == update_data["category"])
        category_result = await db.execute(category_stmt)
        category = category_result.scalar_one_or_none()
        if not category:
            raise HTTPException(status_code=404, detail="Категория не найдена")
        item.category = update_data["category"]

    await db.commit()
    await db.refresh(item)

    category_stmt = select(Category).where(Category.id == item.category)
    category_result = await db.execute(category_stmt)
    category = category_result.scalar_one_or_none()

    item_dict = {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "photo": item.photo,
        "price": item.price,
        "category": item.category,
        "is_available": item.is_available,
        "category_name": category.name if category else None
    }

    return MenuResponse(**item_dict)

@router.delete("/{menu_id}")
async def delete_menu_item(menu_id: int, db: AsyncSession = Depends(get_async_db)):
    """Удалить блюдо"""
    stmt = select(Menu).where(Menu.id == menu_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    await db.delete(item)
    await db.commit()

    return {"message": "Блюдо удалено"}

# ===== ЭНДПОИНТЫ ДЛЯ КАТЕГОРИЙ =====
@router.get("/categories/", response_model=List[CategoryResponse])
async def get_all_categories(db: AsyncSession = Depends(get_async_db)):
    """Получить все категории"""
    stmt = select(Category).order_by(Category.name)
    result = await db.execute(stmt)
    categories = result.scalars().all()
    return categories

@router.get("/categories/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить категорию по ID"""
    stmt = select(Category).where(Category.id == category_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    return category

@router.post("/categories/", response_model=CategoryResponse)
async def create_category(category_data: CategoryCreate, db: AsyncSession = Depends(get_async_db)):
    """Создать категорию"""
    category = Category(name=category_data.name)

    db.add(category)
    await db.commit()
    await db.refresh(category)

    return category

@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: int, category_data: CategoryCreate, db: AsyncSession = Depends(get_async_db)):
    """Обновить категорию"""
    stmt = select(Category).where(Category.id == category_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    category.name = category_data.name
    await db.commit()
    await db.refresh(category)

    return category

@router.delete("/categories/{category_id}")
async def delete_category(category_id: int, db: AsyncSession = Depends(get_async_db)):
    """Удалить категорию"""
    stmt = select(Category).where(Category.id == category_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    await db.delete(category)
    await db.commit()

    return {"message": "Категория удалена"}