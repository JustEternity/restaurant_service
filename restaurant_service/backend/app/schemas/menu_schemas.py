from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from app.schemas.specialization_schemas import SpecializationResponse

class MenuCreate(BaseModel):
    name: str
    description: Optional[str] = None
    photo: Optional[str] = None
    price: Optional[float] = None
    category: int
    is_available: bool = True
    specialization_ids: List[int] = []
    is_selfserve: bool = False

class MenuUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    photo: Optional[str] = None
    price: Optional[float] = None
    category: Optional[int] = None
    is_available: Optional[bool] = None
    specialization_ids: Optional[List[int]] = None
    is_selfserve: bool = False

class MenuResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    photo: Optional[str]
    price: Optional[float]
    category: Optional[int]
    category_name: Optional[str] = None
    is_available: bool
    is_selfserve: bool = False
    specializations: List[SpecializationResponse] = []

    class Config:
        from_attributes = True

# ========== СХЕМЫ ДЛЯ КАТЕГОРИЙ ==========
class CategoryCreate(BaseModel):
    name: str
    parent_category: Optional[int] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_category: Optional[int] = None

class CategoryResponse(BaseModel):
    id: int
    name: str
    parent_category: Optional[int] = None
    children: List['CategoryResponse'] = []

    class Config:
        from_attributes = True

class CategoryTreeResponse(BaseModel):
    id: int
    name: str
    parent_category: Optional[int] = None
    children: List['CategoryTreeResponse'] = []

    class Config:
        from_attributes = True

class CategoryFlatResponse(BaseModel):
    id: int
    name: str
    parent_category: int | None
    model_config = ConfigDict(from_attributes=True)