// ============================================================
// GET /api/ai-courses
// AI 연수 통합 목록 API
//
// 설계 원칙:
//   - 서버 공유 메모리 캐시 (12시간 TTL)
//   - In-Flight Lock: 동시 요청이 와도 외부 fetch 1회만 실행
//   - 외부 요청은 순차 실행, 최대 MAX_EXTERNAL_REQUESTS 회
//   - 강의별 상세 API 반복 호출 없음
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
import { fetchAiCourseList, normalizeAiCourses } from "@/lib/teacherville-ai-courses";

const CACHE_KEY = "ai-courses";

// ============================================================
// In-Flight Lock (모듈 레벨 — 서버 전체 공유)
//
// Next.js Route Handler에서 모듈 레벨 변수는 Node.js 프로세스
// 전체에서 공유됩니다. 이를 이용해 단일 in-flight Promise를 관리합니다.
//
// 동작:
//   캐시 유효 → 캐시 반환
//   캐시 없음 + in-flight 있음 → 기존 Promise 대기 후 결과 반환
//   캐시 없음 + in-flight 없음 → 새 외부 요청 실행 → 캐시 저장
// ============================================================

export async function GET() {
  // ── 1. 캐시 히트 ─────────────────────────────────────────
  const cached = getCache(CACHE_KEY);
  if (cached) {
    console.log("[AI 연수] 캐시 HIT");
    return NextResponse.json({
      courses: cached.data.courses,
      meta: {
        ...cached.data.meta,
        cached:       true,
        cachedAt:     cached.cachedAt,
        inFlightUsed: false,
      },
    });
  }

  // ── 2. In-Flight 대기 (다른 요청이 이미 진행 중) ─────────
  const existing = getInFlight(CACHE_KEY);
  if (existing) {
    console.log("[AI 연수] In-Flight 대기 중...");
    try {
      const result = await existing;
      return NextResponse.json({
        ...result,
        meta: { ...result.meta, inFlightUsed: true },
      });
    } catch (err) {
      // in-flight가 실패했으면 동일한 에러를 이 요청에도 반환
      return NextResponse.json(
        { error: "AI 연수 목록 조회 실패 (in-flight)", detail: err.message },
        { status: 500 }
      );
    }
  }

  // ── 3. 새 외부 요청 실행 ──────────────────────────────────
  console.log("[AI 연수] 외부 요청 시작");

  // In-Flight Promise 생성: 대기 중인 요청들이 이 Promise를 기다림
  let resolveInFlight, rejectInFlight;
  const inFlightPromise = new Promise((res, rej) => {
    resolveInFlight = res;
    rejectInFlight  = rej;
  });
  setInFlight(CACHE_KEY, inFlightPromise);

  try {
    const { rawList, ids, externalRequestCount } = await fetchAiCourseList();
    const courses = normalizeAiCourses(rawList);
    const now = new Date().toISOString();

    const meta = {
      cached:               false,
      cachedAt:             now,
      cacheTtlHours:        LIST_CACHE_TTL_MS / 3_600_000,
      courseCount:          courses.length,
      sourceCount:          1,                 // aiCourseList.edu 1개 소스
      externalRequestCount,
      inFlightUsed:         false,
      lastFetchedAt:        now,
    };

    const result = { courses, meta };

    // 캐시 저장 (12시간)
    setCache(CACHE_KEY, result, LIST_CACHE_TTL_MS);

    // 대기 중인 요청들에 결과 전달
    resolveInFlight(result);

    console.log(
      `[AI 연수] 완료: ${courses.length}개 / 외부요청 ${externalRequestCount}회`
    );
    return NextResponse.json(result);

  } catch (err) {
    // 대기 중인 요청들에도 에러 전파
    rejectInFlight(err);
    console.error("[AI 연수] 외부 요청 실패:", err.message);
    return NextResponse.json(
      { error: "AI 연수 목록을 가져오는 중 오류가 발생했습니다.", detail: err.message },
      { status: 500 }
    );
  } finally {
    // 성공/실패 관계없이 In-Flight 반드시 해제
    clearInFlight(CACHE_KEY);
  }
}
