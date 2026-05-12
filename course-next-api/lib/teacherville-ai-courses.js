// ============================================================
// 티처빌 AI 연수 목록 조회 모듈
// 로컬 내부 테스트 전용 — 비로그인 공개 XHR만 사용
//
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 동작 플로우 (aiCourseList.js 소스 분석 결과):
//   req 1: getNewNonLoginAIRecommand.edu → operationCourseGetSeq 목록
//   (500ms 대기)
//   req 2: getAIRecommandCourseList.edu  → 강의 카드 데이터
//
// 외부 요청은 순차 실행, 동시 병렬 불가.
// 강의별 상세 API 반복 호출 없음.
// ============================================================

import {
  REQUEST_DELAY_MS,
  MAX_EXTERNAL_REQUESTS,
  MAX_COURSE_COUNT,
  sleep,
} from "@/lib/cache";

const BASE_URL =
  process.env.TEACHERVILLE_BASE_URL ?? "https://www.teacherville.co.kr";

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: `${BASE_URL}/trainapply/aiCourseList.edu`,
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
};

// ============================================================
// 외부 요청 카운터 — 한 번의 수집 흐름 안에서 관리
// ============================================================
function makeCounter() {
  let count = 0;
  return {
    increment() {
      if (count >= MAX_EXTERNAL_REQUESTS) {
        throw new Error(
          `MAX_EXTERNAL_REQUESTS(${MAX_EXTERNAL_REQUESTS}) 초과 — 요청 중단`
        );
      }
      count++;
    },
    value() { return count; },
  };
}

// ============================================================
// 외부 요청 1: 비로그인 AI 추천 강의 ID 목록
// URL: /aiLearningAnalytics/getNewNonLoginAIRecommand.edu
// 파라미터: count (최대 100개 확인됨)
// ============================================================
async function fetchAiCourseIds(counter) {
  counter.increment();

  const count = Math.min(MAX_COURSE_COUNT, 100); // 서버 최대 100개 확인
  const url =
    `${BASE_URL}/aiLearningAnalytics/getNewNonLoginAIRecommand.edu` +
    `?_REQ_DATA_TYPE_=json&_USE_WRAPPED_OBJECT_=true`;

  const res = await fetch(url, {
    method: "POST",
    headers: COMMON_HEADERS,
    body: new URLSearchParams({ count: String(count) }).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`getNewNonLoginAIRecommand 실패: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error("getNewNonLoginAIRecommand 응답 형식 오류");
  }

  return json.map((item) => item.operationCourseGetSeq).filter(Boolean);
}

// ============================================================
// 외부 요청 2: ID 목록으로 강의 카드 데이터 조회
// URL: /getAIRecommandCourseList.edu
// 파라미터: operationCourseGetSeqs (JSON 배열), rowCount
// ============================================================
async function fetchAiCourseCards(ids, counter) {
  if (!ids.length) return [];
  counter.increment();

  const res = await fetch(`${BASE_URL}/getAIRecommandCourseList.edu`, {
    method: "POST",
    headers: COMMON_HEADERS,
    body: new URLSearchParams({
      operationCourseGetSeqs: JSON.stringify(ids),
      rowCount: String(ids.length),
    }).toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`getAIRecommandCourseList 실패: HTTP ${res.status}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json") && !ct.includes("text/plain")) {
    throw new Error(`getAIRecommandCourseList 비JSON 응답 (${ct})`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error("getAIRecommandCourseList 응답 형식 오류");
  }

  return json;
}

// ============================================================
// 정규화
// ============================================================

// trainingDivisionCode → 사람이 읽기 좋은 이름
// 목록 API는 상세 API의 categorySmallName(일반연수/패키지)을 제공하지 않음.
// 대분류인 trainingDivisionCode가 목록에서 얻을 수 있는 가장 신뢰할 수 있는 값.
// 정확한 유형(일반연수/패키지)은 카드 클릭 후 상세 패널에서 표시됨.
const DIVISION_NAME = {
  T01: "직무연수",
  T02: "자율연수",
  T03: "특수분야연수",
};

function buildThumbnailUrl(thumnailUrl, thumnailName) {
  if (!thumnailUrl || !thumnailName) return "";
  const base = thumnailUrl.endsWith("/")
    ? thumnailUrl.slice(0, -1)
    : thumnailUrl;
  return `${BASE_URL}${base}/${thumnailName}`;
}

function parseBadges(bullets, bulletList) {
  const text = bullets
    ? bullets.split(",").map((b) => b.trim()).filter(Boolean)
    : [];
  const image = Array.isArray(bulletList)
    ? bulletList.map((b) => b.itemName ?? b.altText ?? "").filter(Boolean)
    : [];
  return [...new Set([...image, ...text])];
}

function normalizeItem(raw) {
  const divisionCode = raw.trainingDivisionCode ?? "";
  const trainingType =
    DIVISION_NAME[divisionCode] ||
    raw.trainingDivisionName ||
    divisionCode ||
    "";

  return {
    id:                raw.operationCourseGetSeq ?? "",
    masterCourseId:    raw.masterCourseGetSeq ?? "",
    title:             raw.courseName ?? "",
    price:             raw.sellPrice ?? 0,
    discountPrice:     raw.discountPrice ?? 0,
    credit:            raw.trainingGradePointName ?? "",
    category:          raw.trainingRealmName ?? "",
    trainingType,
    onlineTrainingTime: raw.onlineTrainingTime ?? "",
    thumbnail:         buildThumbnailUrl(raw.thumnailUrl, raw.thumnailName),
    badges:            parseBadges(raw.bullets, raw.bulletList),
    wishCount:         raw.wishCount ?? 0,
    reviewCount:       raw.reviewCount ?? 0,
    tutorName:         raw.tutorName ?? "",
    schedule:          raw.scheduleDateTime ?? "",
  };
}

export function normalizeAiCourses(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizeItem).filter((c) => c.id);
}

// ============================================================
// 메인 함수: AI 연수 전체 목록 조회
//
// 반환값:
//   rawList             - 원본 카드 데이터 배열
//   ids                 - 수집된 강의 ID 배열
//   externalRequestCount - 실제 실행된 외부 요청 횟수
// ============================================================
export async function fetchAiCourseList() {
  const counter = makeCounter();

  // 외부 요청 1: ID 목록 (순차 실행)
  const ids = await fetchAiCourseIds(counter);
  console.log(`[AI 연수] ID ${ids.length}개 수신`);

  if (!ids.length) {
    return { rawList: [], ids: [], externalRequestCount: counter.value() };
  }

  // 요청 사이 대기 (외부 사이트 부담 최소화)
  await sleep(REQUEST_DELAY_MS);

  // 외부 요청 2: 카드 데이터 (순차 실행)
  const rawList = await fetchAiCourseCards(ids, counter);
  console.log(`[AI 연수] 카드 데이터 ${rawList.length}개 수신`);

  return {
    rawList,
    ids,
    externalRequestCount: counter.value(),
  };
}
