from sqlalchemy import Column, Integer, Text, VARCHAR, BOOLEAN
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum

# Перечисление для ролей
class UserRole(enum.Enum):
    ADMIN = "admin"
    WAITER = "waiter"
    COOK = "cook"

class User(BaseModel):
    __tablename__ = "users"

    # Основные поля
    id = Column(Integer, primary_key=True)
    name = Column(VARCHAR(20), nullable=False)
    login = Column(Text, unique=True, nullable=False)
    password = Column(Text, nullable=False)
    role = Column(VARCHAR(20), nullable=False)
    is_available = Column(BOOLEAN, nullable=False)

    # Внешние связи
    orders_created = relationship(
        "Order",
        back_populates="waiter_user"
    )

    status_changes = relationship(
        "CookingStatusHistory",
        back_populates="changed_by_user"
    )
