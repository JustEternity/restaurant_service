from sqlalchemy import Column, Integer, Text, VARCHAR, BOOLEAN, ForeignKey
from sqlalchemy.orm import relationship
from .base import BaseModel

class User(BaseModel):
    __tablename__ = "users"

    # Основные поля
    id = Column(Integer, primary_key=True)
    name = Column(VARCHAR(20), nullable=False)
    login = Column(Text, unique=True, nullable=False)
    password = Column(Text, nullable=False)
    role = Column(VARCHAR(20), ForeignKey("user_roles.id"), nullable=False)
    is_available = Column(BOOLEAN, nullable=False)
    specialization = Column(Integer, ForeignKey("specialization.id"), nullable=True)

    # Внешние связи
    orders_created = relationship("Order", back_populates="waiter_user")
    status_changes = relationship("CookingStatusHistory", back_populates="changed_by_user")
    user_in_group = relationship("CooksInGroup", back_populates="cooks_in_group")
    role_of_user = relationship("Role", back_populates="users_with_role")
    specialization_of_user = relationship("Specialization", back_populates="users_with_specialization")
