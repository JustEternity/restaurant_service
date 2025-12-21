from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class PlateInOrderCreate(BaseModel):
    plate_id: int
    count: int = 1
    comment: Optional[str] = None
    cooking_status: str = "ordered"
    price: float

class OrderCreate(BaseModel):
    waiter: int
    status: str = "active"
    timestart: datetime
    plates: List[PlateInOrderCreate]
    tables: List[int]

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    endtime: Optional[datetime] = None

class PlateInOrderResponse(BaseModel):
    id: int
    plate_id: int
    count: int
    comment: Optional[str]
    cooking_status: str
    price: float
    plate_name: Optional[str] = None

class OrderResponse(BaseModel):
    id: int
    waiter: int
    status: str
    timestart: datetime
    endtime: Optional[datetime]
    waiter_name: Optional[str] = None
    table_numbers: List[int] = []
    plates: List[PlateInOrderResponse] = []

    class Config:
        from_attributes = True

class PlateInOrderCreate(BaseModel):
    plate_id: int
    count: int = 1
    comment: Optional[str] = None
    cooking_status: str = "waiting"
    price: float

class PlateInOrderUpdate(BaseModel):
    count: Optional[int] = None
    comment: Optional[str] = None
    cooking_status: Optional[str] = None
    price: Optional[float] = None
