// ============================================================
// 중앙교육연수원(neti) 연수 목록 수집 모듈
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 수집 방식:
//   - 정적 HTML 서버 렌더링 — cheerio 파싱
//   - GET /lh/ms/ac/atnlcAplyListView.do?pageIndex={n}
//   - pageIndex 1부터 시작, 최대 MAX_NETI_PAGES 페이지
//
// 제약:
//   - 요청 간 REQUEST_DELAY_MS 간격
//   - 병렬 요청 금지
//   - 상세 페이지 수집 금지
// ============================================================

import { load } from "cheerio";
import { REQUEST_DELAY_MS, MAX_EXTERNAL_REQUESTS, sleep } from "@/lib/cache";

const BASE_URL = "https://www.neti.go.kr";
const LIST_PATH = "/lh/ms/ac/atnlcAplyListView.do";

const MAX_NETI_PAGES = parseInt(process.env.NETI_MAX_PAGES ?? "5", 10);

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Referer:
    "https://www.neti.go.kr/lh/ms/ac/atnlcAplyListView.do?menuId=1000006045",
};

// ── HTML 파싱 ─────────────────────────────────────────────

function textWithoutTags($el) {
  $el.find("i").remove();
  return $el.text().trim();
}

function parseCoursesFromHtml(html) {
  const $ = load(html);
  const items = [];

  $("li.sub_list_card_wrap_2").each((_, li) => {
    const $li = $(li);

    const id = $li.find(".btn_heart_icon").attr("data-crsegnrtnid")?.trim() ?? "";
    if (!id) return;

    const title = $li.find("a.title").attr("title")?.trim() ?? "";
    if (!title) return;

    const thumbSrc = $li.find(".thumbnail img").attr("src") ?? "";
    const thumbnail = thumbSrc.startsWith("http")
      ? thumbSrc
      : thumbSrc
      ? `${BASE_URL}${thumbSrc.startsWith("/") ? "" : "/"}${thumbSrc}`
      : "";

    const detailUrl = `${BASE_URL}/lh/ms/ac/atnlcAplyDetailView.do?crseGnrtnId=${id}`;

    const courseType   = $li.find(".card_title .top .blue").text().trim();
    const organization = $li.find(".card_title .top .fc_999").text().trim();
    const applyPeriod  = textWithoutTags($li.find(".info.icon_check").clone());
    const educationPeriod = textWithoutTags($li.find(".info.icon_time").clone());
    const creditText   = $li.find(".info.icon_list").text().trim();
    const target       = textWithoutTags($li.find(".info.icon_edu").clone());
    const rating       = $li.find(".star_score u").text().trim();
    const applyCountRaw = $li.find(".info2 b").text().trim();

    items.push({
      id, title, thumbnail, detailUrl,
      courseType, organization, applyPeriod, educationPeriod,
      creditText, target, rating, applyCountRaw,
    });
  });

  return items;
}

// ── 정규화 ───────────────────────────────────────────────

function extractFirstDate(text) {
  const t = (text ?? "").trim();

  // 한국어 형식: "2026년 5월 12일"
  const korean = t.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (korean) {
    const [, y, m, d] = korean;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 4자리 연도 구분자 형식: "2026-05-12", "2026.05.12", "2026/05/12", "2026. 5. 12"
  const sep4 = t.match(/(\d{4})\s*[./\-]\s*(\d{1,2})\s*[./\-]\s*(\d{1,2})/);
  if (sep4) {
    const [, y, m, d] = sep4;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 2자리 연도 구분자 형식: "26.05.13", "26. 05. 13", "26-05-13", "26/05/13"
  const sep2 = t.match(/^(\d{2})\s*[./\-]\s*(\d{1,2})\s*[./\-]\s*(\d{1,2})/);
  if (sep2) {
    const [, y, m, d] = sep2;
    return `20${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}

function normalizeItem(raw) {
  const applyCount = parseInt(String(raw.applyCountRaw ?? "").replace(/[^0-9]/g, ""), 10);
  const sortDate = extractFirstDate(raw.applyPeriod) || extractFirstDate(raw.educationPeriod) || "";

  return {
    provider:             "neti",
    id:                   `n${raw.id}`,
    title:                raw.title,
    credit:               raw.creditText || "",
    price:                0,
    discountPrice:        0,
    thumbnail:            raw.thumbnail,
    detailUrl:            raw.detailUrl,
    badges:               [],
    category:             raw.courseType || "",
    trainingType:         raw.courseType || "",
    reviewCount:          0,
    wishCount:            0,
    tutorName:            "",
    schedule:             raw.educationPeriod || "",
    registrationDateTime: "",
    sortDate,
    masterCourseId:       "",
    // neti 전용 확장 필드
    organization:         raw.organization || "",
    applyPeriod:          raw.applyPeriod || "",
    educationPeriod:      raw.educationPeriod || "",
    target:               raw.target || "",
    rating:               raw.rating || "",
    applyCount:           isNaN(applyCount) ? 0 : applyCount,
  };
}

export function normalizeNetiCourses(rawList) {
  if (!Array.isArray(rawList)) return [];

  const normalized = rawList.map(normalizeItem).filter((c) => c.id && c.title);

  const uniqueMap = new Map();
  normalized.forEach((c) => {
    if (!uniqueMap.has(c.id)) uniqueMap.set(c.id, c);
  });

  return Array.from(uniqueMap.values());
}

// ── 수집 함수 ─────────────────────────────────────────────

async function fetchPage(pageIndex) {
  const url = `${BASE_URL}${LIST_PATH}?menuId=1000006045&pageIndex=${pageIndex}`;
  const res = await fetch(url, {
    method: "GET",
    headers: COMMON_HEADERS,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`[neti] 페이지 ${pageIndex} 요청 실패: HTTP ${res.status}`);
  }

  const html = await res.text();
  console.log("[neti] HTML includes card:", html.includes("sub_list_card_wrap_2"));
  return parseCoursesFromHtml(html);
}

// ============================================================
// 메인 수집 함수
// ============================================================
export async function fetchNetiCourses() {
  console.log("[neti] fetch start");
  let requestCount = 0;
  const allRaw = [];

  for (let pageIndex = 1; pageIndex <= MAX_NETI_PAGES; pageIndex++) {
    if (requestCount >= MAX_EXTERNAL_REQUESTS) {
      console.warn(
        `[neti] MAX_EXTERNAL_REQUESTS(${MAX_EXTERNAL_REQUESTS}) 도달 — ` +
        `pageIndex ${pageIndex}부터 중단`
      );
      break;
    }

    if (pageIndex > 1) await sleep(REQUEST_DELAY_MS);
    requestCount++;

    const items = await fetchPage(pageIndex);
    allRaw.push(...items);

    console.log(
      `[neti] pageIndex=${pageIndex} 수집 ${items.length}개 (누계 ${allRaw.length}개)`
    );

    if (items.length === 0) break;
  }

  return {
    allRaw,
    externalRequestCount: requestCount,
  };
}
