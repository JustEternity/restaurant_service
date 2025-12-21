from typing import Optional
from pydantic import BaseModel

# Схемы для позиций меню
class MenuCreate(BaseModel):
    name: str
    description: Optional[str] = None
    photo: Optional[str] = None
    price: float
    category: int
    is_available: bool = True

class MenuUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    photo: Optional[str] = None
    price: Optional[float] = None
    category: Optional[int] = None
    is_available: Optional[bool] = None

class MenuResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    photo: Optional[str]
    price: float
    category: Optional[int]
    category_name: Optional[str] = None
    is_available: bool

    class Config:
        from_attributes = True

# Схемы для категорий
class CategoryCreate(BaseModel):
    name: str

class CategoryResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True
