// ============================================================
// 비로그인 AI 추천 강의 ID 수집 (1회 외부 요청)
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 목적:
//   전체 목록과 결합하여 랭킹 점수(score)를 계산하기 위한 추천 ID Set 제공.
//   카드 상세 데이터는 수집하지 않음 — 외부 요청 최소화.
//
// 수집 API:
//   POST /aiLearningAnalytics/getNewNonLoginAIRecommand.edu
//   - 파라미터: count (최대 100)
//   - 응답: [{ operationCourseGetSeq, ... }, ...]
// ============================================================

const BASE_URL =
  process.env.TEACHERVILLE_BASE_URL ?? "https://www.teacherville.co.kr";

const RECOMMEND_COUNT = Math.min(
  parseInt(process.env.RECOMMEND_COUNT ?? "100", 10),
  100
);

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: `${BASE_URL}/trainapply/aiCourseList.edu`,
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
};

/**
 * 비로그인 AI 추천 강의 ID 목록을 가져옵니다.
 * 외부 요청 1회만 실행 — 카드 상세 API 호출 없음.
 *
 * @returns {{ ids: string[], externalRequestCount: number }}
 */
export async function fetchRecommendIds() {
  const url =
    `${BASE_URL}/aiLearningAnalytics/getNewNonLoginAIRecommand.edu` +
    `?_REQ_DATA_TYPE_=json&_USE_WRAPPED_OBJECT_=true`;

  const res = await fetch(url, {
    method: "POST",
    headers: HEADERS,
    body: new URLSearchParams({ count: String(RECOMMEND_COUNT) }).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`getNewNonLoginAIRecommand 실패: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error("getNewNonLoginAIRecommand 응답 형식 오류");
  }

  const ids = json
    .map((item) => String(item.operationCourseGetSeq ?? ""))
    .filter(Boolean);

  return { ids, externalRequestCount: 1 };
}
