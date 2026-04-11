from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, VARCHAR
from sqlalchemy.orm import relationship
from .base import BaseModel
from datetime import datetime

class CookingStatusHistory(BaseModel):
    __tablename__ = "cooking_status_history"

    id = Column(Integer, ForeignKey("plates_for_order.id"), primary_key=True)
    change_time = Column(DateTime, nullable=False)
    new_status = Column(VARCHAR(100), nullable=False)
    change_by = Column(Integer, ForeignKey("users.id"))

    # Связи
    changed_by_user = relationship("User", back_populates="status_changes")
    status_to_plate = relationship("PlateForOrder", back_populates="statuses_of_plate")
