// ============================================================
// 티처빌 전체 연수 목록 수집 모듈
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 수집 API:
//   POST /trainapply/jobtrainapply/getCreditCourseJsonNewList.edu
//   - allCourseList.edu 페이지의 XHR 목록 API
//   - paginationVO.pageIndex / paginationVO.recordCountPerPage 로 페이지 제어
//   - 응답: { resultList: [...], paginationVO: { recordTotalCount, pageLastIndex, ... } }
//
// 수집 흐름:
//   1. 1페이지 요청 → recordTotalCount, pageLastIndex 추출
//   2. pageLastIndex 기준으로 2~N 페이지 순차 요청 (REQUEST_DELAY_MS 간격)
//   3. MAX_PAGES / MAX_COURSE_COUNT 안전 상한 적용
//   4. 상세 API 반복 호출 없음 — 목록 카드 데이터만 수집
//   5. 병렬 요청 없음 (Promise.all 금지)
// ============================================================

import {
  REQUEST_DELAY_MS,
  MAX_EXTERNAL_REQUESTS,
  sleep,
} from "@/lib/cache";

const BASE_URL =
  process.env.TEACHERVILLE_BASE_URL ?? "https://www.teacherville.co.kr";

// ── 운영 상수 (환경변수 우선) ─────────────────────────────
const PAGE_SIZE = parseInt(process.env.PAGE_SIZE ?? "100", 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGES ?? "10", 10);
const MAX_COURSE_COUNT = parseInt(process.env.MAX_COURSE_COUNT ?? "1000", 10);

const LIST_URL =
  `${BASE_URL}/trainapply/jobtrainapply/getCreditCourseJsonNewList.edu`;

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: `${BASE_URL}/trainapply/allCourseList.edu`,
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
};

// ── 공통 POST body 빌더 ──────────────────────────────────
function buildBody(pageIndex) {
  return new URLSearchParams({
    "paginationVO.pageIndex":        String(pageIndex),
    "paginationVO.recordCountPerPage": String(PAGE_SIZE),
    operationCourseGetSeq:           "",
    trainingTypeCode:                "C01",
    gradePointOffline:               "",
    exposureCode99:                  "C04",
    school:                          "on",
    theme:                           "on",
    trainingGradePointCode:          "",
    trainingSchoolLevelCode:         "ALL",
    trainingRealmCode:               "",
  }).toString();
}

// ── 단일 페이지 요청 ──────────────────────────────────────
async function fetchPage(pageIndex) {
  const res = await fetch(LIST_URL, {
    method: "POST",
    headers: COMMON_HEADERS,
    body: buildBody(pageIndex),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`getCreditCourseJsonNewList 실패 (page ${pageIndex}): HTTP ${res.status}`);
  }

  const json = await res.json();
  const payload = Array.isArray(json) ? json[0] : json;

  if (!payload || !Array.isArray(payload.resultList)) {
    throw new Error(`getCreditCourseJsonNewList 응답 형식 오류 (page ${pageIndex})`);
  }

  return {
    courses:       payload.resultList,
    pagination:    payload.paginationVO ?? {},
    // totalCount는 반드시 API 응답에서 추출 — 하드코딩 금지
    totalCount:    payload.paginationVO?.recordTotalCount ?? 0,
    pageLastIndex: payload.paginationVO?.pageLastIndex    ?? 1,
  };
}

// ── 정규화 ──────────────────────────────────────────────
function buildThumbnailUrl(wideUrl, wideName) {
  if (!wideUrl || !wideName) return "";
  const base = wideUrl.endsWith("/") ? wideUrl.slice(0, -1) : wideUrl;
  return `${BASE_URL}${base}/${wideName}`;
}

function parseBadges(bullets, bulletList) {
  const text  = bullets
    ? bullets.split(",").map((b) => b.trim()).filter(Boolean)
    : [];
  const image = Array.isArray(bulletList)
    ? bulletList.map((b) => b.itemName ?? b.altText ?? "").filter(Boolean)
    : [];
  // 패키지 여부는 bulletList에 없으므로 packageTrainingUseYn로 보완
  return [...new Set([...image, ...text])];
}

