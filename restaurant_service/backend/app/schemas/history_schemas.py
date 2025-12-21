from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class CookingStatusHistoryCreate(BaseModel):
    new_status: str
    order_id: Optional[int] = None
    plate_id: int
    change_by: Optional[int] = None

class CookingStatusHistoryUpdate(BaseModel):
    new_status: Optional[str] = None
    order_id: Optional[int] = None
    plate_id: Optional[int] = None
    change_by: Optional[int] = None

class CookingStatusHistoryResponse(BaseModel):
    id: int
    change_time: datetime
    new_status: str
    order_id: Optional[int]
    plate_id: int
    change_by: Optional[int]
    plate_name: Optional[str] = None
    user_name: Optional[str] = None
    order_number: Optional[str] = None

    class Config:
        from_attributes = True