from sqlalchemy import Column, Text, Integer, ForeignKey, VARCHAR, NUMERIC, BOOLEAN
from sqlalchemy.orm import relationship
from .base import BaseModel

class Menu(BaseModel):
    __tablename__ = "menu"

    # Основные поля
    id = Column(Integer, primary_key=True)
    name = Column(VARCHAR(100), nullable=False)
    description = Column(Text)
    photo = Column(Text)
    price = Column(NUMERIC, nullable=True)
    category = Column(Integer, ForeignKey("category.id"), nullable=True)
    is_available = Column(BOOLEAN, nullable=False)

    # Связи
    category_of_item = relationship(
        "Category",
        back_populates="items_of_category"
    )

    order_items = relationship("PlateForOrder", back_populates="menu_item")

    plate_statuses = relationship(
        "CookingStatusHistory",
        back_populates="plate_of_status"
    )
