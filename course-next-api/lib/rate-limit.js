// ============================================================
// 간단한 in-memory IP 기반 요청 제한
//
// 설계:
//   - Map<ip, { count, windowStart }>
//   - windowMs 이내 maxRequests 초과 시 429 반환
//   - 캐시 HIT 요청은 제한 적용 안 함 (isHit 플래그)
//   - 서버 재시작 시 초기화 (파일/DB 저장 없음)
// ============================================================

// IP별 요청 기록 (수집 트리거 요청만 카운트)
const store = new Map();

// 윈도우: 5분, 최대: 3회
const WINDOW_MS  = 5 * 60 * 1000;
const MAX_REQUESTS = 3;

// 오래된 항목 주기적 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of store) {
    if (now - rec.windowStart > WINDOW_MS) store.delete(ip);
  }
}, WINDOW_MS);

/**
 * 요청을 허용할지 확인합니다.
 * @param {Request} req - Next.js Request 객체
 * @returns {{ allowed: boolean, remaining: number }}
 */
export function checkRateLimit(req) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const now = Date.now();
  const rec = store.get(ip);

  if (!rec || now - rec.windowStart > WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (rec.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  rec.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - rec.count };
}