function normalizeItem(raw) {
  const thumbnail = buildThumbnailUrl(
    raw.wideThumnailImageUrl,
    raw.wideThumnailImageName
  );

  // 유형: packageTrainingUseYn이 Y면 패키지, 아니면 일반연수
  const trainingType =
    raw.packageTrainingUseYn === "Y" ? "패키지" : "일반연수";

  const detailUrl = raw.operationCourseGetSeq
    ? `/trainapply/newCourseDetail.edu?division=T&courseSeq=${raw.operationCourseGetSeq}&t=${raw.masterCourseGetSeq ?? ""}`
    : "";

  return {
    provider:       "teacherville",
    id:             raw.operationCourseGetSeq ?? "",
    masterCourseId: raw.masterCourseGetSeq    ?? "",
    title:          raw.courseName            ?? "",
    price:          raw.sellPrice             ?? 0,
    discountPrice:  raw.discountPrice         ?? 0,
    credit:         raw.trainingGradePointName ?? "",
    category:       raw.trainingRealmName      ?? "",
    trainingType,
    thumbnail,
    detailUrl,
    reviewCount:    raw.reviewCount ?? 0,
    wishCount:      raw.wishCount   ?? 0,
    tutorName:      raw.tutorName   ?? "",
    badges:         parseBadges(raw.bullets, raw.bulletList),
    schedule:       raw.scheduleDateTime ?? "",
    // 정렬용 원본 등록일 (최신순 정렬에 사용)
    registrationDateTime: raw.registrationDateTime ?? "",
  };
}

/**
 * 원본 배열을 정규화하고 ID 기준으로 중복 제거합니다.
 * 페이지 단위 수집 시 동일 강의가 중복될 수 있으므로
 * 수집 완료 후 반드시 이 함수를 거쳐야 합니다.
 *
 * - 정규화 후 id가 없는 항목 제거
 * - Map으로 id 기준 중복 제거 (나중 페이지 값으로 덮어쓰지 않음 — 첫 출현 유지)
 * - fetchedCount는 중복 제거 후 기준
 */
export function normalizeAllCourses(rawList) {
  if (!Array.isArray(rawList)) return [];

  const normalized = rawList.map(normalizeItem).filter((c) => c.id);

  // ID 기준 중복 제거
  const uniqueMap = new Map();
  normalized.forEach((course) => {
    if (!uniqueMap.has(course.id)) {
      uniqueMap.set(course.id, course);
    }
  });

  const dedupedCourses = Array.from(uniqueMap.values());

  if (dedupedCourses.length < normalized.length) {
    console.log(
      `[중복제거] ${normalized.length}개 → ${dedupedCourses.length}개 ` +
      `(${normalized.length - dedupedCourses.length}개 중복 제거)`
    );
  }

  return dedupedCourses;
}

// ============================================================
// 메인 수집 함수
//
// 반환값:
//   allRaw              - 원본 배열 합계
//   totalCount          - API 응답 기준 총 강의 수 (동적, 하드코딩 금지)
//   pageCount           - 실제 수집한 페이지 수
//   externalRequestCount - 실행된 외부 요청 횟수
// ============================================================
export async function fetchAllCourses() {
  let requestCount = 0;
  const allRaw = [];

  // ── 1페이지 수집 + totalCount / pageLastIndex 추출 ──────
  requestCount++;
  const firstPage = await fetchPage(1);
  allRaw.push(...firstPage.courses);

  const { totalCount, pageLastIndex } = firstPage;

  // 실제 수집할 페이지 수 계산 (안전 상한 적용)
  const targetPages = Math.min(
    pageLastIndex,      // API가 알려주는 총 페이지 수
    MAX_PAGES,          // 최대 페이지 수 제한
    Math.ceil(MAX_COURSE_COUNT / PAGE_SIZE) // 최대 강의 수 기준 페이지 수
  );

  console.log(
    `[전체연수] totalCount=${totalCount}, pageLastIndex=${pageLastIndex}, ` +
    `targetPages=${targetPages}, PAGE_SIZE=${PAGE_SIZE}`
  );

  // ── 2페이지 이후 순차 요청 (병렬 금지) ──────────────────
  for (let page = 2; page <= targetPages; page++) {
    // MAX_EXTERNAL_REQUESTS 초과 방지
    if (requestCount >= MAX_EXTERNAL_REQUESTS) {
      console.warn(
        `[전체연수] MAX_EXTERNAL_REQUESTS(${MAX_EXTERNAL_REQUESTS}) 도달 — ` +
        `page ${page}부터 중단`
      );
      break;
    }

    // 요청 간 지연 (대상 서버 부담 최소화)
    await sleep(REQUEST_DELAY_MS);

    requestCount++;
    const pageData = await fetchPage(page);
    allRaw.push(...pageData.courses);

    console.log(
      `[전체연수] page ${page}/${targetPages} 수집 완료 ` +
      `(+${pageData.courses.length}개, 누계 ${allRaw.length}개)`
    );

    // MAX_COURSE_COUNT 초과 방지
    if (allRaw.length >= MAX_COURSE_COUNT) {
      console.warn(`[전체연수] MAX_COURSE_COUNT(${MAX_COURSE_COUNT}) 도달 — 수집 중단`);
      break;
    }
  }

  return {
    allRaw,
    totalCount,          // API 응답 기준 (하드코딩 아님)
    pageCount:   Math.min(requestCount, targetPages),
    externalRequestCount: requestCount,
  };
}
