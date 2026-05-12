// ============================================================
// GET /api/course/[goodsCode]
// 단건 강의 상세 조회 API
//
// 설계 원칙:
//   - goodsCode별 서버 공유 캐시 (1시간 TTL)
//   - In-Flight Lock: 같은 강의를 동시에 여러 사용자가 클릭해도
//     외부 요청은 1회만 실행, 나머지는 결과 대기
//   - 사용자 클릭 시에만 실행 — 목록 전체 자동 조회 없음
//   - 자동 재시도 없음
// ============================================================

import { NextResponse } from "next/server";
import {
  getCache,
  setCache,
  getInFlight,
  setInFlight,
  clearInFlight,
  DETAIL_CACHE_TTL_MS,
} from "@/lib/cache";
import { fetchCourseDetail } from "@/lib/teacherville-course-detail";

// ============================================================
// In-Flight 키 헬퍼
// ============================================================
const detailKey    = (id) => `course:${id}`;
const inFlightKey  = (id) => `inflight:course:${id}`;

export async function GET(request, { params }) {
  const { goodsCode } = await params;

  if (!goodsCode?.trim()) {
    return NextResponse.json(
      { error: "goodsCode가 필요합니다." },
      { status: 400 }
    );
  }

  const cacheKey    = detailKey(goodsCode);
  const ifKey       = inFlightKey(goodsCode);

  // ── 1. 캐시 히트 ─────────────────────────────────────────
  const cached = getCache(cacheKey);
  if (cached) {
    console.log(`[상세] 캐시 HIT: ${goodsCode}`);
    return NextResponse.json({
      ...cached.data,
      cached:       true,
      cachedAt:     cached.cachedAt,
      inFlightUsed: false,
    });
  }

  // ── 2. In-Flight 대기 ─────────────────────────────────────
  const existing = getInFlight(ifKey);
  if (existing) {
    console.log(`[상세] In-Flight 대기: ${goodsCode}`);
    try {
      const result = await existing;
      return NextResponse.json({ ...result, inFlightUsed: true });
    } catch (err) {
      return NextResponse.json(
        { error: "상세 조회 실패 (in-flight)", detail: err.message },
        { status: 500 }
      );
    }
  }

  // ── 3. 새 외부 요청 ───────────────────────────────────────
  console.log(`[상세] 외부 요청: ${goodsCode}`);

  let resolveInFlight, rejectInFlight;
  const inFlightPromise = new Promise((res, rej) => {
    resolveInFlight = res;
    rejectInFlight  = rej;
  });
  setInFlight(ifKey, inFlightPromise);

  try {
    const data = await fetchCourseDetail(goodsCode);
    const now  = new Date().toISOString();

    const result = { ...data, cached: false, cachedAt: now, inFlightUsed: false };

    // 캐시 저장 (1시간)
    setCache(cacheKey, data, DETAIL_CACHE_TTL_MS);

    resolveInFlight(result);

    console.log(
      `[상세] 완료: ${goodsCode} / 차시 ${data.lessons.length}개`
    );
    return NextResponse.json(result);

  } catch (err) {
    rejectInFlight(err);
    console.error(`[상세] 실패 (${goodsCode}):`, err.message);
    return NextResponse.json(
      { error: "강의 정보를 가져오는 중 오류가 발생했습니다.", detail: err.message },
      { status: 500 }
    );
  } finally {
    clearInFlight(ifKey);
  }
}
