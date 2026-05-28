from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from .base import BaseModel

class CookGroup(BaseModel):
    __tablename__ = "cook_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)

    members = relationship("CooksInGroup", back_populates="group_of_cooks", passive_deletes=True)