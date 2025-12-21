from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    ""
)

print(f"Подключаемся к базе данных: {DATABASE_URL.split('@')[-1]}")

# движок SQLAlchemy
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False
)

# фабрика сессий
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    """
    Генератор сессии базы данных для использования в FastAPI эндпоинтах.
    Использование:
        db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        db.rollback()
        raise e
    finally:
        db.close()

def test_connection():
    """Тестирует подключение к базе данных"""
    try:
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        print("✅ Подключение к базе данных успешно")
        return True
    except Exception as e:
        print(f"❌ Ошибка подключения к базе данных: {e}")
        return False

def get_tables_info():
    """Получает информацию о таблицах в базе данных"""
    from sqlalchemy import inspect

    db = SessionLocal()
    try:
        inspector = inspect(db.get_bind())
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
    finally:
        db.close()

if __name__ == "__main__":
    print("🧪 Тестирование подключения к базе данных...")
    if test_connection():
        get_tables_info()