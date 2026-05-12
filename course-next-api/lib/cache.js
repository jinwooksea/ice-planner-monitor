// ============================================================
// 서버 공용 메모리 캐시 + In-Flight Lock
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 설계 원칙:
//   - 모듈 레벨 변수 → Next.js Node.js 프로세스 전체 공유
//   - 사용자별 캐시 아님 — 서버 전체 공유 캐시
//   - 서버 재시작 시 초기화 (의도적 설계 — 파일/DB 저장 없음)
//   - cron, setInterval, 자동 갱신 없음
// ============================================================

// ============================================================
// 운영 상수 (환경변수로 재정의 가능)
// ============================================================

/**
 * 통합 목록 캐시 TTL
 * 기본 24시간 — 환경변수로 12h~24h 사이 조정 권장
 * 값이 작을수록 외부 요청 빈도 증가
 */
export const LIST_CACHE_TTL_MS = parseInt(
  process.env.LIST_CACHE_TTL_MS ?? String(24 * 60 * 60 * 1000),
  10
);

/** 상세 단건 캐시 TTL: 기본 1시간 */
export const DETAIL_CACHE_TTL_MS = parseInt(
  process.env.DETAIL_CACHE_TTL_MS ?? String(1 * 60 * 60 * 1000),
  10
);

/**
 * 외부 요청 사이 대기 시간
 * 기본 1000ms — 대상 서버 부담 최소화
 */
export const REQUEST_DELAY_MS = parseInt(
  process.env.REQUEST_DELAY_MS ?? "1000",
  10
);

/**
 * 한 번의 통합 수집에서 허용하는 최대 외부 요청 수
 * 기본 20 — 초과 시 수집 중단 후 에러
 */
export const MAX_EXTERNAL_REQUESTS = parseInt(
  process.env.MAX_EXTERNAL_REQUESTS ?? "20",
  10
);

/** 가져올 최대 강의 수 */
export const MAX_COURSE_COUNT = parseInt(
  process.env.MAX_COURSE_COUNT ?? "500",
  10
);

// ============================================================
// 캐시 스토어
// Map<key, { data, cachedAt: ISO string, expireAt: number }>
// ============================================================
const store = new Map();

/**
 * 캐시에서 항목을 조회합니다.
 * 만료된 항목은 자동 삭제 후 null 반환.
 * @returns {{ data: unknown; cachedAt: string } | null}
 */
export function getCache(key) {
  const entry = store.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expireAt) {
    store.delete(key);
    return null;
  }

  return { data: entry.data, cachedAt: entry.cachedAt };
}

/**
 * 캐시에 항목을 저장합니다.
 * @param {string} key
 * @param {unknown} data
 * @param {number} ttlMs  유효 시간 (밀리초)
 */
export function setCache(key, data, ttlMs) {
  store.set(key, {
    data,
    cachedAt: new Date().toISOString(),
    expireAt: Date.now() + ttlMs,
  });
}

/** 캐시에서 항목을 삭제합니다. */
export function deleteCache(key) {
  store.delete(key);
}

// ============================================================
// In-Flight Lock
//
// 동시에 여러 요청이 들어와도 외부 fetch는 한 번만 실행됩니다.
// Map<key, Promise> — goodsCode별 개별 lock도 지원합니다.
// ============================================================
const inFlightMap = new Map();

/** 진행 중인 Promise를 반환합니다. 없으면 null. */
export function getInFlight(key) {
  return inFlightMap.get(key) ?? null;
}

/** In-Flight Promise를 등록합니다. */
export function setInFlight(key, promise) {
  inFlightMap.set(key, promise);
}

/**
 * In-Flight를 해제합니다.
 * 요청 완료/실패 후 finally 블록에서 반드시 호출.
 */
export function clearInFlight(key) {
  inFlightMap.delete(key);
}

// ============================================================
// 유틸
// ============================================================

/** ms 동안 대기합니다. 순차 요청 간 지연에 사용. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 현재 캐시 상태 요약 (디버깅/모니터링용) */
export function getCacheStatus() {
  const now = Date.now();
  const entries = [];
  store.forEach((entry, key) => {
    entries.push({
      key,
      cachedAt: entry.cachedAt,
      expiresInSec: Math.round((entry.expireAt - now) / 1000),
    });
  });
  return {
    count: entries.length,
    inFlightCount: inFlightMap.size,
    entries,
  };
}
