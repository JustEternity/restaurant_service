from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    ""
)

print(f"Подключаемся к базе данных: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")

# асинхронный движок SQLAlchemy
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,
    future=True
)

# асинхронная фабрика сессий
AsyncSessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_async_db():
    """
    Асинхронный генератор сессии базы данных для использования в FastAPI эндпоинтах.
    Использование:
        db: AsyncSession = Depends(get_async_db)
    """
    db = AsyncSessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        await db.rollback()
        raise e
    finally:
        await db.close()

def get_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    sync_database_url = DATABASE_URL
    if "+asyncpg" in sync_database_url:
        sync_database_url = sync_database_url.replace("+asyncpg", "")

    sync_engine = create_engine(
        sync_database_url,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        echo=False
    )

    SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=sync_engine
    )

    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        db.rollback()
        raise e
    finally:
        db.close()

async def test_connection():
    """Асинхронно тестирует подключение к базе данных"""
    try:
        async with AsyncSessionLocal() as db:
            await db.execute("SELECT 1")
        print("✅ Подключение к базе данных успешно")
        return True
    except Exception as e:
        print(f"❌ Ошибка подключения к базе данных: {e}")
        return False

async def get_tables_info():
    """Асинхронно получает информацию о таблицах в базе данных"""
    from sqlalchemy import inspect

    async with AsyncSessionLocal() as db:
        try:
            async with db.bind.connect() as conn:
                inspector = inspect(conn)
                tables = inspector.get_table_names()

                print(f"📊 Найдено таблиц в базе данных: {len(tables)}")
                for table in tables:
                    columns = inspector.get_columns(table)
                    print(f"  {table}: {len(columns)} колонок")
                    for col in columns:
                        print(f"    - {col['name']}: {col['type']}")

                return tables
        except Exception as e:
            print(f"Ошибка при получении информации о таблицах: {e}")
            return []

if __name__ == "__main__":
    import asyncio
    print("🧪 Тестирование подключения к базе данных...")
    asyncio.run(test_connection())
    asyncio.run(get_tables_info())