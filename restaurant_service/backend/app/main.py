from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.websocket.router import router as websocket_router
from app.core.config import settings

from app.api import users, tables, menu, orders, health, status_history, table_for_order, auth, cook_groups, specializations, plates_for_specializations, statistics, hallmap, recommendations

from pathlib import Path
import os

app = FastAPI(
    title="Restaurant Service API",
    description="API для управления рестораном",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

app.include_router(websocket_router)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(tables.router, prefix="/api")
app.include_router(menu.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(cook_groups.router, prefix="/api")
app.include_router(status_history.router, prefix="/api")
app.include_router(table_for_order.router, prefix="/api")
app.include_router(specializations.router, prefix="/api")
app.include_router(plates_for_specializations.router, prefix="/api")
app.include_router(statistics.router, prefix="/api")
app.include_router(hallmap.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

@app.get("/")
def root():
    return {
        "message": "Restaurant Service API работает!",
        "docs": "/docs",
        "redoc": "/redoc",
        "health": "/api/health"
    }
