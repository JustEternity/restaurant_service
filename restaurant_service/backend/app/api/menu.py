from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from sqlalchemy.orm import selectinload
import asyncio

from app.db_models import Menu, Category, Specialization, PlatesForSpecialization, User
from app.database import get_async_db
from app.schemas.menu_schemas import *
from app.websocket.manager import manager
from app.core.security import get_current_user

router = APIRouter(prefix="/menu", tags=["Меню"])


import os, uuid
from pathlib import Path

UPLOAD_DIR = Path("uploads/menu")
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 5 * 1024 * 1024

@router.post("/{menu_id}/upload-photo")
async def upload_menu_photo(
    menu_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    menu_item = await db.get(Menu, menu_id)
    if not menu_item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Разрешены только JPEG, PNG, WebP")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 5MB)")

    if file.content_type == "image/jpeg" and content[:2] != b'\xff\xd8':
        raise HTTPException(status_code=400, detail="Файл повреждён или не JPEG")
    if file.content_type == "image/png" and content[:4] != b'\x89PNG':
        raise HTTPException(status_code=400, detail="Файл повреждён или не PNG")

    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{menu_id}_{uuid.uuid4().hex}.{ext}"

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(content)

    if menu_item.photo:
        old_path = UPLOAD_DIR / menu_item.photo.split('/')[-1]
        if old_path.exists():
            old_path.unlink()

    menu_item.photo = f"menu/{filename}"
    await db.commit()

    return {"photo_url": f"/uploads/{menu_item.photo}"}

