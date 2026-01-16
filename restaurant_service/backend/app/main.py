from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

from app.api import users, tables, menu, orders, health, status_history, table_for_order, auth

from app.database import engine
from app.db_models import Base

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Restaurant Service API",
    description="API для управления рестораном",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:19006",
        "http://localhost:19000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(tables.router, prefix="/api")
app.include_router(menu.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(status_history.router, prefix="/api")
app.include_router(table_for_order.router, prefix="/api")

@app.get("/")
def root():
    return {
        "message": "Restaurant Service API работает!",
        "docs": "/docs",
        "redoc": "/redoc",
        "health": "/api/health"
    }

@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    return {"error": f"Путь {full_path} не найден"}