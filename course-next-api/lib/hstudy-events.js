// ============================================================
// 한국교원연수원(hstudy) 이벤트 목록 수집 모듈
//
// 수집 방식:
//   - POST /newmain/ajaxList/eventList.asp
//   - 응답: HTML fragment → cheerio 파싱
//   - 현재 1페이지 단일 요청 (전체 이벤트 노출 구조)
// ============================================================

import axios from "axios";
import { load } from "cheerio";

const BASE_URL = "https://www.hstudy.co.kr";
const LIST_URL = `${BASE_URL}/newmain/ajaxList/eventList.asp`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Referer: `${BASE_URL}/newmain/_community/eventList.asp`,
};

// ── 파싱 ─────────────────────────────────────────────────

function extractBgUrl(style) {
  const m = (style ?? "").match(/background:url\(['"]?([^'")\s]+)['"]?\)/);
  if (!m) return "";
  return m[1].startsWith("http") ? m[1] : `${BASE_URL}${m[1]}`;
}

function extractOnclickUrl(onclick) {
  const m = (onclick ?? "").match(/window\.open\(['"]([^'"]+)['"]\)/);
  if (!m) return "";
  return m[1].startsWith("http") ? m[1] : `${BASE_URL}${m[1]}`;
}

function parseDateRange(text) {
  const clean = (text ?? "").replace(/\s/g, "");
  const [startDate = "", endDate = ""] = clean.split("~");
  return { startDate: startDate.replace(/\./g, "-"), endDate: endDate.replace(/\./g, "-") };
}

// endDate 기준 dday: 없으면 null, 음수 허용
function calcDday(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

// endDate 기준 status: 없으면 fallback (HTML 파싱값)
function calcStatus(endDate, fallback = "") {
  if (!endDate) return fallback;
  const end = new Date(endDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now <= end ? "진행중" : "종료";
}

function extractId(detailUrl) {
  const m = detailUrl.match(/event_page\/([^.]+)\.asp/);
  return m ? `hs-ev-${m[1]}` : `hs-ev-${Date.now()}`;
}

export function parseHstudyEvents(html) {
  const $ = load(html);
  const items = [];

  $(".event_list > ul > li").each((_, li) => {
    const $li = $(li);

    const title     = $li.find(".txt_area a").first().text().trim();
    const thumbnail = extractBgUrl($li.find(".img_area").attr("style") ?? "");
    const detailUrl = extractOnclickUrl(
      $li.find(".txt_area a").first().attr("onclick") ??
      $li.find(".img_area").attr("onclick") ?? ""
    );
    const dateText  = $li.find(".txt_area .date").text().trim();
    const { startDate, endDate } = parseDateRange(dateText);
    const status    = $li.find(".txt_area .end").length > 0 ? "종료" : "진행중";

    if (!title) return;

    items.push({ title, thumbnail, detailUrl, startDate, endDate, status });
  });

  return items;
}

// ── 정규화 ───────────────────────────────────────────────

function normalizeItem(raw) {
  const id     = extractId(raw.detailUrl);
  const status = calcStatus(raw.endDate, raw.status);
  const dday   = calcDday(raw.endDate);

  return {
    provider:  "hstudy",
    id,
    title:     raw.title,
    thumbnail: raw.thumbnail,
    detailUrl: raw.detailUrl,
    startDate: raw.startDate,
    endDate:   raw.endDate,
    status,
    dday,
  };
}

export function normalizeHstudyEvents(rawList) {
  if (!Array.isArray(rawList)) return [];

  const normalized = rawList.map(normalizeItem).filter((e) => e.id && e.title);

  const seen = new Set();
  return normalized.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

// ── 수집 함수 ─────────────────────────────────────────────

export async function fetchHstudyEvents() {
  console.log("[hstudy-events] fetch start");

  const response = await axios.post(
    LIST_URL,
    new URLSearchParams({ page_count: "1", evt: "" }).toString(),
    { headers: HEADERS, timeout: 10000, responseType: "text" }
  );

  console.log("[hstudy-events] fetch success");

  const html  = response.data;
  const items = parseHstudyEvents(html);

  console.log(`[hstudy-events] 완료: ${items.length}개`);

  return { allRaw: items, externalRequestCount: 1 };
}
