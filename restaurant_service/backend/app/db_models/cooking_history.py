from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship
from .base import BaseModel
from datetime import datetime

class CookingStatusHistory(BaseModel):
    __tablename__ = "cooking_status_history"

    # Основные поля
    id = Column(Integer, primary_key=True)
    change_time = Column(DateTime, nullable=False)
    new_status = Column(VARCHAR(100), nullable=False)

    # Внешние ключи
    order_id = Column(Integer, ForeignKey("orders.id"))
    plate_id = Column(Integer, ForeignKey("menu.id"), nullable=False)
    change_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Связи
    history_of_order = relationship(
        "Order",
        back_populates="history_order"
    )

    changed_by_user = relationship(
        "User",
        back_populates="status_changes"
    )

    plate_of_status = relationship(
        "Menu",
        back_populates="plate_statuses"
    )
