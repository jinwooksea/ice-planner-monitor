// ============================================================
// 한국교원연수원(hstudy) 연수 목록 수집 모듈
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 수집 방식:
//   - JSON API 없음 — HTML 서버 렌더링 방식
//   - cheerio로 DOM 파싱
//   - 1단계: GET /newmain/sub2.asp?inx=1&jnx=0 → 첫 30개 + strTmp 추출
//   - 2단계: POST /newmain/sub2_ajax.asp {strTmp, loopCnt=1,2,3,...} → 추가 배치
//   - loopCnt당 30개, 0개가 되면 종료
//
// 실측 데이터 (2026-04-30):
//   초기 HTML 30개, loopCnt 1~3 각 30개, loopCnt 4에서 5개, loopCnt 5부터 0개
//   → 총 약 125개 강의
//
// 제약:
//   - 요청 간 REQUEST_DELAY_MS 간격
//   - 병렬 요청 금지
//   - 상세 페이지 수집 금지
// ============================================================

import { load } from "cheerio";
import { REQUEST_DELAY_MS, MAX_EXTERNAL_REQUESTS, sleep } from "@/lib/cache";

const BASE_URL = "https://www.hstudy.co.kr";
const LIST_URL = `${BASE_URL}/newmain/sub2.asp`;
const AJAX_URL = `${BASE_URL}/newmain/sub2_ajax.asp`;

// 초기 페이지 파라미터 (직무연수 전체)
const INITIAL_PARAMS = "inx=1&jnx=0";

// 한 배치에서 이 개수 미만이면 마지막 페이지
const FULL_BATCH_SIZE = 30;

// 최대 AJAX 호출 수 (loopCnt 상한)
const MAX_AJAX_LOOPS = parseInt(process.env.HSTUDY_MAX_AJAX_LOOPS ?? "10", 10);

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

// ── HTML 파싱 ─────────────────────────────────────────────

/**
 * #tb_style_5 tbody의 각 tr에서 강의 데이터를 추출합니다.
 * @param {string} html
 * @returns {Array<object>} raw course objects
 */
