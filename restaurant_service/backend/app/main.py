from fastapi import FastAPI
from app.api import users, tables, menu, orders, health, status_history, table_for_order
from app.database import engine
from app.db_models import Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Restaurant Service API")

app.include_router(users.router)
app.include_router(tables.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(health.router)
app.include_router(status_history.router)
app.include_router(table_for_order.router)

@app.get("/")
def root():
    return {"message": "Restaurant Service API работает!"}