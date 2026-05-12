// ============================================================
// GET /api/all-courses
// 티처빌 전체 연수 통합 목록 API
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 설계 원칙:
//   - 서버 공유 메모리 캐시 (기본 24시간 TTL)
//   - In-Flight Lock: 동시 요청 10명이 눌러도 외부 수집 1회만 실행
//     → 나머지는 기존 Promise 대기 후 동일 결과 수신
//   - 페이지네이션 순차 실행, REQUEST_DELAY_MS 간격
//   - 상세 API 반복 호출 없음 — 목록 카드 데이터만 수집
//   - totalCount는 API 응답에서 동적 추출 — 하드코딩 금지
//   - 자동 갱신, cron, 파일/DB 저장 없음
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
  fetchAllCourses,
  normalizeAllCourses,
} from "@/lib/teacherville-all-courses";
import { checkRateLimit } from "@/lib/rate-limit";

const CACHE_KEY = "all-courses";

// ── meta 빌더 ────────────────────────────────────────────
function buildMeta({
  cached,
  cachedAt,
  totalCount,
  fetchedCount,
  pageSize,
  pageCount,
  externalRequestCount,
  inFlightUsed,
  lastFetchedAt,
}) {
  const ttlHours = LIST_CACHE_TTL_MS / 3_600_000;
  const nextRefreshAvailableAt = new Date(
    new Date(cachedAt).getTime() + LIST_CACHE_TTL_MS
  ).toISOString();

  return {
    cached,
    cachedAt,
    cacheTtlHours:          ttlHours,
    totalCount,             // API 응답 기준 — 하드코딩 금지
    fetchedCount,
    pageSize,
    pageCount,
    externalRequestCount,
    inFlightUsed,
    lastFetchedAt,
    nextRefreshAvailableAt,
    note: `목록 데이터는 ${ttlHours}시간 캐시 기준으로 갱신됩니다.`,
  };
}

// ============================================================
// GET /api/all-courses
// ============================================================
export async function GET(req) {
  // ── 1. 캐시 히트 ─────────────────────────────────────────
  const cached = getCache(CACHE_KEY);
  if (cached) {
    console.log("[전체연수] 캐시 HIT");
    const { courses, meta: cachedMeta } = cached.data;
    return NextResponse.json({
      courses,
      meta: buildMeta({
        cached:               true,
        cachedAt:             cached.cachedAt,
        totalCount:           cachedMeta.totalCount,
        fetchedCount:         courses.length,
        pageSize:             cachedMeta.pageSize,
        pageCount:            cachedMeta.pageCount,
        externalRequestCount: cachedMeta.externalRequestCount,
        inFlightUsed:         false,
        lastFetchedAt:        cachedMeta.lastFetchedAt,
      }),
    });
  }

  // ── 2. Rate Limit (캐시 미스 시에만 적용) ────────────────
  const { allowed } = checkRateLimit(req);
  if (!allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  // ── 3. In-Flight 대기 ─────────────────────────────────────
  // 동시에 여러 사용자가 버튼을 눌러도 외부 수집은 1회만 실행
  const existing = getInFlight(CACHE_KEY);
  if (existing) {
    console.log("[전체연수] In-Flight 대기 중...");
    try {
      const result = await existing;
      return NextResponse.json({
        ...result,
        meta: { ...result.meta, inFlightUsed: true },
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: "전체 연수 목록 조회 실패 (in-flight 대기 중 에러)",
          detail: err.message,
        },
        { status: 500 }
      );
    }
  }

  // ── 4. 새 외부 수집 실행 ─────────────────────────────────
  console.log("[전체연수] 외부 수집 시작");

  // In-Flight Promise 등록 — 대기 중인 모든 요청이 이 Promise 공유
  let resolveInFlight, rejectInFlight;
  const inFlightPromise = new Promise((res, rej) => {
    resolveInFlight = res;
    rejectInFlight  = rej;
  });
  setInFlight(CACHE_KEY, inFlightPromise);

  try {
    const { allRaw, totalCount, pageCount, externalRequestCount } =
      await fetchAllCourses();

    const courses = normalizeAllCourses(allRaw);
    const now = new Date().toISOString();

    const PAGE_SIZE = parseInt(process.env.PAGE_SIZE ?? "100", 10);

    const meta = buildMeta({
      cached:               false,
      cachedAt:             now,
      totalCount,           // API 응답 기준 (동적)
      fetchedCount:         courses.length,
      pageSize:             PAGE_SIZE,
      pageCount,
      externalRequestCount,
      inFlightUsed:         false,
      lastFetchedAt:        now,
    });

    const result = { courses, meta };

    // 캐시 저장 (기본 24시간)
    setCache(CACHE_KEY, { courses, meta: { ...meta, fetchedCount: courses.length } }, LIST_CACHE_TTL_MS);

    // 대기 중인 모든 요청에 결과 전달
    resolveInFlight(result);

    console.log(
      `[전체연수] 완료: 수집 ${courses.length}개 / API totalCount ${totalCount} / ` +
      `${externalRequestCount}회 외부요청`
    );

    return NextResponse.json(result);

  } catch (err) {
    rejectInFlight(err);
    console.error("[전체연수] 수집 실패:", err.message);
    return NextResponse.json(
      {
        error: "전체 연수 목록을 가져오는 중 오류가 발생했습니다.",
        detail: err.message,
      },
      { status: 500 }
    );
  } finally {
    clearInFlight(CACHE_KEY);
  }
}
