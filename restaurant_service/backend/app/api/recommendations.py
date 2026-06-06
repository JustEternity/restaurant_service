from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.db_models import User
from app.core.security import get_current_user
from app.ml.recommendation_model import (
    CookLoad,
    CookStats,
    CookTimePredictor,
    PredictRequest,
    PredictResult,
    MODEL_PATH
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recommend", tags=["recommendations"])

_predictor: Optional[CookTimePredictor] = None


def get_predictor() -> CookTimePredictor:
    global _predictor
    if _predictor is None:
        try:
            _predictor = CookTimePredictor.load()
            print(f">>> Модель загружена: {_predictor.training_samples} примеров")
        except Exception as e:
            print(f">>> ОШИБКА загрузки: {type(e).__name__}: {e}")
            raise HTTPException(status_code=503, detail="Модель не обучена")
    return _predictor


def reload_predictor():
    global _predictor
    _predictor = None

class PlateItemRequest(BaseModel):
    plate_order_id: int
    plate_id: int
    plate_count: int = 1


class CookItemRequest(BaseModel):
    cook_id: int
    specialization_id: Optional[int] = None


class RecommendRequest(BaseModel):
    plates: List[PlateItemRequest]
    cooks: List[CookItemRequest]


class CookRecommendation(BaseModel):
    cook_id: int
    predicted_minutes: float
    eta_minutes: float
    confidence: float


class PlateRecommendation(BaseModel):
    plate_order_id: int
    plate_id: int
    best_cook_id: Optional[int]
    best_eta_minutes: Optional[float]
    all_cooks: List[CookRecommendation]


class RecommendResponse(BaseModel):
    plates: List[PlateRecommendation]
    model_trained_at: Optional[str]
    fallback_used: bool

STATS_QUERY = text("""
    WITH prep AS (
        SELECT DISTINCT ON (h.ordered_plate)
            h.ordered_plate  AS plate_order_id,
            h.change_by      AS cook_id,
            h.change_time    AS started_at
        FROM cooking_status_history h
        WHERE h.new_status = 'preparing'
          AND h.change_time >= :since
          AND h.change_by = ANY(:cook_ids)
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
        WHERE pfo.plate_id = ANY(:plate_ids)
          AND done.finished_at > prep.started_at
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

ACTIVE_TASKS_QUERY = text("""
    WITH last_status AS (
        SELECT DISTINCT ON (ordered_plate)
            ordered_plate,
            new_status,
            change_by,
            change_time
        FROM cooking_status_history
        ORDER BY ordered_plate, change_time DESC
    ),
    active AS (
        SELECT
            ls.change_by      AS cook_id,
            ls.ordered_plate  AS plate_order_id,
            ls.change_time    AS started_at,
            pfo.plate_id
        FROM last_status ls
        JOIN plates_for_order pfo ON pfo.id = ls.ordered_plate
        WHERE ls.new_status = 'preparing'
          AND ls.change_by = ANY(:cook_ids)
    ),
    hist_stats AS (
        WITH p2 AS (
            SELECT DISTINCT ON (h2.ordered_plate)
                h2.ordered_plate, h2.change_by AS cook_id, h2.change_time AS s
            FROM cooking_status_history h2
            WHERE h2.new_status = 'preparing'
              AND h2.change_time >= NOW() - INTERVAL '30 days'
            ORDER BY h2.ordered_plate, h2.change_time ASC
        ),
        d2 AS (
            SELECT DISTINCT ON (h3.ordered_plate)
                h3.ordered_plate, h3.change_time AS f
            FROM cooking_status_history h3
            WHERE h3.new_status = 'ready'
              AND h3.change_time >= NOW() - INTERVAL '30 days'
            ORDER BY h3.ordered_plate, h3.change_time ASC
        )
        SELECT
            p2.cook_id,
            pfo2.plate_id,
            AVG(EXTRACT(EPOCH FROM (d2.f - p2.s)) / 60.0) AS avg_min
        FROM p2
        JOIN d2   ON d2.ordered_plate = p2.ordered_plate
        JOIN plates_for_order pfo2 ON pfo2.id = p2.ordered_plate
        WHERE d2.f > p2.s
        GROUP BY p2.cook_id, pfo2.plate_id
    )
    SELECT
        a.cook_id,
        COUNT(*)  AS active_tasks,
        COALESCE(SUM(
            GREATEST(
                0,
                COALESCE(hs.avg_min, 15)
                - EXTRACT(EPOCH FROM (NOW() - a.started_at)) / 60.0
            ) * 0.6
        ), 0) AS current_load_min
    FROM active a
    LEFT JOIN hist_stats hs ON hs.cook_id = a.cook_id AND hs.plate_id = a.plate_id
    GROUP BY a.cook_id
""")


async def fetch_cook_stats(
    db: AsyncSession,
    cook_ids: List[int],
    plate_ids: List[int],
    lookback_days: int = 30,
) -> Dict[tuple, CookStats]:
    since = datetime.now() - timedelta(days=lookback_days)
    result = await db.execute(STATS_QUERY, {
        "since": since,
        "cook_ids": cook_ids,
        "plate_ids": plate_ids,
    })
    rows = result.fetchall()

    out: Dict[tuple, CookStats] = {}
    for row in rows:
        key = (int(row.cook_id), int(row.plate_id))
        out[key] = CookStats(
            cook_id=int(row.cook_id),
            plate_id=int(row.plate_id),
            avg_minutes=float(row.avg_minutes),
            std_minutes=float(row.std_minutes),
            sample_count=int(row.sample_count),
        )
    return out


async def fetch_cook_loads(
    db: AsyncSession,
    cook_ids: List[int],
) -> Dict[int, CookLoad]:
    result = await db.execute(ACTIVE_TASKS_QUERY, {"cook_ids": cook_ids})
    rows = result.fetchall()

    out = {
        cid: CookLoad(cook_id=cid, active_tasks=0, current_load_min=0.0)
        for cid in cook_ids
    }
    for row in rows:
        out[int(row.cook_id)] = CookLoad(
            cook_id=int(row.cook_id),
            active_tasks=int(row.active_tasks),
            current_load_min=float(row.current_load_min),
        )
    return out


# Минимальное кол-во наблюдений для пары повар х блюдо, ниже порога — эвристика, выше — модель.
MIN_SAMPLES_FOR_MODEL = 5


def heuristic_eta(stats: CookStats, load: CookLoad, plate_count: int) -> float:
    import math
    portion_factor = 1 + math.log(max(plate_count, 1)) * 0.6
    return load.current_load_min + stats.avg_minutes * portion_factor


def _predict_one(
    predictor: Optional[CookTimePredictor],
    cook_item: CookItemRequest,
    plate_item: PlateItemRequest,
    stats: CookStats,
    load: CookLoad,
    now: datetime,
) -> CookRecommendation:
    """
    Выбирает метод расчёта для одной пары повар×блюдо:
      - модель,    если predictor загружен и достаточно данных (>= MIN_SAMPLES_FOR_MODEL)
      - эвристика, если данных мало или модель не обучена
    """
    use_model = (
        predictor is not None
        and stats.sample_count >= MIN_SAMPLES_FOR_MODEL
    )

    if use_model:
        req = PredictRequest(
            cook_id=cook_item.cook_id,
            plate_id=plate_item.plate_id,
            plate_count=plate_item.plate_count,
            stats=stats,
            load=load,
            requested_at=now,
        )
        res: PredictResult = predictor.predict(req)
        return CookRecommendation(
            cook_id=cook_item.cook_id,
            predicted_minutes=res.predicted_minutes,
            eta_minutes=res.eta_minutes,
            confidence=res.confidence,
        )
    else:
        # Эвристика: avg_time * portion_factor + текущая нагрузка
        eta = heuristic_eta(stats, load, plate_item.plate_count)
        return CookRecommendation(
            cook_id=cook_item.cook_id,
            predicted_minutes=stats.avg_minutes,
            eta_minutes=eta,
            confidence=min(stats.sample_count / MIN_SAMPLES_FOR_MODEL, 1.0),
        )

@router.post("/plates", response_model=RecommendResponse)
async def recommend_plates(
    body: RecommendRequest,
    db: AsyncSession = Depends(get_async_db),
):
    logger.info(f"=== /recommend/plates вызван, MODEL_PATH={MODEL_PATH.resolve()}")
    if not body.plates or not body.cooks:
        return RecommendResponse(plates=[], model_trained_at=None, fallback_used=False)

    cook_ids  = [c.cook_id for c in body.cooks]
    plate_ids = list({p.plate_id for p in body.plates})

    stats_map = await fetch_cook_stats(db, cook_ids, plate_ids)
    loads_map = await fetch_cook_loads(db, cook_ids)

    predictor: Optional[CookTimePredictor] = None
    try:
        predictor = get_predictor()
    except HTTPException:
        logger.warning("Модель не обучена — все пары считаются эвристикой")

    now = datetime.now()
    plate_recs: List[PlateRecommendation] = []

    model_used_count = 0
    heuristic_used_count = 0

    for plate_item in body.plates:
        cook_results: List[CookRecommendation] = []

        for cook_item in body.cooks:
            key = (cook_item.cook_id, plate_item.plate_id)
            stats = stats_map.get(key, CookStats(
                cook_id=cook_item.cook_id,
                plate_id=plate_item.plate_id,
                avg_minutes=20.0,
                std_minutes=5.0,
                sample_count=0,
            ))
            load = loads_map.get(
                cook_item.cook_id,
                CookLoad(cook_id=cook_item.cook_id, active_tasks=0, current_load_min=0.0),
            )

            rec = _predict_one(predictor, cook_item, plate_item, stats, load, now)
            cook_results.append(rec)

            if predictor and stats.sample_count >= MIN_SAMPLES_FOR_MODEL:
                model_used_count += 1
            else:
                heuristic_used_count += 1

        cook_results.sort(key=lambda r: r.eta_minutes)
        best = cook_results[0] if cook_results else None

        plate_recs.append(PlateRecommendation(
            plate_order_id=plate_item.plate_order_id,
            plate_id=plate_item.plate_id,
            best_cook_id=best.cook_id if best else None,
            best_eta_minutes=best.eta_minutes if best else None,
            all_cooks=cook_results,
        ))

    total = model_used_count + heuristic_used_count
    if total > 0:
        logger.debug(
            f"Рекомендации: модель={model_used_count}/{total}, "
            f"эвристика={heuristic_used_count}/{total} "
            f"(порог MIN_SAMPLES={MIN_SAMPLES_FOR_MODEL})"
        )

    # fallback_used=True если хотя бы одна пара считалась эвристикой
    fallback_used = heuristic_used_count > 0

    return RecommendResponse(
        plates=plate_recs,
        model_trained_at=(
            predictor.trained_at.isoformat()
            if predictor and predictor.trained_at else None
        ),
        fallback_used=fallback_used,
    )


@router.post("/reload-model")
async def reload_model(current_user: User = Depends(get_current_user),):
    """Перезагрузить model.pkl без рестарта сервера"""
    reload_predictor()
    predictor = get_predictor()
    return {
        "status": "ok",
        "trained_at": predictor.trained_at.isoformat() if predictor.trained_at else None,
        "samples": predictor.training_samples,
    }