function parseCoursesFromHtml(html) {
  const $ = load(html);
  const rows = [];

  // 초기 페이지와 AJAX 응답 모두 #tb_style_5 tbody tr 구조
  $("#tb_style_5 tbody tr, .tb_style_5 tbody tr").each((_, tr) => {
    const $tr = $(tr);

    // ── gcode (강의 ID) ─────────────────────────────────
    const photoOnclick = $tr.find(".photo_area .photo").attr("onclick") ?? "";
    const gcodeMatch   = photoOnclick.match(/detail_view\('([^']+)'\)/);
    const gcode        = gcodeMatch?.[1] ?? "";
    if (!gcode) return; // 유효하지 않은 행 스킵

    // ── 썸네일 (background:url 추출) ────────────────────
    const photoStyle  = $tr.find(".photo_area .photo").attr("style") ?? "";
    const thumbMatch  = photoStyle.match(/background:url\('?([^'")]+)'?\)/);
    const thumbPath   = thumbMatch?.[1] ?? "";
    // 상대경로 → 절대경로
    const thumbnail   = thumbPath.startsWith("http")
      ? thumbPath
      : thumbPath
        ? `${BASE_URL}${thumbPath.startsWith("/") ? "" : "/"}${thumbPath}`
        : "";

    // ── 학점 / 제목 ─────────────────────────────────────
    const creditRaw = $tr.find(".photo_right .title .f-blue").text().trim();
    // "[직무 2학점]" → "직무 2학점"
    const credit    = creditRaw.replace(/^\[|\]$/g, "").trim();

    // 제목: onclick이 있는 bold span (f-blue 다음 span)
    const titleEl = $tr.find(".photo_right .title span[onclick]");
    const title   = titleEl.text().trim();

    // ── 카테고리 아이콘 배지 ────────────────────────────
    const badges = [];
    $tr.find(".photo_right .category img").each((_, img) => {
      const alt  = $(img).attr("alt") ?? "";
      const src  = $(img).attr("src") ?? "";
      // alt가 없으면 파일명에서 추출 (icon_new.gif → 신규, icon_smart.gif → 스마트)
      if (alt) {
        badges.push(alt);
      } else if (src.includes("icon_new")) {
        badges.push("신규");
      }
    });

    // ── 가격 ────────────────────────────────────────────
    const priceRaw = $tr.find("td.right .price").text().trim();
    // "\ 80,000 " → 80000
    const priceNum = parseInt(priceRaw.replace(/[^0-9]/g, ""), 10) || 0;

    rows.push({ gcode, thumbnail, credit, title, badges, price: priceNum });
  });

  return rows;
}

// ── strTmp 추출 ───────────────────────────────────────────

/**
 * 초기 페이지 HTML에서 AJAX 요청에 사용되는 strTmp 파라미터를 추출합니다.
 * strTmp는 서버가 쿼리 조건을 인코딩한 문자열이며, 페이지마다 고정됩니다.
 */
function extractStrTmp(html) {
  const match = html.match(/var\s+tmp\s*=\s*"([^"]+)"/);
  return match?.[1] ?? "";
}

// ── 정규화 ───────────────────────────────────────────────

function normalizeItem(raw) {
  const detailUrl = raw.gcode
    ? `${BASE_URL}/newmain/subject_view.asp?${INITIAL_PARAMS}&gcode=${raw.gcode}`
    : "";

  return {
    provider:     "hstudy",
    id:           raw.gcode,
    title:        raw.title,
    credit:       raw.credit,
    price:        raw.price,
    discountPrice: 0,
    thumbnail:    raw.thumbnail,
    detailUrl,
    badges:       raw.badges,
    category:     "",       // 목록 HTML에 카테고리 텍스트 없음
    trainingType: "",       // 상세 미수집
    reviewCount:  0,
    wishCount:    0,
    tutorName:    "",
    schedule:     "",
    registrationDateTime: "",
    sortDate:       "",
    masterCourseId: "",
  };
}

/**
 * 원본 배열 정규화 + ID 기준 중복 제거
 */
export function normalizeHstudyCourses(rawList) {
  if (!Array.isArray(rawList)) return [];

  const normalized = rawList.map(normalizeItem).filter((c) => c.id && c.title);

  const uniqueMap = new Map();
  normalized.forEach((c) => {
    if (!uniqueMap.has(c.id)) uniqueMap.set(c.id, c);
  });

  const deduped = Array.from(uniqueMap.values());
  if (deduped.length < normalized.length) {
    console.log(
      `[hstudy 중복제거] ${normalized.length}개 → ${deduped.length}개`
    );
  }

  return deduped;
}

// ── 수집 함수 ─────────────────────────────────────────────

/**
 * 1단계: 초기 페이지 GET → 첫 30개 파싱 + strTmp 추출
 */
async function fetchInitialPage() {
  const url = `${LIST_URL}?${INITIAL_PARAMS}`;
  const res = await fetch(url, {
    method:  "GET",
    headers: { ...COMMON_HEADERS, Referer: BASE_URL },
    cache:   "no-store",
  });

  if (!res.ok) {
    throw new Error(`hstudy 초기 페이지 실패: HTTP ${res.status}`);
  }

  const html  = await res.text();
  const items = parseCoursesFromHtml(html);
  const strTmp = extractStrTmp(html);

  if (!strTmp) {
    throw new Error("hstudy strTmp 추출 실패 — 사이트 구조가 변경되었을 수 있습니다.");
  }

  console.log(`[hstudy] 초기 페이지 ${items.length}개 파싱, strTmp 추출 완료`);
  return { items, strTmp };
}

/**
 * 2단계: AJAX 배치 POST → HTML 파싱
 * @returns {{ items: Array, hasMore: boolean }}
 */
async function fetchAjaxBatch(strTmp, loopCnt) {
  const body = new URLSearchParams({
    strTmp,
    loopCnt: String(loopCnt),
  }).toString();

  const res = await fetch(AJAX_URL, {
    method:  "POST",
    headers: {
      ...COMMON_HEADERS,
      "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer:            `${BASE_URL}/newmain/sub2.asp`,
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`hstudy AJAX 실패 (loopCnt=${loopCnt}): HTTP ${res.status}`);
  }

  const html  = await res.text();
  const items = parseCoursesFromHtml(html);

  return {
    items,
    hasMore: items.length >= FULL_BATCH_SIZE,
  };
}

// ============================================================
// 메인 수집 함수
//
// 반환값:
//   allRaw              - 수집된 원본 배열
//   pageCount           - 실제 수집한 배치 수 (초기 1 + AJAX n)
//   externalRequestCount - 실행된 외부 요청 횟수
// ============================================================
export async function fetchHstudyCourses() {
  let requestCount = 0;
  const allRaw     = [];

  // ── 초기 페이지 ───────────────────────────────────────
  requestCount++;
  const { items: initialItems, strTmp } = await fetchInitialPage();
  allRaw.push(...initialItems);

  // ── AJAX 배치 순차 수집 ───────────────────────────────
  for (let loopCnt = 1; loopCnt <= MAX_AJAX_LOOPS; loopCnt++) {
    if (requestCount >= MAX_EXTERNAL_REQUESTS) {
      console.warn(
        `[hstudy] MAX_EXTERNAL_REQUESTS(${MAX_EXTERNAL_REQUESTS}) 도달 — ` +
        `loopCnt ${loopCnt}부터 중단`
      );
      break;
    }

    await sleep(REQUEST_DELAY_MS);
    requestCount++;

    const { items, hasMore } = await fetchAjaxBatch(strTmp, loopCnt);
    allRaw.push(...items);

    console.log(
      `[hstudy] loopCnt=${loopCnt} 수집 ${items.length}개 ` +
      `(누계 ${allRaw.length}개, hasMore=${hasMore})`
    );

    if (!hasMore) break;
  }

  return {
    allRaw,
    pageCount:            requestCount,
    externalRequestCount: requestCount,
  };
}
