import api from './api';

interface Specialization {
  id: number;
  name: string;
}

interface Cook {
  id: number;
  name: string;
  specialization?: Specialization;
}

interface FlatOrderedPlate {
  uid: string;
  plate_name: string;
  count: number;
  comments: string[];
  current_status: string;
  order_id: number;
  plate_order_id: number;
  table_numbers: number[];
  timestart: string;
  plate_id: number;
  course_number: number;
  highlightedAsEarlyCourse?: boolean;
  waitingMinutes?: number;
  cook_id_preparing?: number | null;
  recommended?: boolean;
  recommendedCookId?: number;
  recommendedCookName?: string;
  priorityScore?: number;
}

interface CookRecommendation {
  cook_id: number;
  predicted_minutes: number;
  eta_minutes: number;
  confidence: number;
}

interface PlateRecommendation {
  plate_order_id: number;
  plate_id: number;
  best_cook_id: number | null;
  best_eta_minutes: number | null;
  all_cooks: CookRecommendation[];
}

interface RecommendResponse {
  plates: PlateRecommendation[];
  model_trained_at: string | null;
  fallback_used: boolean;
}

// Кэш

interface CacheEntry {
  key: string;
  data: RecommendResponse;
  ts: number;
}

let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15_000;

function buildCacheKey(plates: FlatOrderedPlate[], cooks: Cook[]): string {
  return JSON.stringify({
    p: plates.map(p => `${p.plate_order_id}:${p.count}`),
    c: cooks.map(c => c.id),
  });
}

export async function applyRecommendations(
  plates: FlatOrderedPlate[],
  currentCookId: number,
  cooks: Cook[],
): Promise<FlatOrderedPlate[]> {
  if (plates.length === 0 || cooks.length === 0) return plates;

  const cacheKey = buildCacheKey(plates, cooks);
  const now = Date.now();

  // закэшированный результат если он свежий
  if (_cache && _cache.key === cacheKey && now - _cache.ts < CACHE_TTL_MS) {
    return mergePlatesWithRecs(plates, _cache.data.plates, cooks, currentCookId);
  }

  let response: RecommendResponse;
  try {
    const res = await api.post<RecommendResponse>('/recommend/plates', {
      plates: plates.map(p => ({
        plate_order_id: p.plate_order_id,
        plate_id: p.plate_id,
        plate_count: p.count,
      })),
      cooks: cooks.map(c => ({
        cook_id: c.id,
        specialization_id: c.specialization?.id ?? null,
      })),
    });
    response = res.data;
    _cache = { key: cacheKey, data: response, ts: now };

    if (response.fallback_used) {
      console.log('[recommendations] Часть пар считается эвристикой (мало данных)');
    }
  } catch (error) {
    console.warn('[recommendations] Сервер недоступен, возвращаем без рекомендаций:', error);
    return plates.map(p => ({
      ...p,
      recommended: false,
      recommendedCookId: undefined,
      recommendedCookName: undefined,
      priorityScore: undefined,
    }));
  }

  return mergePlatesWithRecs(plates, response.plates, cooks, currentCookId);
}

function mergePlatesWithRecs(
  plates: FlatOrderedPlate[],
  recs: PlateRecommendation[],
  cooks: Cook[],
  currentCookId: number,
): FlatOrderedPlate[] {
  const recMap = new Map<number, PlateRecommendation>();
  recs.forEach(r => recMap.set(r.plate_order_id, r));

  return plates.map(plate => {
    const rec = recMap.get(plate.plate_order_id);
    if (!rec || rec.best_cook_id === null) {
      return { ...plate, recommended: false };
    }

    const bestCookName = cooks.find(c => c.id === rec.best_cook_id)?.name;

    return {
      ...plate,
      recommended: rec.best_cook_id === currentCookId,
      recommendedCookId: rec.best_cook_id,
      recommendedCookName: bestCookName,
      // priorityScore = ETA лучшего повара
      priorityScore: rec.best_eta_minutes ?? undefined,
    };
  });
}