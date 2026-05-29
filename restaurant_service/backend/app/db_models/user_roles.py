from sqlalchemy import Column, Integer, VARCHAR
from sqlalchemy.orm import relationship
from .base import BaseModel
import enum

# Перечисление для ролей
class UserRole(enum.Enum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    WAITER = "waiter"
    COOK = "cook"

class Role(BaseModel):
    __tablename__ = "user_roles"

    id = Column(Integer, primary_key=True)
    name = Column(VARCHAR(20), nullable=False)

    users_with_role = relationship("User", back_populates="role_of_user")