"""
Модель предсказания времени приготовления блюда конкретным поваром.
Используется Ridge-регрессия (линейная + L2-регуляризация).

Фичи:
  - avg_time_30d       — исторический avg за 30 дней (пара повар×блюдо)
  - std_time_30d       — стандартное отклонение
  - active_tasks       — кол-во активных задач
  - current_load_min   — суммарная оставшаяся нагрузка
  - plate_count        — кол-во порций в заказе
  - hour_sin / hour_cos — время суток
  - dow_sin / dow_cos  — день недели
"""

from __future__ import annotations

import math
import pickle
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.model_selection import cross_val_score, KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

MODEL_PATH = Path(__file__).resolve().parent / "model.pkl"

FEATURE_NAMES = [
    "avg_time_30d",
    "std_time_30d",
    "active_tasks",
    "current_load_min",
    "plate_count",
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
]

@dataclass
class CookStats:
    """статистика повара по блюду за 30 дней."""
    cook_id: int
    plate_id: int
    avg_minutes: float        # среднее время приготовления
    std_minutes: float        # стандартное отклонение
    sample_count: int         # кол-во наблюдений


@dataclass
class CookLoad:
    """Текущая загрузка повара"""
    cook_id: int
    active_tasks: int
    current_load_min: float   # суммарное оставшееся время


@dataclass
class PredictRequest:
    """запрос на предсказание: повар + блюдо + данные"""
    cook_id: int
    plate_id: int
    plate_count: int
    stats: CookStats
    load: CookLoad            # текущая загрузка
    requested_at: datetime = field(default_factory=datetime.now)


@dataclass
class PredictResult:
    """Результат предсказания для одной пары повар×блюдо."""
    cook_id: int
    plate_id: int
    predicted_minutes: float  # предсказанное время приготовления
    eta_minutes: float        # когда будет готово
    confidence: float         # уверенность от 0 до1


def _cyclic(value: float, period: float):
    """Циклическое кодирование через sin/cos"""
    angle = 2 * math.pi * value / period
    return math.sin(angle), math.cos(angle)


def build_feature_vector(req: PredictRequest) -> np.ndarray:
    """Собрать numpy-вектор фичей из PredictRequest"""
    hour = req.requested_at.hour + req.requested_at.minute / 60
    dow = req.requested_at.weekday()  # 0=пн 6=вс

    hour_sin, hour_cos = _cyclic(hour, 24)
    dow_sin, dow_cos = _cyclic(dow, 7)

    # кэф для одновременного приготовления блюд
    portion_factor = 1 + math.log(max(req.plate_count, 1)) * 0.6

    features = np.array([
        req.stats.avg_minutes,
        req.stats.std_minutes,
        req.load.active_tasks,
        req.load.current_load_min,
        portion_factor,
        hour_sin,
        hour_cos,
        dow_sin,
        dow_cos,
    ], dtype=np.float64)

    return features

