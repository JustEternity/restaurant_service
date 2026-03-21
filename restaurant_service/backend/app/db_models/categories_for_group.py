from sqlalchemy import Column, Integer, ForeignKey
from app.database import Base
from sqlalchemy.orm import relationship

class CategoriesForGroup(Base):
    __tablename__ = "categories_for_group"

    id = Column(Integer, primary_key=True, index=True)
    group = Column(Integer, ForeignKey("cook_groups.id"))
    category = Column(Integer, ForeignKey("category.id"))

    category_for_group = relationship("Category", back_populates="categories_for_groups")
    group_for_category = relationship("CookGroup", back_populates="categories_of_group")