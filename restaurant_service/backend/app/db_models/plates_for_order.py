from sqlalchemy import Column, Integer, Text, ForeignKey, NUMERIC, BOOLEAN
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum

class CookingStatus(enum.Enum):
    WAITING = "waiting"
    PREPARING = "preparing"
    READY = "ready"
    SERVED = "served"

class PlateForOrder(BaseModel):
    __tablename__ = "plates_for_order"

    # Основные поля
    id = Column(Integer, primary_key=True)
    count = Column(Integer, nullable=False)
    comment = Column(Text)
    price = Column(NUMERIC, nullable=False)
    course_number = Column(Integer)
    is_considered = Column(BOOLEAN)

    # Внешние ключи
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    plate_id = Column(Integer, ForeignKey("menu.id"), nullable=False)

    # Связи
    order = relationship("Order", back_populates="plates")
    menu_item = relationship("Menu", back_populates="order_items")
    statuses_of_plate = relationship("CookingStatusHistory", back_populates="status_to_plate", cascade="all")
