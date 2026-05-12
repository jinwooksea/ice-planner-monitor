// ============================================================
// GET /api/hstudy-courses
// 한국교원연수원 전체 연수 목록 API
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 설계 원칙:
//   - cheerio HTML 파싱 — JSON API 없음
//   - 서버 공유 메모리 캐시 (기본 24시간 TTL)
//   - In-Flight Lock: 동시 요청 시 수집 1회만 실행
//   - 초기 페이지 GET + AJAX 배치 POST 순차 실행
//   - 상세 페이지 수집 없음
// ============================================================

import { NextResponse } from "next/server";
import {
  getCache,
  setCache,
  getInFlight,
  setInFlight,
  clearInFlight,
  LIST_CACHE_TTL_MS,
} from "@/lib/cache";
import {
  fetchHstudyCourses,
  normalizeHstudyCourses,
} from "@/lib/hstudy-courses";
import { checkRateLimit } from "@/lib/rate-limit";

const CACHE_KEY = "hstudy-courses";

function buildMeta({
  cached,
  cachedAt,
  fetchedCount,
  pageCount,
  externalRequestCount,
  inFlightUsed,
  lastFetchedAt,
}) {
  const ttlHours = LIST_CACHE_TTL_MS / 3_600_000;
  return {
    provider:             "hstudy",
    cached,
    cachedAt,
    cacheTtlHours:        ttlHours,
    fetchedCount,
    pageCount,
    externalRequestCount,
    inFlightUsed,
    lastFetchedAt,
    nextRefreshAvailableAt: new Date(
      new Date(cachedAt).getTime() + LIST_CACHE_TTL_MS
    ).toISOString(),
    note: `목록 데이터는 ${ttlHours}시간 캐시 기준으로 갱신됩니다.`,
  };
}

export async function GET(req) {
  // ── 1. 캐시 히트 ──────────────────────────────────────
  const cached = getCache(CACHE_KEY);
  if (cached) {
    console.log("[hstudy] 캐시 HIT");
    const { courses, meta: cachedMeta } = cached.data;
    return NextResponse.json({
      courses,
      meta: buildMeta({
        cached:               true,
        cachedAt:             cached.cachedAt,
        fetchedCount:         courses.length,
        pageCount:            cachedMeta.pageCount,
        externalRequestCount: cachedMeta.externalRequestCount,
        inFlightUsed:         false,
        lastFetchedAt:        cachedMeta.lastFetchedAt,
      }),
    });
  }

  // ── 2. Rate Limit ──────────────────────────────────────
  const { allowed } = checkRateLimit(req);
  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  // ── 3. In-Flight 대기 ─────────────────────────────────
  const existing = getInFlight(CACHE_KEY);
  if (existing) {
    console.log("[hstudy] In-Flight 대기 중...");
    try {
      const result = await existing;
      return NextResponse.json({
        ...result,
        meta: { ...result.meta, inFlightUsed: true },
      });
    } catch (err) {
      return NextResponse.json(
        { error: "hstudy 목록 조회 실패 (in-flight 대기 중 에러)", detail: err.message },
        { status: 500 }
      );
    }
  }

  // ── 4. 새 수집 실행 ───────────────────────────────────
  console.log("[hstudy] 수집 시작");

  let resolveInFlight, rejectInFlight;
  const inFlightPromise = new Promise((res, rej) => {
    resolveInFlight = res;
    rejectInFlight  = rej;
  });
  setInFlight(CACHE_KEY, inFlightPromise);

  try {
    const { allRaw, pageCount, externalRequestCount } =
      await fetchHstudyCourses();

    const courses = normalizeHstudyCourses(allRaw);
    const now     = new Date().toISOString();

    const meta = buildMeta({
      cached:               false,
      cachedAt:             now,
      fetchedCount:         courses.length,
      pageCount,
      externalRequestCount,
      inFlightUsed:         false,
      lastFetchedAt:        now,
    });

    const result = { courses, meta };

    setCache(CACHE_KEY, { courses, meta }, LIST_CACHE_TTL_MS);
    resolveInFlight(result);

    console.log(
      `[hstudy] 완료: ${courses.length}개 / ${externalRequestCount}회 외부요청`
    );

    return NextResponse.json(result);

  } catch (err) {
    rejectInFlight(err);
    console.error("[hstudy] 수집 실패:", err.message);
    return NextResponse.json(
      { error: "hstudy 연수 목록을 가져오는 중 오류가 발생했습니다.", detail: err.message },
      { status: 500 }
    );
  } finally {
    clearInFlight(CACHE_KEY);
  }
}
