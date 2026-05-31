from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class PlateInOrderCreate(BaseModel):
    id: Optional[int] = None
    plate_id: int
    count: int = 1
    comment: Optional[str] = None
    initial_status: str = "waiting"
    course_number: int
    is_considered: bool = True

class OrderCreate(BaseModel):
    waiter: int
    status: str = "active"
    timestart: Optional[datetime] = None
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
    current_status: Optional[str] = None
    price: float
    plate_name: Optional[str] = None
    course_number: int
    is_selfserve: bool = False
    is_considered: bool = True
    cook_id_preparing: Optional[int]

    class Config:
        from_attributes = True

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

class PlateInOrderUpdate(BaseModel):
    count: Optional[int] = None
    comment: Optional[str] = None
    new_status: Optional[str] = None
    price: Optional[float] = None
    course_number: int
    is_considered: bool = True