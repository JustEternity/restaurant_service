from pydantic import BaseModel
from typing import Optional

class TableForOrderCreate(BaseModel):
    order: int
    table: int

class TableForOrderUpdate(BaseModel):
    order: Optional[int] = None
    table: Optional[int] = None

class TableForOrderResponse(BaseModel):
    id: int
    order: int
    table: int

    class Config:
        from_attributes = True
