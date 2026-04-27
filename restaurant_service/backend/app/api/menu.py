from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from sqlalchemy.orm import selectinload

from app.db_models import Menu, Category, Specialization, PlatesForSpecialization
from app.database import get_async_db
from app.db_models import Menu, Category
from app.schemas.menu_schemas import *

router = APIRouter(prefix="/menu", tags=["Меню"])

# ===== ЭНДПОИНТЫ ДЛЯ БЛЮД =====
@router.get("/", response_model=List[MenuResponse])
async def get_all_menu(
    category_id: Optional[int] = None,
    is_available: Optional[bool] = None,
    specialization_id: Optional[int] = None,
    db: AsyncSession = Depends(get_async_db)
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
        stmt = stmt.join(Menu.plate_for_specialization).where(PlatesForSpecialization.specialization_id == specialization_id)

    stmt = stmt.order_by(Menu.name)

    result = await db.execute(stmt)
    menu_items = result.scalars().all()

    response_items = []
    for item in menu_items:
        category = item.category_of_item
        category_name = category.name if category else None

        specializations = []
        for link in item.plate_for_specialization:
            if link.spec_of_plates:
                specializations.append(SpecializationResponse.from_orm(link.spec_of_plates))

        response_items.append(MenuResponse(
            id=item.id,
            name=item.name,
            description=item.description,
            photo=item.photo,
            price=item.price,
            category=item.category,
            is_available=item.is_available,
            category_name=category_name,
            specializations=specializations
        ))

    return response_items

@router.get("/{menu_id}", response_model=MenuResponse)
async def get_menu_item(menu_id: int, db: AsyncSession = Depends(get_async_db)):
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

    specializations = []
    for link in item.plate_for_specialization:
        if link.specialization:
            specializations.append(SpecializationResponse.from_orm(link.specialization))

    return MenuResponse(
        id=item.id,
        name=item.name,
        description=item.description,
        photo=item.photo,
        price=item.price,
        category=item.category,
        is_available=item.is_available,
        category_name=category_name,
        specializations=specializations
    )

@router.post("/", response_model=MenuResponse)
async def create_menu_item(menu_data: MenuCreate, db: AsyncSession = Depends(get_async_db)):
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
        is_available=menu_data.is_available
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
    await db.refresh(menu_item, attribute_names=["category_of_item", "plate_for_specialization"])

    specializations_resp = []
    for link in menu_item.plate_for_specialization:
        await db.refresh(link, attribute_names=["specialization"])
        if link.specialization:
            specializations_resp.append(SpecializationResponse.from_orm(link.specialization))

    return MenuResponse(
        id=menu_item.id,
        name=menu_item.name,
        description=menu_item.description,
        photo=menu_item.photo,
        price=menu_item.price,
        category=menu_item.category,
        is_available=menu_item.is_available,
        category_name=category.name,
        specializations=specializations_resp
    )

@router.put("/{menu_id}", response_model=MenuResponse)
async def update_menu_item(menu_id: int, menu_data: MenuUpdate, db: AsyncSession = Depends(get_async_db)):
    """Обновить блюдо"""
    stmt = select(Menu).where(Menu.id == menu_id).options(
        selectinload(Menu.plate_for_specialization)
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    update_data = menu_data.dict(exclude_unset=True)

    for field in ["name", "description", "photo", "price", "is_available", "category"]:
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

    category = item.category_of_item
    category_name = category.name if category else None

    specializations_resp = []
    for link in item.plate_for_specialization:
        await db.refresh(link, attribute_names=["specialization"])
        if link.specialization:
            specializations_resp.append(SpecializationResponse.from_orm(link.specialization))

    return MenuResponse(
        id=item.id,
        name=item.name,
        description=item.description,
        photo=item.photo,
        price=item.price,
        category=item.category,
        is_available=item.is_available,
        category_name=category_name,
        specializations=specializations_resp
    )

@router.delete("/{menu_id}")
async def delete_menu_item(menu_id: int, db: AsyncSession = Depends(get_async_db)):
    """Удалить блюдо"""
    item = await db.get(Menu, menu_id)
    if not item:
        raise HTTPException(status_code=404, detail="Блюдо не найдено")

    await db.delete(item)
    await db.commit()
    return {"message": "Блюдо удалено"}

# ===== ЭНДПОИНТЫ ДЛЯ КАТЕГОРИЙ =====
@router.get("/categories/", response_model=List[CategoryResponse])
async def get_all_categories(
    flat: bool = True,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Получить категории.
    Если flat=False, возвращается иерархическое дерево (вложенные дочерние эелементы).
    """
    if flat:
        stmt = select(Category).order_by(Category.name)
        result = await db.execute(stmt)
        categories = result.scalars().all()
        return categories
    else:
        stmt = select(Category).options(selectinload(Category.children)).order_by(Category.name)
        result = await db.execute(stmt)
        all_cats = result.scalars().all()

        cat_map = {cat.id: cat for cat in all_cats}
        root_cats = []

        for cat in all_cats:
            if cat.parent_category is None:
                root_cats.append(cat)
            else:
                parent = cat_map.get(cat.parent_category)
                if parent:
                    parent.children.append(cat)

        return root_cats

@router.get("/categories/tree", response_model=List[CategoryTreeResponse])
async def get_category_tree(db: AsyncSession = Depends(get_async_db)):
    """Получить полное дерево категорий"""
    stmt = select(Category).order_by(Category.name)
    result = await db.execute(stmt)
    all_cats = result.scalars().all()

    cat_map = {cat.id: cat for cat in all_cats}
    roots = []

    for cat in all_cats:
        if cat.parent_category is None:
            roots.append(cat)
        else:
            parent = cat_map.get(cat.parent_category)
            if parent:
                parent.children.append(cat)

    return roots

@router.get("/categories/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: int, db: AsyncSession = Depends(get_async_db)):
    """Получить категорию по ID (включая вложенные)"""
    stmt = select(Category).where(Category.id == category_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    return category

@router.post("/categories/", response_model=CategoryResponse)
async def create_category(category_data: CategoryCreate, db: AsyncSession = Depends(get_async_db)):
    """Создать категорию"""
    parent_id = category_data.parent_category
    if parent_id is not None:
        stmt = select(Category).where(Category.id == parent_id)
        result = await db.execute(stmt)
        parent = result.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Родительская категория не найдена")

    category = Category(
        name=category_data.name,
        parent_category=parent_id
    )

    db.add(category)
    await db.commit()
    await db.refresh(category)

    return category

@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    db: AsyncSession = Depends(get_async_db)
):
    """Обновить категорию"""
    stmt = select(Category).where(Category.id == category_id)
    result = await db.execute(stmt)
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    update_dict = category_data.dict(exclude_unset=True)

    if "name" in update_dict:
        category.name = update_dict["name"]

    if "parent_category" in update_dict:
        new_parent_id = update_dict["parent_category"]
        if new_parent_id is not None:
            parent_stmt = select(Category).where(Category.id == new_parent_id)
            parent_result = await db.execute(parent_stmt)
            parent = parent_result.scalar_one_or_none()
            if not parent:
                raise HTTPException(status_code=404, detail="Родительская категория не найдена")

            if new_parent_id == category_id:
                raise HTTPException(status_code=400, detail="Категория не может быть родителем самой себя")
            current = parent
            while current is not None:
                if current.id == category_id:
                    raise HTTPException(status_code=400, detail="Нельзя создать циклическую зависимость")
                if current.parent_category is None:
                    break
                parent_of_current_stmt = select(Category).where(Category.id == current.parent_category)
                parent_of_current_res = await db.execute(parent_of_current_stmt)
                current = parent_of_current_res.scalar_one_or_none()
        category.parent_category = new_parent_id

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

    children_stmt = select(Category).where(Category.parent_category == category_id)
    children_result = await db.execute(children_stmt)
    children = children_result.scalars().all()

    for child in children:
        child.parent_category = None

    await db.delete(category)
    await db.commit()

    return {"message": f"Категория '{category.name}' удалена"}