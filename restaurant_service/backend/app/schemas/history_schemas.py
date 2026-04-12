from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CookingStatusHistoryCreate(BaseModel):
    plate_for_order_id: int
    new_status: str
    change_by: Optional[int] = None

class CookingStatusHistoryUpdate(BaseModel):
    new_status: Optional[str] = None
    change_by: Optional[int] = None

class CookingStatusHistoryResponse(BaseModel):
    id: int
    change_time: datetime
    new_status: str
    change_by: Optional[int]

    plate_name: Optional[str] = None
    user_name: Optional[str] = None
    order_id: Optional[int] = None

    class Config:
        from_attributes = True