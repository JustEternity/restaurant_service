from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import relationship
from .base import BaseModel

class CookGroup(BaseModel):
    __tablename__ = "cook_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)

    # Связь с пользователями
    members = relationship("User", secondary="cooks_in_groups", back_populates="cook_groups")