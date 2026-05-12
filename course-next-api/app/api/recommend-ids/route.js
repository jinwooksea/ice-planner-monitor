// ============================================================
// GET /api/recommend-ids
// 비로그인 AI 추천 강의 ID 목록 (랭킹 점수 계산용)
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 설계 원칙:
//   - 외부 요청 1회 (추천 ID만 수집 — 카드 상세 API 없음)
//   - 서버 공유 메모리 캐시 (기본 12시간 TTL)
//   - In-Flight Lock: 동시 요청 시 외부 수집 1회만 실행
//   - 수집 실패 시 클라이언트는 빈 Set으로 점수 계산 (전체 목록은 영향 없음)
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
import { fetchRecommendIds } from "@/lib/teacherville-recommend";

const CACHE_KEY = "recommend-ids";
// 추천 데이터는 12시간 캐시 (전체 목록 24h의 절반)
const TTL_MS = Math.floor(LIST_CACHE_TTL_MS / 2);

export async function GET() {
  // ── 1. 캐시 히트 ──────────────────────────────────────────
  const cached = getCache(CACHE_KEY);
  if (cached) {
    console.log("[추천ID] 캐시 HIT");
    return NextResponse.json({
      ...cached.data,
      cached: true,
      cachedAt: cached.cachedAt,
    });
  }

  // ── 2. In-Flight 대기 ─────────────────────────────────────
  const existing = getInFlight(CACHE_KEY);
  if (existing) {
    console.log("[추천ID] In-Flight 대기 중...");
    try {
      const result = await existing;
      return NextResponse.json({ ...result, inFlightUsed: true });
    } catch (err) {
      return NextResponse.json(
        { error: "추천 ID 조회 실패 (in-flight 대기 중 에러)", detail: err.message },
        { status: 500 }
      );
    }
  }

  // ── 3. 새 외부 수집 실행 ─────────────────────────────────
  console.log("[추천ID] 외부 수집 시작");

  let resolveInFlight, rejectInFlight;
  const inFlightPromise = new Promise((res, rej) => {
    resolveInFlight = res;
    rejectInFlight  = rej;
  });
  setInFlight(CACHE_KEY, inFlightPromise);

  try {
    const { ids, externalRequestCount } = await fetchRecommendIds();
    const now = new Date().toISOString();

    const result = {
      ids,
      count:                ids.length,
      externalRequestCount,
      cachedAt:             now,
      cacheTtlHours:        TTL_MS / 3_600_000,
      nextRefreshAvailableAt: new Date(Date.now() + TTL_MS).toISOString(),
      cached:               false,
    };

    setCache(CACHE_KEY, result, TTL_MS);
    resolveInFlight(result);

    console.log(`[추천ID] 완료: ${ids.length}개`);

    return NextResponse.json(result);

  } catch (err) {
    rejectInFlight(err);
    console.error("[추천ID] 수집 실패:", err.message);
    return NextResponse.json(
      { error: "추천 ID를 가져오는 중 오류가 발생했습니다.", detail: err.message },
      { status: 500 }
    );
  } finally {
    clearInFlight(CACHE_KEY);
  }
}
