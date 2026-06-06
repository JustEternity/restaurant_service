from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Tuple

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .recommendation_model import (
    CookLoad,
    CookStats,
    CookTimePredictor,
    PredictRequest,
)

logger = logging.getLogger(__name__)

HISTORY_QUERY = text("""
    WITH prep AS (
        SELECT DISTINCT ON (h.ordered_plate)
            h.ordered_plate  AS plate_order_id,
            h.change_by      AS cook_id,
            h.change_time    AS started_at
        FROM cooking_status_history h
        WHERE h.new_status = 'preparing'
          AND h.change_time >= :since
        ORDER BY h.ordered_plate, h.change_time ASC
    ),
    done AS (
        SELECT DISTINCT ON (h.ordered_plate)
            h.ordered_plate AS plate_order_id,
            h.change_time   AS finished_at
        FROM cooking_status_history h
        WHERE h.new_status = 'ready'
          AND h.change_time >= :since
        ORDER BY h.ordered_plate, h.change_time ASC
    )
    SELECT
        prep.cook_id,
        pfo.plate_id,
        pfo.count                                                           AS plate_count,
        o.timestart                                                         AS order_started_at,
        prep.started_at,
        done.finished_at,
        EXTRACT(EPOCH FROM (done.finished_at - prep.started_at)) / 60.0    AS actual_minutes
    FROM prep
    JOIN done                ON done.plate_order_id = prep.plate_order_id
    JOIN plates_for_order pfo ON pfo.id             = prep.plate_order_id
    JOIN orders o             ON o.id               = pfo.order_id
    WHERE done.finished_at > prep.started_at
      AND EXTRACT(EPOCH FROM (done.finished_at - prep.started_at)) BETWEEN 0.5 AND 10800
    ORDER BY prep.started_at
""")

STATS_QUERY = text("""
    WITH prep AS (
        SELECT DISTINCT ON (h.ordered_plate)
            h.ordered_plate AS plate_order_id,
            h.change_by     AS cook_id,
            h.change_time   AS started_at
        FROM cooking_status_history h
        WHERE h.new_status = 'preparing'
          AND h.change_time >= :since
        ORDER BY h.ordered_plate, h.change_time ASC
    ),
    done AS (
        SELECT DISTINCT ON (h.ordered_plate)
            h.ordered_plate AS plate_order_id,
            h.change_time   AS finished_at
        FROM cooking_status_history h
        WHERE h.new_status = 'ready'
          AND h.change_time >= :since
        ORDER BY h.ordered_plate, h.change_time ASC
    ),
    intervals AS (
        SELECT
            prep.cook_id,
            pfo.plate_id,
            EXTRACT(EPOCH FROM (done.finished_at - prep.started_at)) / 60.0 AS minutes
        FROM prep
        JOIN done ON done.plate_order_id = prep.plate_order_id
        JOIN plates_for_order pfo ON pfo.id = prep.plate_order_id
        WHERE done.finished_at > prep.started_at
          AND EXTRACT(EPOCH FROM (done.finished_at - prep.started_at)) BETWEEN 0.5 AND 10800
    )
    SELECT
        cook_id,
        plate_id,
        AVG(minutes)                   AS avg_minutes,
        COALESCE(STDDEV(minutes), 3.0) AS std_minutes,
        COUNT(*)                       AS sample_count
    FROM intervals
    GROUP BY cook_id, plate_id
""")


async def build_training_data(
    db: AsyncSession,
    lookback_days: int = 90,
) -> List[Tuple[PredictRequest, float]]:
    since = datetime.now() - timedelta(days=lookback_days)

    # Статистика повар x блюдо
    result = await db.execute(STATS_QUERY, {"since": since})
    stats_rows = result.fetchall()

    stats_map: dict[tuple, CookStats] = {}
    for row in stats_rows:
        key = (int(row.cook_id), int(row.plate_id))
        stats_map[key] = CookStats(
            cook_id=int(row.cook_id),
            plate_id=int(row.plate_id),
            avg_minutes=float(row.avg_minutes or 20.0),
            std_minutes=float(row.std_minutes or 5.0),
            sample_count=int(row.sample_count),
        )

    # Сырая история
    result = await db.execute(HISTORY_QUERY, {"since": since})
    rows = result.fetchall()
    logger.info(f"Загружено {len(rows)} записей из истории за {lookback_days} дней")

    samples: List[Tuple[PredictRequest, float]] = []
    for row in rows:
        key = (int(row.cook_id), int(row.plate_id))
        stats = stats_map.get(key, CookStats(
            cook_id=int(row.cook_id),
            plate_id=int(row.plate_id),
            avg_minutes=20.0,
            std_minutes=5.0,
            sample_count=1,
        ))
        load = CookLoad(cook_id=int(row.cook_id), active_tasks=0, current_load_min=0.0)
        req = PredictRequest(
            cook_id=int(row.cook_id),
            plate_id=int(row.plate_id),
            plate_count=int(row.plate_count),
            stats=stats,
            load=load,
            requested_at=row.started_at,
        )
        samples.append((req, float(row.actual_minutes)))

    return samples


async def run_training(db: AsyncSession, lookback_days: int = 90) -> dict:
    logger.info("=== Начало обучения модели рекомендаций ===")

    samples = await build_training_data(db, lookback_days)

    if len(samples) < 10:
        msg = (
            f"Недостаточно данных: {len(samples)} записей. "
            "Нужно минимум 10."
        )
        logger.warning(msg)
        return {"error": msg, "samples": len(samples)}

    predictor = CookTimePredictor()
    metrics = predictor.train(samples)
    predictor.save()

    logger.info(
        f"✅ Модель обучена: {metrics['samples']} примеров\n"
        f"   CV  MAE={metrics['cv_mae_minutes']} мин  RMSE={metrics['cv_rmse_minutes']} мин  "
        f"({metrics['cv_folds']}-fold) — честная оценка\n"
        f"   Train MAE={metrics['train_mae_minutes']} мин  RMSE={metrics['train_rmse_minutes']} мин — оптимистичная\n"
        f"   Качество: {metrics['quality']}"
    )
    if metrics.get("overfitting_warning"):
        logger.warning(f"⚠️  {metrics['overfitting_warning']}")
    return metrics

async def _main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await run_training(db)
        print("\nРезультат обучения:", result)


if __name__ == "__main__":
    asyncio.run(_main())