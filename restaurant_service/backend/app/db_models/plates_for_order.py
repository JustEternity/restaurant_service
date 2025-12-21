from sqlalchemy import Column, Integer, Text, ForeignKey, VARCHAR, NUMERIC
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
    cooking_status = Column(VARCHAR(20), nullable=False)
    price = Column(NUMERIC, nullable=False)

    # Внешние ключи
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    plate_id = Column(Integer, ForeignKey("menu.id"), nullable=False)

    # Связи
    order = relationship(
        "Order",
        back_populates="plates"
    )
    menu_item = relationship(
        "Menu",
        back_populates="order_items"
    )