class CookTimePredictor:
    """
    Использование:
        predictor = CookTimePredictor()
        predictor.train(samples)          # обучение
        predictor.save()                  # сохранить в model.pkl
        predictor = CookTimePredictor.load()  # загрузить
        result = predictor.predict(req)   # предсказание
    """

    # Минимальный порог наблюдений
    MIN_SAMPLES_FOR_CONFIDENCE = 5

    def __init__(self):
        self.pipeline: Optional[Pipeline] = None
        self.trained_at: Optional[datetime] = None
        self.training_samples: int = 0

    def train(self, samples: List[tuple]) -> dict:
        """
        Обучить модель.

        samples — список кортежей (PredictRequest, actual_minutes: float).
        Возвращает словарь с метриками: train-метрики И честные CV-метрики.
        """
        if len(samples) < 10:
            raise ValueError(
                f"Недостаточно данных для обучения: {len(samples)} < 10. "
                "Накопите больше истории приготовлений."
            )

        X = np.array([build_feature_vector(req) for req, _ in samples])
        y = np.array([actual for _, actual in samples], dtype=np.float64)

        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("ridge", Ridge(alpha=1.0)),
        ])

        # При малом объёме данных (< 50)  leave-one-out (n_splits = n),
        # если больше то 5-fold.
        n_splits = min(len(samples), 5) if len(samples) >= 20 else len(samples)
        cv = KFold(n_splits=n_splits, shuffle=True, random_state=42)

        cv_mae_scores = cross_val_score(
            self.pipeline, X, y,
            cv=cv,
            scoring="neg_mean_absolute_error",
        )
        cv_rmse_scores = cross_val_score(
            self.pipeline, X, y,
            cv=cv,
            scoring="neg_root_mean_squared_error",
        )

        cv_mae  = float(np.mean(-cv_mae_scores))
        cv_rmse = float(np.mean(-cv_rmse_scores))

        #  обучение
        self.pipeline.fit(X, y)

        self.trained_at = datetime.now()
        self.training_samples = len(samples)

        # Train-метрики
        y_pred = self.pipeline.predict(X)
        train_mae  = float(np.mean(np.abs(y - y_pred)))
        train_rmse = float(np.sqrt(np.mean((y - y_pred) ** 2)))

        # Интерпретация качества
        if cv_mae < 5:
            quality = "отлично"
        elif cv_mae < 10:
            quality = "хорошо"
        elif cv_mae < 20:
            quality = "приемлемо"
        else:
            quality = "плохо — нужно больше данных"

        overfitting_gap = cv_mae - train_mae
        if overfitting_gap > train_mae * 0.5:
            overfitting_warning = (
                f"Возможное переобучение: train MAE={train_mae:.1f}, CV MAE={cv_mae:.1f}. "
                "Нужно больше данных."
            )
        else:
            overfitting_warning = None

        return {
            "samples": len(samples),
            # CV-метрики — честная оценка на новых данных
            "cv_mae_minutes":  round(cv_mae, 2),
            "cv_rmse_minutes": round(cv_rmse, 2),
            # Train-метрики — для сравнения
            "train_mae_minutes":  round(train_mae, 2),
            "train_rmse_minutes": round(train_rmse, 2),
            "quality": quality,
            "overfitting_warning": overfitting_warning,
            "cv_folds": n_splits,
            "trained_at": self.trained_at.isoformat(),
        }

    def predict(self, req: PredictRequest) -> PredictResult:
        """Предсказать время приготовления и посчитать ETA."""
        if self.pipeline is None:
            raise RuntimeError("Модель не обучена. Вызови train() или load().")

        x = build_feature_vector(req).reshape(1, -1)
        raw_pred = float(self.pipeline.predict(x)[0])

        predicted_minutes = max(raw_pred, 1.0)

        # сколько ждать с учётом текущей загрузки повара
        eta_minutes = predicted_minutes + req.load.current_load_min

        # Уверенность
        confidence = min(
            req.stats.sample_count / (self.MIN_SAMPLES_FOR_CONFIDENCE * 6),
            1.0
        )

        return PredictResult(
            cook_id=req.cook_id,
            plate_id=req.plate_id,
            predicted_minutes=round(predicted_minutes, 1),
            eta_minutes=round(eta_minutes, 1),
            confidence=round(confidence, 2),
        )

    def predict_batch(self, requests: List[PredictRequest]) -> List[PredictResult]:
        """Предсказание для списка запросов"""
        if self.pipeline is None:
            raise RuntimeError("Модель не обучена")

        X = np.array([build_feature_vector(r) for r in requests])
        raw_preds = self.pipeline.predict(X)

        results = []
        for req, raw_pred in zip(requests, raw_preds):
            predicted_minutes = max(float(raw_pred), 1.0)
            eta_minutes = predicted_minutes + req.load.current_load_min
            confidence = min(req.stats.sample_count / 30, 1.0)

            results.append(PredictResult(
                cook_id=req.cook_id,
                plate_id=req.plate_id,
                predicted_minutes=round(predicted_minutes, 1),
                eta_minutes=round(eta_minutes, 1),
                confidence=round(confidence, 2),
            ))

        return results

    def save(self, path: Path = MODEL_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f)

    @classmethod
    def load(cls, path: Path = MODEL_PATH) -> "CookTimePredictor":
        if not path.exists():
            raise FileNotFoundError(
                f"Файл модели не найден: {path}. "
                "Запусти trainer.py для первичного обучения."
            )
        with open(path, "rb") as f:
            return pickle.load(f)

    @property
    def is_trained(self) -> bool:
        return self.pipeline is not None