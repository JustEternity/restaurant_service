from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum

class OrderStatus(enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class Order(BaseModel):
    __tablename__ = "orders"

    # Основные поля
    id = Column(Integer, primary_key=True)
    status = Column(String(20), nullable=False)
    timestart = Column(DateTime, nullable=False)
    endtime = Column(DateTime, nullable=True)

    # Внешние ключи
    waiter = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Связи
    waiter_user = relationship("User", back_populates="orders_created")
    tables = relationship("TableForOrder", back_populates="order_for_table")
    plates = relationship("PlateForOrder", back_populates="order", cascade="all")
