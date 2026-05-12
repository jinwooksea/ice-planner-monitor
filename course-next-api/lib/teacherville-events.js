// ============================================================
// 티처빌 이벤트 목록 수집 모듈
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 수집 방식:
//   - POST /cs/eventpromotion/getEventJsonList.edu
//   - 응답: [0].resultList 배열 / [0].paginationJSON 페이징 정보
//   - pageLastIndex 기반 전체 페이지 순차 수집
//
// 제약:
//   - 요청 간 REQUEST_DELAY_MS 간격
//   - 병렬 요청 금지
//   - 상세 페이지 수집 금지
// ============================================================

import axios from "axios";
import { REQUEST_DELAY_MS, MAX_EXTERNAL_REQUESTS, sleep } from "@/lib/cache";

const BASE_URL   = "https://www.teacherville.co.kr";
const LIST_URL   = `${BASE_URL}/cs/eventpromotion/getEventJsonList.edu`;
const DETAIL_BASE = "/cs/eventpromotion/eventDetail.edu";

const RECORDS_PER_PAGE = 9;

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Referer: `${BASE_URL}/cs/eventpromotion/eventList.edu`,
};

// ── 파라미터 빌더 ─────────────────────────────────────────

function buildBody(pageIndex) {
  return new URLSearchParams({
    "paginationVO.pageIndex":          String(pageIndex),
    "paginationVO.recordCountPerPage": String(RECORDS_PER_PAGE),
    orderByCode:           "S01",
    tabTypeCode:           "",
    loungeFlag:            "N",
    platformDivisionCode:  "PF01",
  }).toString();
}

// ── 정규화 헬퍼 ──────────────────────────────────────────

// YYYY.MM.DD / YYYY/MM/DD / YYYY-MM-DD → YYYY-MM-DD, 빈값이면 ""
function normalizeDate(raw) {
  return (raw ?? "").trim().replace(/[./]/g, "-");
}

// endDate 기준 dday: 없으면 null, 음수 허용
function calcDday(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

// endDate 기준 status: 없으면 fallback
function calcStatus(endDate, fallback = "") {
  if (!endDate) return fallback;
  const end = new Date(endDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now <= end ? "진행중" : "종료";
}

// ── 정규화 ───────────────────────────────────────────────

function normalizeItem(raw) {
  const thumbnail = raw.bannerImageUrl
    ? raw.bannerImageUrl.startsWith("http")
      ? raw.bannerImageUrl
      : `${BASE_URL}${raw.bannerImageUrl}`
    : "";

  const detailUrl = raw.linkUrl && raw.linkUrl !== "#none"
    ? raw.linkUrl.startsWith("http")
      ? raw.linkUrl
      : `${BASE_URL}${raw.linkUrl}`
    : `${BASE_URL}${DETAIL_BASE}?eventSeq=${raw.eventSeq}`;

  const startDate = normalizeDate(raw.eventStartDate);
  const endDate   = normalizeDate(raw.eventEndDate);
  const status    = calcStatus(endDate);
  const dday      = calcDday(endDate);

  return {
    provider: "teacherville",
    id:       `ev${raw.eventSeq}`,
    title:    raw.eventName ?? "",
    thumbnail,
    detailUrl,
    startDate,
    endDate,
    status,
    dday,
  };
}

export function normalizeTeachervilleEvents(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizeItem).filter((e) => e.id && e.title);
}

// ── 단일 페이지 수집 ─────────────────────────────────────

async function fetchPage(pageIndex) {
  const response = await axios.post(LIST_URL, buildBody(pageIndex), {
    headers: COMMON_HEADERS,
    timeout: 10000,
  });

  console.log("[teacherville-events] fetch success page", pageIndex);

  const json = response.data;
  const root = Array.isArray(json) ? json[0] : json;

  const resultList   = root?.resultList    ?? [];
  const paginationJSON = root?.paginationJSON ?? "{}";
  const paging       = typeof paginationJSON === "string"
    ? JSON.parse(paginationJSON)
    : paginationJSON;

  return {
    items:         resultList,
    pageLastIndex: paging.pageLastIndex ?? 1,
    totalCount:    paging.recordTotalCount ?? 0,
  };
}

// ============================================================
// 메인 수집 함수
// ============================================================
export async function fetchTeachervilleEvents() {
  console.log("[events] fetch start");
  let requestCount = 0;
  const allRaw     = [];
  let pageLastIndex = 1;

  for (let pageIndex = 1; pageIndex <= pageLastIndex; pageIndex++) {
    if (requestCount >= MAX_EXTERNAL_REQUESTS) {
      console.warn(
        `[events] MAX_EXTERNAL_REQUESTS(${MAX_EXTERNAL_REQUESTS}) 도달 — ` +
        `pageIndex ${pageIndex}부터 중단`
      );
      break;
    }

    if (pageIndex > 1) await sleep(REQUEST_DELAY_MS);
    requestCount++;

    const { items, pageLastIndex: last, totalCount } = await fetchPage(pageIndex);
    allRaw.push(...items);

    // 첫 페이지 응답에서 전체 페이지 수 확정
    if (pageIndex === 1) {
      pageLastIndex = last;
      console.log(`[events] totalCount=${totalCount}, pageLastIndex=${pageLastIndex}`);
    }

    console.log(
      `[events] pageIndex=${pageIndex} 수집 ${items.length}개 (누계 ${allRaw.length}개)`
    );

    if (items.length === 0) break;
  }

  return {
    allRaw,
    externalRequestCount: requestCount,
  };
}