# ===== ЭНДПОИНТЫ ДЛЯ БЛЮД =====
@router.get("/", response_model=List[MenuResponse])
async def get_all_menu(
    category_id: Optional[int] = None,
    is_available: Optional[bool] = None,
    specialization_id: Optional[int] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Получить все блюда с фильтрацией по категории, доступности и специализации"""
    stmt = select(Menu).options(
        selectinload(Menu.category_of_item),
        selectinload(Menu.plate_for_specialization).selectinload(PlatesForSpecialization.spec_of_plates)
    )

    if category_id is not None:
        stmt = stmt.where(Menu.category == category_id)
    if is_available is not None:
        stmt = stmt.where(Menu.is_available == is_available)
    if specialization_id is not None:
        stmt = stmt.join(Menu.plate_for_specialization).where(
            PlatesForSpecialization.specialization_id == specialization_id
        )

    stmt = stmt.order_by(Menu.name)
    result = await db.execute(stmt)
    menu_items = result.scalars().all()

    response_items = []
    for item in menu_items:
        category = item.category_of_item
        category_name = category.name if category else None

        specializations = [
            SpecializationResponse.from_orm(link.spec_of_plates)
            for link in item.plate_for_specialization
            if link.spec_of_plates
        ]

        response_items.append(MenuResponse(
            id=item.id,
            name=item.name,
            description=item.description,
            photo=f"{item.photo}" if item.photo else None,
            price=item.price,
            category=item.category,
            is_available=item.is_available,
            category_name=category_name,
            specializations=specializations,
            is_selfserve=item.is_selfserve
        ))

    return response_items

@router.get("/{menu_id}", response_model=MenuResponse)
async def get_menu_item(menu_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить блюдо по ID"""
    stmt = select(Menu).where(Menu.id == menu_id).options(
        selectinload(Menu.category_of_item),
        selectinload(Menu.plate_for_specialization).selectinload(PlatesForSpecialization.spec_of_plates)
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    category = item.category_of_item
    category_name = category.name if category else None

    specializations = [
        SpecializationResponse.from_orm(link.spec_of_plates)
        for link in item.plate_for_specialization
        if link.spec_of_plates
    ]

    return MenuResponse(
        id=item.id,
        name=item.name,
        description=item.description,
        photo=f"{item.photo}" if item.photo else None,
        price=item.price,
        category=item.category,
        is_available=item.is_available,
        category_name=category_name,
        specializations=specializations,
        is_selfserve=item.is_selfserve
    )

@router.post("/", response_model=MenuResponse)
async def create_menu_item(menu_data: MenuCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Создать блюдо"""
    category = await db.get(Category, menu_data.category)
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    menu_item = Menu(
        name=menu_data.name,
        description=menu_data.description,
        photo=menu_data.photo,
        price=menu_data.price,
        category=menu_data.category,
        is_available=menu_data.is_available,
        is_selfserve=menu_data.is_selfserve
    )
    db.add(menu_item)
    await db.flush()

    if menu_data.specialization_ids:
        spec_stmt = select(Specialization).where(Specialization.id.in_(menu_data.specialization_ids))
        spec_result = await db.execute(spec_stmt)
        specializations = spec_result.scalars().all()
        if len(specializations) != len(menu_data.specialization_ids):
            raise HTTPException(status_code=404, detail="Одна или несколько специализаций не найдены")
        for spec in specializations:
            db.add(PlatesForSpecialization(plate=menu_item.id, specialization=spec.id))

    await db.commit()
    # Подгружаем оба отношения
    await db.refresh(menu_item, attribute_names=["category_of_item", "plate_for_specialization"])

    await manager.broadcast_to_role({"type": "plates_update"}, "admin")
    await manager.broadcast_to_role({"type": "plates_update"}, "waiter")
    await manager.broadcast_to_role({"type": "plates_update"}, "superadmin")

    specializations_resp = []
    for link in menu_item.plate_for_specialization:
        await db.refresh(link, attribute_names=["spec_of_plates"])
        if link.spec_of_plates:
            specializations_resp.append(SpecializationResponse.from_orm(link.spec_of_plates))

    return MenuResponse(
        id=menu_item.id,
        name=menu_item.name,
        description=menu_item.description,
        photo=f"{menu_item.photo}" if menu_item.photo else None,
        price=menu_item.price,
        category=menu_item.category,
        is_available=menu_item.is_available,
        category_name=category.name,
        specializations=specializations_resp,
        is_selfserve=menu_item.is_selfserve
    )

@router.put("/{menu_id}", response_model=MenuResponse)
async def update_menu_item(menu_id: int, menu_data: MenuUpdate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Обновить блюдо"""
    stmt = select(Menu).where(Menu.id == menu_id).options(
        selectinload(Menu.plate_for_specialization)
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    update_data = menu_data.dict(exclude_unset=True)

    for field in ["name", "description", "photo", "price", "is_available", "category", "is_selfserve"]:
        if field in update_data:
            setattr(item, field, update_data[field])

    if "category" in update_data:
        category = await db.get(Category, update_data["category"])
        if not category:
            raise HTTPException(status_code=404, detail="Категория не найдена")

    if "specialization_ids" in update_data:
        await db.execute(delete(PlatesForSpecialization).where(PlatesForSpecialization.plate == menu_id))
        if update_data["specialization_ids"]:
            spec_stmt = select(Specialization).where(Specialization.id.in_(update_data["specialization_ids"]))
            spec_result = await db.execute(spec_stmt)
            specs = spec_result.scalars().all()
            if len(specs) != len(update_data["specialization_ids"]):
                raise HTTPException(status_code=404, detail="Одна или несколько специализаций не найдены")
            for spec in specs:
                db.add(PlatesForSpecialization(plate=menu_id, specialization=spec.id))

    await db.commit()
    await db.refresh(item, attribute_names=["category_of_item", "plate_for_specialization"])
    await asyncio.sleep(0.5)

    print(' Broadcasting plates_update to roles...')
    await manager.broadcast_to_role({"type": "plates_update"}, "admin")
    await manager.broadcast_to_role({"type": "plates_update"}, "waiter")
    await manager.broadcast_to_role({"type": "plates_update"}, "superadmin")
    await manager.broadcast_to_role({"type": "plates_update"}, "cook")

    category = item.category_of_item
    category_name = category.name if category else None

    specializations_resp = []
    for link in item.plate_for_specialization:
        await db.refresh(link, attribute_names=["spec_of_plates"])
        if link.spec_of_plates:
            specializations_resp.append(SpecializationResponse.from_orm(link.spec_of_plates))

    return MenuResponse(
        id=item.id,
        name=item.name,
        description=item.description,
        photo=f"{item.photo}" if item.photo else None,
        price=item.price,
        category=item.category,
        is_available=item.is_available,
        category_name=category_name,
        specializations=specializations_resp,
        is_selfserve=item.is_selfserve
    )

@router.delete("/{menu_id}")
async def delete_menu_item(menu_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Удалить блюдо"""
    item = await db.get(Menu, menu_id)
    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    await db.delete(item)
    await db.commit()
    await manager.broadcast_to_role({"type": "plates_update"}, "admin")
    await manager.broadcast_to_role({"type": "plates_update"}, "waiter")
    await manager.broadcast_to_role({"type": "plates_update"}, "superadmin")
    return {"message": "Блюдо удалено"}

# ===== ЭНДПОИНТЫ ДЛЯ КАТЕГОРИЙ =====
@router.get("/categories/", response_model=List[CategoryFlatResponse])
async def get_all_categories(
    flat: bool = True,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """
    Получить категории.
    Если flat=False, возвращается иерархическое дерево (вложенные дочерние элементы).
    """
    stmt = select(Category).order_by(Category.name)
    result = await db.execute(stmt)
    categories = result.scalars().all()

    if flat:
        return [
            CategoryFlatResponse(
                id=cat.id,
                name=cat.name,
                parent_category=cat.parent_category,
            )
            for cat in categories
        ]
    else:
        cat_map: dict[int, CategoryTreeResponse] = {}
        tree: list[CategoryTreeResponse] = []
        for cat in categories:
            node = CategoryTreeResponse(
                id=cat.id,
                name=cat.name,
                parent_category=cat.parent_category,
                children=[]
            )
            cat_map[cat.id] = node

        for cat in categories:
            node = cat_map[cat.id]
            if node.parent_category is None:
                tree.append(node)
            else:
                parent_node = cat_map.get(node.parent_category)
                if parent_node:
                    parent_node.children.append(node)

        return tree

@router.get("/categories/tree", response_model=List[CategoryTreeResponse])
async def get_category_tree(db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить полное дерево категорий"""
    stmt = select(Category).order_by(Category.name)
    result = await db.execute(stmt)
    categories = result.scalars().all()

    cat_map: dict[int, CategoryTreeResponse] = {}
    tree: list[CategoryTreeResponse] = []
    for cat in categories:
        node = CategoryTreeResponse(
            id=cat.id,
            name=cat.name,
            parent_category=cat.parent_category,
            children=[]
        )
        cat_map[cat.id] = node

    for cat in categories:
        node = cat_map[cat.id]
        if node.parent_category is None:
            tree.append(node)
        else:
            parent_node = cat_map.get(node.parent_category)
            if parent_node:
                parent_node.children.append(node)

    return tree

@router.get("/categories/{category_id}", response_model=CategoryFlatResponse)
async def get_category(category_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Получить категорию по ID (без дочерних)"""
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    return CategoryFlatResponse(
        id=cat.id,
        name=cat.name,
        parent_category=cat.parent_category,
    )

@router.post("/categories/", response_model=CategoryFlatResponse)
async def create_category(category_data: CategoryCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Создать категорию"""
    parent_id = category_data.parent_category
    if parent_id is not None:
        parent = await db.get(Category, parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Родительская категория не найдена")

    category = Category(
        name=category_data.name,
        parent_category=parent_id
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)

    await manager.broadcast_to_role({"type": "categories_update"}, "admin")
    await manager.broadcast_to_role({"type": "categories_update"}, "waiter")
    await manager.broadcast_to_role({"type": "categories_update"}, "superadmin")

    return CategoryFlatResponse(
        id=category.id,
        name=category.name,
        parent_category=category.parent_category,
    )

@router.put("/categories/{category_id}", response_model=CategoryFlatResponse)
async def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить категорию"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    update_dict = category_data.dict(exclude_unset=True)

    if "name" in update_dict:
        category.name = update_dict["name"]

    if "parent_category" in update_dict:
        new_parent_id = update_dict["parent_category"]
        if new_parent_id is not None:
            parent = await db.get(Category, new_parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Родительская категория не найдена")
            if new_parent_id == category_id:
                raise HTTPException(status_code=400, detail="Категория не может быть родителем самой себя")
            # Проверка на циклическую зависимость
            current = parent
            while current:
                if current.id == category_id:
                    raise HTTPException(status_code=400, detail="Нельзя создать циклическую зависимость")
                if current.parent_category is None:
                    break
                current = await db.get(Category, current.parent_category)
        category.parent_category = new_parent_id

    await db.commit()
    await db.refresh(category)

    await manager.broadcast_to_role({"type": "categories_update"}, "admin")
    await manager.broadcast_to_role({"type": "categories_update"}, "waiter")
    await manager.broadcast_to_role({"type": "categories_update"}, "superadmin")

    return CategoryFlatResponse(
        id=category.id,
        name=category.name,
        parent_category=category.parent_category,
    )

@router.delete("/categories/{category_id}")
async def delete_category(category_id: int, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Удалить категорию"""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    # Отвязываем дочерние категории
    children_stmt = select(Category).where(Category.parent_category == category_id)
    children_result = await db.execute(children_stmt)
    children = children_result.scalars().all()
    for child in children:
        child.parent_category = None

    await db.delete(category)
    await db.commit()

    await manager.broadcast_to_role({"type": "categories_update"}, "admin")
    await manager.broadcast_to_role({"type": "categories_update"}, "waiter")
    await manager.broadcast_to_role({"type": "categories_update"}, "superadmin")

    return {"message": f"Категория '{category.name}' удалена"}