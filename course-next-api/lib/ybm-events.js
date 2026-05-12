// ============================================================
// YBM선생님닷컴 진행중 이벤트 수집 모듈
//
// 수집 방식:
//   - GET /ver20/help/event_list.asp (진행중 이벤트만)
//   - EUC-KR → UTF-8 변환 (iconv-lite)
//   - cheerio HTML 파싱
//   - 종료 이벤트 / 페이지네이션 수집 금지
// ============================================================

import axios     from "axios";
import { load }  from "cheerio";
import iconv     from "iconv-lite";

const BASE_URL = "https://www.ybmteachers.com";
const LIST_URL = `${BASE_URL}/ver20/help/event_list.asp`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Referer: BASE_URL,
};

// ── 날짜 헬퍼 ────────────────────────────────────────────

// YYYY.MM.DD / YYYY/MM/DD / YYYY-MM-DD → YYYY-MM-DD, 빈값이면 ""
function normalizeDate(raw) {
  return (raw ?? "").trim().replace(/[./]/g, "-");
}

function parseDateRange(text) {
  const [startDate = "", endDate = ""] = (text ?? "").trim().split("~");
  return { startDate: normalizeDate(startDate), endDate: normalizeDate(endDate) };
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

// ── 파싱 ─────────────────────────────────────────────────

export function parseYbmEvents(html) {
  const $ = load(html);
  const items = [];

  $(".eve_wrap ul > li").each((_, li) => {
    const $li = $(li);

    const title     = $li.find(".info .title").text().trim();
    const thumbnail = $li.find(".thumb img").attr("src") ?? "";
    const detailUrl = $li.find("a").attr("href") ?? "";
    const dayText   = $li.find(".info .day").text().trim();
    const { startDate, endDate } = parseDateRange(dayText);

    if (!title) return;

    items.push({ title, thumbnail, detailUrl, startDate, endDate });
  });

  return items;
}

// ── 정규화 ───────────────────────────────────────────────

function extractId(detailUrl, idx) {
  const m = detailUrl.match(/event[_/]([^/]+)\.asp/i);
  return m ? `ybm-ev-${m[1]}` : `ybm-ev-${idx}`;
}

function normalizeItem(raw, idx) {
  const thumbnail = raw.thumbnail
    ? raw.thumbnail.startsWith("http")
      ? raw.thumbnail
      : `${BASE_URL}${raw.thumbnail.startsWith("/") ? "" : "/"}${raw.thumbnail}`
    : "";

  const detailUrl = raw.detailUrl
    ? raw.detailUrl.startsWith("http")
      ? raw.detailUrl
      : `${BASE_URL}${raw.detailUrl.startsWith("/") ? "" : "/"}${raw.detailUrl}`
    : "";

  return {
    provider:  "ybm",
    id:        extractId(raw.detailUrl, idx),
    title:     raw.title,
    thumbnail,
    detailUrl,
    startDate: raw.startDate,
    endDate:   raw.endDate,
    status:    calcStatus(raw.endDate),
    dday:      calcDday(raw.endDate),
  };
}

export function normalizeYbmEvents(rawList) {
  if (!Array.isArray(rawList)) return [];

  const normalized = rawList
    .map((raw, idx) => normalizeItem(raw, idx))
    .filter((e) => e.id && e.title);

  const seen = new Set();
  return normalized.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

// ── 수집 함수 ─────────────────────────────────────────────

export async function fetchYbmEvents() {
  console.log("[ybm-events] fetch start");

  const response = await axios.get(LIST_URL, {
    headers:      HEADERS,
    timeout:      10000,
    responseType: "arraybuffer",
  });

  console.log("[ybm-events] fetch success");

  const html  = iconv.decode(Buffer.from(response.data), "euc-kr");
  const items = parseYbmEvents(html);

  console.log(`[ybm-events] 완료: ${items.length}개`);

  return { allRaw: items, externalRequestCount: 1 };
}
