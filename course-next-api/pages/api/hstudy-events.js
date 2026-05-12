// GET /api/hstudy-events

import { getInFlight, setInFlight, clearInFlight } from "@/lib/cache";
import { fetchHstudyEvents, normalizeHstudyEvents } from "@/lib/hstudy-events";
import { checkRateLimit } from "@/lib/rate-limit";

const CACHE_KEY = "hstudy-events";
const TTL = 1000 * 60 * 5;
let cache = { data: null, fetchedAt: 0 };

export default async function handler(req, res) {
  console.log("[hstudy-events] start");

  if (cache.data && Date.now() - cache.fetchedAt < TTL) {
    console.log("[hstudy-events] end (cached)");
    return res.status(200).json(cache.data);
  }

  const reqAdapter = { headers: { get: (key) => req.headers[key] ?? null } };
  const { allowed } = checkRateLimit(reqAdapter);
  if (!allowed) {
    return res.status(429).json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  }

  const existing = getInFlight(CACHE_KEY);
  if (existing) {
    try {
      const result = await existing;
      return res.status(200).json({ ...result, meta: { ...result.meta, inFlightUsed: true } });
    } catch (err) {
      return res.status(500).json({ error: "hstudy 이벤트 조회 실패", detail: err.message });
    }
  }

  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  setInFlight(CACHE_KEY, promise);

  try {
    const { allRaw, externalRequestCount } = await fetchHstudyEvents();
    const events = normalizeHstudyEvents(allRaw);
    const now    = new Date().toISOString();
    const meta   = { provider: "hstudy", cached: false, fetchedCount: events.length, externalRequestCount, lastFetchedAt: now };
    const result = { events, meta };
    cache = { data: result, fetchedAt: Date.now() };
    resolve(result);
    console.log("[hstudy-events] end");
    return res.status(200).json(result);
  } catch (err) {
    reject(err);
    console.log("[hstudy-events] end (error):", err.message);
    return res.status(500).json({ error: "hstudy 이벤트 목록을 가져오지 못했습니다.", detail: err.message });
  } finally {
    clearInFlight(CACHE_KEY);
  }
}
