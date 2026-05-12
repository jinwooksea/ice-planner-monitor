// GET /api/ybm-events

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCache, setCache, getInFlight, setInFlight, clearInFlight, LIST_CACHE_TTL_MS } from "@/lib/cache";
import { fetchYbmEvents, normalizeYbmEvents } from "@/lib/ybm-events";
import { checkRateLimit } from "@/lib/rate-limit";

const CACHE_KEY = "ybm-events";

export async function GET(req) {
  console.log("[ybm-events] start");
  const cached = getCache(CACHE_KEY);
  if (cached) {
    console.log("[ybm-events] end (cached)");
    return NextResponse.json({ events: cached.data.events, meta: { ...cached.data.meta, cached: true } });
  }

  const { allowed } = checkRateLimit(req);
  if (!allowed) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  const existing = getInFlight(CACHE_KEY);
  if (existing) {
    try {
      const result = await existing;
      return NextResponse.json({ ...result, meta: { ...result.meta, inFlightUsed: true } });
    } catch (err) {
      return NextResponse.json({ error: "YBM 이벤트 조회 실패", detail: err.message }, { status: 500 });
    }
  }

  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  setInFlight(CACHE_KEY, promise);

  try {
    const { allRaw, externalRequestCount } = await fetchYbmEvents();
    const events = normalizeYbmEvents(allRaw);
    const now    = new Date().toISOString();
    const meta   = { provider: "ybm", cached: false, fetchedCount: events.length, externalRequestCount, lastFetchedAt: now };
    const result = { events, meta };
    setCache(CACHE_KEY, result, LIST_CACHE_TTL_MS);
    resolve(result);
    console.log("[ybm-events] end");
    return NextResponse.json(result);
  } catch (err) {
    reject(err);
    console.log("[ybm-events] end (error):", err.message);
    return NextResponse.json({ error: "YBM 이벤트 목록을 가져오지 못했습니다.", detail: err.message }, { status: 500 });
  } finally {
    clearInFlight(CACHE_KEY);
  }
}
