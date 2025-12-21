from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .base import BaseModel

class TableForOrder(BaseModel):
    __tablename__ = "tables_for_order"

    id = Column(Integer, primary_key=True)
    # Внешние ключи
    order = Column(Integer, ForeignKey("orders.id"))
    table = Column(Integer, ForeignKey("tables.id"))

    # Связи
    order_for_table = relationship("Order", back_populates="tables")
    table_for_order = relationship("Table", back_populates="orders")
