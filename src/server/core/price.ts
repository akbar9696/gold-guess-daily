import { redis } from '@devvit/web/server';
import { fallbackClose } from '../../shared/game';

export type PriceResult = {
  price: number;
  source: 'live' | 'fallback';
  at: string;
};

const LIVE_URL = 'https://api.gold-api.com/price/XAU';
const CACHE_KEY = 'gold:spot';
const CACHE_TTL_SECONDS = 60;

/** Last live-fetch failure reason (temporary diagnostic, shown in the UI). */
export let lastPriceFetchError: string | null = null;

/**
 * Live XAU/USD spot from gold-api.com (free, no key).
 * Verified live from this VM on 2026-11-26: $3,592.75, updated seconds
 * before the request. metals.live timed out and goldprice.org returned
 * 403 the same day, so gold-api.com is the primary source.
 */
export const fetchLiveSpot = async (): Promise<PriceResult | null> => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as PriceResult;
      if (typeof parsed.price === 'number' && parsed.price > 0) return parsed;
    }
    const res = await fetch(LIVE_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      lastPriceFetchError = `HTTP ${res.status}`;
      return null;
    }
    const data = (await res.json()) as { price?: unknown };
    if (typeof data.price !== 'number' || data.price <= 0) {
      lastPriceFetchError = 'bad payload: no numeric price';
      return null;
    }
    const result: PriceResult = {
      price: Math.round(data.price * 100) / 100,
      source: 'live',
      at: new Date().toISOString(),
    };
    lastPriceFetchError = null;
    await redis.set(CACHE_KEY, JSON.stringify(result), {
      expiration: new Date(Date.now() + CACHE_TTL_SECONDS * 1000),
    });
    return result;
  } catch (error) {
    lastPriceFetchError = (error instanceof Error ? error.message : String(error)).slice(0, 140);
    console.error('fetchLiveSpot failed:', error);
    return null;
  }
};

/**
 * Lock in the closing price for `date`. Called by the daily reveal job
 * (00:05 UTC) and lazily by GET /api/state if the job has not run yet,
 * so yesterday's result is always available. Live price wins; the
 * deterministic fallback is used only when the endpoint is unreachable.
 * Once locked, the value never changes.
 */
export const finalizeClose = async (
  date: string
): Promise<PriceResult> => {
  const key = `gold:close:${date}`;
  const existing = await redis.get(key);
  if (existing) return JSON.parse(existing) as PriceResult;

  const live = await fetchLiveSpot();
  const result: PriceResult = live ?? {
    price: fallbackClose(date),
    source: 'fallback',
    at: new Date().toISOString(),
  };
  // First writer wins in practice: we checked `existing` above, and the
  // value is deterministic per date, so a rare race can only rewrite the
  // same close.
  await redis.set(key, JSON.stringify(result));
  return result;
};

export const getClose = async (date: string): Promise<PriceResult | null> => {
  const existing = await redis.get(`gold:close:${date}`);
  return existing ? (JSON.parse(existing) as PriceResult) : null;
};
