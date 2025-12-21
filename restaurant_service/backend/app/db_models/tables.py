from sqlalchemy import Column, Integer, NUMERIC, VARCHAR, BOOLEAN
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum

class TableStatus(enum.Enum):
    FREE = "free"
    OCCUPIED = "occupied"
    RESERVED = "reserved"

class Table(BaseModel):
    __tablename__ = "tables"

    # Основные поля
    id = Column(Integer, primary_key=True)
    number = Column(Integer, nullable=False, unique=True)
    pos_x = Column(NUMERIC, nullable=False)
    pos_y = Column(NUMERIC, nullable=False)
    status = Column(VARCHAR(20), nullable=False, default=TableStatus.FREE)
    is_available = Column(BOOLEAN, nullable=False)

    # Связи
    orders = relationship(
        "TableForOrder",
        back_populates="table_for_order"
    )
