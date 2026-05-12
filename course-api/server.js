// ============================================================
// 티처빌 강의 정보 조회 API 서버
// 공개 페이지에서 비로그인 상태로 호출되는 XHR만 사용합니다.
// 로그인/인증이 필요한 데이터는 수집하지 않습니다.
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 외부 API 엔드포인트 상수
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
// ============================================================
const BASE_URL = "https://www.teacherville.co.kr";

// 강의 상세 정보 (차시, 일정, 후기 포함)
// → 이 endpoint는 응답과 함께 JSESSIONID / WMONID 세션 쿠키를 발급합니다.
const COURSE_DETAIL_URL = `${BASE_URL}/trainapply/courseDataSearch.edu`;

// 상품 기본 정보 (강의명, 가격, 썸네일 등)
const GOODS_DETAIL_URL = `${BASE_URL}/api/groobee/getGoodsDetailInfo.edu`;

// 비로그인 추천 강의 ID 목록
// → 세션 없이 호출 가능한 공개 endpoint
const RECOMMAND_IDS_URL = `${BASE_URL}/aiLearningAnalytics/getNewNonLoginAIRecommand.edu`;

// 추천 강의 목록 상세 (ID 배열을 body로 전달)
// ⚠️ Network 탭에서 확인한 실제 Request URL로 교체해 주세요.
//    현재는 정확한 경로 미확인 상태 → 아래 폴백 로직이 동작합니다.
//    경로 확인 후 교체하면 외부 요청 횟수가 2회로 줄어듭니다.
const RECOMMAND_LIST_URL = `${BASE_URL}/getAIRecommandCourseList.edu`;

// ============================================================
// 메모리 캐시 설정
// - Map 자료구조: { goodsCode → { data, expireAt } }
// - 캐시 유효 시간: 10분
// ============================================================
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

/**
 * 캐시에서 데이터를 가져옵니다.
 * 만료되면 자동 삭제 후 null 반환.
 * 반환값: { data, cachedAt } 또는 null
 */
function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expireAt) {
    cache.delete(key);
    return null;
  }
  return { data: entry.data, cachedAt: entry.cachedAt };
}

/**
 * 캐시에 데이터를 저장합니다.
 * cachedAt을 ISO 문자열로 기록해 API 응답에 포함합니다.
 */
function setCache(key, data) {
  cache.set(key, {
    data,
    cachedAt: new Date().toISOString(),
    expireAt: Date.now() + CACHE_TTL_MS,
  });
}

// ============================================================
// 공통 요청 헤더
// ============================================================
const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: `${BASE_URL}/trainapply/aiCourseList.edu`,
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  Origin: BASE_URL,
};

// ============================================================
// 세션 쿠키 파서
// fetch Response 헤더의 Set-Cookie 값에서 쿠키 문자열을 추출합니다.
// ============================================================
function extractCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw
    .map((c) => c.split(";")[0]) // "KEY=VALUE" 부분만 추출
    .join("; ");
}

// ============================================================
// 티처빌 API 호출 함수들
// ============================================================

/**
 * courseDataSearch.edu 호출
 * - 응답: 차시 목록, 일정, 후기 등
 * - 부수 효과: 이 요청이 JSESSIONID / WMONID 쿠키를 발급합니다.
 * - 반환값: { data: {...}, cookies: "JSESSIONID=...; WMONID=..." }
 */
async function fetchCourseDetail(goodsCode) {
  const body = new URLSearchParams({
    _REQ_DATA_TYPE_: "json",
    _USE_WRAPPED_OBJECT_: "true",
    operationCourseGetSeq: goodsCode,
    trainingCourseGetSeq: "",
    trainingGradePointCode: "BA02",
    Credit: "all",
    division: "T",
    semesterCode: "",
    trainingTypeCode: "C01",
    contentsSellYesNo: "N",
    pageDetail: "Y",
    srchCourseRealm: "M10",
    pageLocation: "courseDetail",
    paymentProgressYesNo: "N",
    packageTrainingUseYn: "N",
  });

  const res = await fetch(COURSE_DETAIL_URL, {
    method: "POST",
    headers: COMMON_HEADERS,
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`courseDataSearch 요청 실패: HTTP ${res.status}`);
  }

  // Set-Cookie 헤더에서 세션 쿠키 추출 (다음 요청에 사용)
  const cookies = extractCookies(res);

  const json = await res.json();
  // 응답이 배열이면 첫 번째 항목 사용
  const data = Array.isArray(json) ? json[0] ?? {} : json ?? {};

  return { data, cookies };
}

/**
 * getGoodsDetailInfo.edu 호출
 * - 응답: 강의명, 가격, 썸네일, 카테고리 등
 * - ⚠️ courseDataSearch에서 받은 세션 쿠키가 있어야 정상 응답합니다.
 */
async function fetchGoodsDetail(goodsCode, sessionCookies) {
  const body = new URLSearchParams({ goodsCode });

  const headers = { ...COMMON_HEADERS };
  // 세션 쿠키가 있으면 헤더에 추가
  if (sessionCookies) {
    headers["Cookie"] = sessionCookies;
  }

  const res = await fetch(GOODS_DETAIL_URL, {
    method: "POST",
    headers,
    body: body.toString(),
    // 302 리다이렉트를 자동으로 따라가지 않도록 설정
    redirect: "manual",
  });

  // 302 리다이렉트 = 세션 인증 실패 → null 반환 (호출부에서 fallback 처리)
  if (res.status === 302 || res.status === 301) {
    console.warn(`[경고] getGoodsDetailInfo 302 리다이렉트 발생 (goodsCode: ${goodsCode})`);
    console.warn("       GOODS_DETAIL_URL이 올바른지 Network 탭에서 확인해 주세요.");
    return null;
  }

  if (!res.ok) {
    throw new Error(`getGoodsDetailInfo 요청 실패: HTTP ${res.status}`);
  }

  // 응답이 JSON인지 확인
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("text/plain")) {
    console.warn("[경고] getGoodsDetailInfo가 JSON이 아닌 응답을 반환했습니다.");
    return null;
  }

  const json = await res.json();
  return Array.isArray(json) ? json[0] ?? {} : json ?? {};
}

// ============================================================
// 응답 데이터 정제 함수
// ============================================================

/** 날짜 문자열 정규화: "2026-05-06T00:00:00" → "2026.05.06" */
function formatDate(dateStr) {
  if (!dateStr) return "";
  // 이미 "YYYY.MM.DD" 형식이면 그대로 반환
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) return dateStr;
  return dateStr.replace(/T.*$/, "").replace(/-/g, ".");
}

/** 차시 목록 정제 */
function parseLessons(contentsObjectList) {
  if (!Array.isArray(contentsObjectList)) return [];
  return contentsObjectList.map((item) => ({
    order: item.ordering ?? 0,
    title: item.contentsName ?? "",
    time: parseInt(item.trainingDate, 10) || 0,
    pageCount: item.contentPageCount ?? 0,
  }));
}

/** 운영 일정 목록 정제 */
function parseSchedules(scheduleList) {
  if (!Array.isArray(scheduleList)) return [];
  return scheduleList.map((item) => {
    const startDate = formatDate(item.scheduleStartDateTime);
    const endDate = formatDate(item.scheduleEndDateTime);
    return {
      name: item.semesterName ?? "",
      courseSeq: item.trainingCourseGetSeq ?? "",
      courseName: item.trainingCourseName ?? "",
      requestDate: formatDate(item.requestDateTime),
      requestStartDate: formatDate(item.requestStartDateTime),
      schedule: startDate && endDate ? `${startDate} ~ ${endDate}` : "",
      startDate,
      endDate,
      completionDate: formatDate(item.completionDateTime),
      available: item.trainingAcceptYn === "Y",
      credit: item.trainingGradePointCodeName ?? "",
    };
  });
}

/** 후기 목록 정제 */
function parseReviews(reviewList) {
  if (!Array.isArray(reviewList)) return [];
  return reviewList.map((item) => ({
    title: item.title ?? "",
    body: item.bodyContents ?? "",
    writer: item.memberName ?? "",
    date: formatDate(item.registrationDateTime),
  }));
}

/**
 * 두 API 결과를 합쳐서 최종 응답 객체 생성
 *
 * courseDataSearch (detailData) 에서:
 *   - 차시 목록, 일정, 후기 → 안정적으로 추출 가능
 *   - 강의명: scheduleList[0].trainingCourseName 으로 대체
 *   - 학점: scheduleList[0].trainingGradePointCodeName
 *
 * getGoodsDetailInfo (goodsData) 에서:
 *   - 가격, 썸네일, 카테고리 분류 → null이면 빈값 처리
 */
function buildCourseData(goodsCode, goodsData, detailData) {
  const masterInfo = detailData?.masterCourseInfoVO ?? {};
  const lessons = parseLessons(masterInfo.contentsObjectList);
  const schedules = parseSchedules(detailData?.trainingCourseScheduleList);
  const reviews = parseReviews(detailData?.reviewList);

  // 강의명: goodsData에 있으면 우선 사용, 없으면 일정 목록에서 추출
  const firstSchedule = schedules[0] ?? {};
  const title =
    goodsData?.goodsName ||
    firstSchedule.courseName ||
    detailData?.courseName ||
    "";

  // 학점: 일정 첫 번째 항목에서 추출 (courseDataSearch에서 신뢰성 높음)
  const credit =
    goodsData?.categoryMidiumName || firstSchedule.credit || "";

  return {
    id: goodsCode,
    title,
    price: goodsData?.price ?? 0,
    amount: goodsData?.amount ?? 0,
    image: goodsData?.imageUrl ?? "",
    category: goodsData?.categoryDetailName ?? "",
    largeCategory: goodsData?.categoryLargeName ?? "",
    credit,
    type: goodsData?.categorySmallName ?? "",
    // goodsData를 가져오지 못했으면 true로 표시해서 UI에서 안내 가능
    goodsDataMissing: !goodsData,
    lessons,
    schedules,
    reviews,
  };
}

// ============================================================
// Express 미들웨어 설정
// ============================================================

app.use(cors());
app.use(express.json());

// public 폴더를 정적 파일 서버로 제공
// → http://localhost:3000 접속 시 public/index.html이 열림
app.use(express.static(path.join(__dirname, "public")));

// ============================================================
// API 라우트
// ============================================================

/**
 * GET /api/course/:goodsCode
 * 단건 강의 상세 조회
 * 예: GET /api/course/O1005871
 */
app.get("/api/course/:goodsCode", async (req, res) => {
  const { goodsCode } = req.params;

  if (!goodsCode || goodsCode.trim() === "") {
    return res.status(400).json({ error: "goodsCode가 필요합니다." });
  }

  // ── 캐시 히트: 외부 요청 없이 즉시 반환 ──────────────────────
  const cacheEntry = getCache(goodsCode);
  if (cacheEntry) {
    console.log(`[캐시 HIT] ${goodsCode} (저장 시각: ${cacheEntry.cachedAt})`);
    return res.json({
      ...cacheEntry.data,
      cached: true,
      cachedAt: cacheEntry.cachedAt,
    });
  }

  // ── 캐시 미스: 외부 요청 (단건 1회만) ─────────────────────────
  // ⚠️ 자동 재시도 없음 — 실패 시 에러 반환
  console.log(`[외부 요청 시작] ${goodsCode}`);

  try {
    // 1단계: courseDataSearch.edu 호출 (1회)
    //        응답과 함께 JSESSIONID / WMONID 세션 쿠키를 발급받습니다.
    const { data: detailData, cookies: sessionCookies } =
      await fetchCourseDetail(goodsCode);

    console.log(`[세션 쿠키 획득] ${sessionCookies ? "성공" : "실패"}`);

    // 2단계: getGoodsDetailInfo.edu 호출 (1회)
    //        실패해도 서버가 죽지 않도록 try/catch 처리
    //        → 실패 시 가격·이미지·카테고리는 빈값으로 처리
    let goodsData = null;
    try {
      goodsData = await fetchGoodsDetail(goodsCode, sessionCookies);
      if (goodsData) {
        console.log(`[상품 정보 획득] 성공 (가격: ${goodsData.price})`);
      } else {
        console.warn(`[상품 정보] 응답 없음 → 가격/이미지 공란으로 처리`);
      }
    } catch (goodsErr) {
      // 자동 재시도하지 않음 — 그냥 null로 처리
      console.warn(`[상품 정보 오류] ${goodsErr.message}`);
    }

    // 두 응답을 합쳐 정제된 데이터 생성
    const courseData = buildCourseData(goodsCode, goodsData, detailData);
    const now = new Date().toISOString();

    // 캐시에 저장 (10분) — 이후 동일 goodsCode 요청은 외부 호출 없이 반환
    setCache(goodsCode, courseData);

    console.log(`[완료] ${goodsCode} → 차시 ${courseData.lessons.length}개, 일정 ${courseData.schedules.length}개`);

    return res.json({
      ...courseData,
      cached: false,
      cachedAt: now,
    });
  } catch (err) {
    // 자동 재시도하지 않음 — 에러를 그대로 반환
    console.error(`[에러] ${goodsCode}:`, err.message);
    return res.status(500).json({
      error: "강의 정보를 가져오는 중 오류가 발생했습니다.",
      detail: err.message,
    });
  }
});

/**
 * GET /api/cache-status
 * 현재 메모리 캐시 상태 확인 (개발 디버깅용)
 */
app.get("/api/cache-status", (req, res) => {
  const entries = [];
  const now = Date.now();
  cache.forEach((value, key) => {
    entries.push({
      goodsCode: key,
      cachedAt: value.cachedAt,
      expiresIn: Math.round((value.expireAt - now) / 1000) + "초",
    });
  });
  res.json({ count: entries.length, entries });
});

// ============================================================
// 추천 강의 목록 API 함수
// ============================================================

/**
 * 추천 강의 ID 목록 조회 (외부 요청 1회)
 * 세션 없이 호출 가능한 공개 endpoint 사용
 * 반환: { ids: string[], cookies: string }
 */
async function fetchRecommandIds() {
  const res = await fetch(
    `${RECOMMAND_IDS_URL}?_REQ_DATA_TYPE_=json&_USE_WRAPPED_OBJECT_=true`,
    {
      method: "POST",
      headers: COMMON_HEADERS,
    }
  );

  if (!res.ok) {
    throw new Error(`추천 ID 목록 요청 실패: HTTP ${res.status}`);
  }

  const cookies = extractCookies(res);
  const json = await res.json();

  if (!Array.isArray(json)) {
    throw new Error("추천 ID 목록 응답 형식 오류");
  }

  const ids = json
    .map((item) => item.operationCourseGetSeq)
    .filter(Boolean);

  return { ids, cookies };
}

/**
 * 추천 강의 목록 상세 조회 — 1차 시도: RECOMMAND_LIST_URL (외부 요청 1회)
 * 이 URL이 정확하면 외부 요청 총 2회로 처리됩니다.
 * 비정상 응답(비JSON, 빈 배열 등)이면 null을 반환해 폴백으로 넘깁니다.
 */
async function fetchRecommandListPrimary(ids, sessionCookies) {
  const body = new URLSearchParams({
    operationCourseGetSeqList: ids.join(","),
  });

  const headers = { ...COMMON_HEADERS };
  if (sessionCookies) headers["Cookie"] = sessionCookies;

  const res = await fetch(
    `${RECOMMAND_LIST_URL}?_REQ_DATA_TYPE_=json&_USE_WRAPPED_OBJECT_=true`,
    {
      method: "POST",
      headers,
      body: body.toString(),
      redirect: "manual",
    }
  );

  if (res.status === 302 || res.status === 301) {
    console.warn("[추천목록] RECOMMAND_LIST_URL 세션 오류(302) → 폴백 사용");
    return null;
  }

  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("text/plain")) {
    console.warn("[추천목록] RECOMMAND_LIST_URL 비JSON 응답 → 폴백 사용");
    return null;
  }

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    // 유효한 배열 데이터인지 확인
    if (Array.isArray(json) && json.length > 0 && json[0] !== null) {
      return json;
    }
  } catch (_) {
    // 파싱 실패
  }

  console.warn("[추천목록] RECOMMAND_LIST_URL 유효 데이터 없음 → 폴백 사용");
  return null;
}

/**
 * 추천 강의 목록 상세 조회 — 폴백: GOODS_DETAIL_URL 병렬 호출
 * RECOMMAND_LIST_URL이 작동하지 않을 때 사용합니다.
 * 외부 요청 횟수: ID 개수만큼 (기본 8회)
 * 각 요청은 경량 groobee API를 사용하며 실패한 항목은 건너뜁니다.
 */
async function fetchRecommandListFallback(ids) {
  console.warn(`[추천목록] 폴백 실행: getGoodsDetailInfo × ${ids.length}회`);
  console.warn("           RECOMMAND_LIST_URL을 Network 탭에서 확인 후 교체하면 이 로직이 사라집니다.");

  const results = await Promise.allSettled(
    ids.map((id) =>
      fetch(`${GOODS_DETAIL_URL}?_REQ_DATA_TYPE_=json&_USE_WRAPPED_OBJECT_=true`, {
        method: "POST",
        headers: COMMON_HEADERS,
        body: new URLSearchParams({ goodsCode: id }).toString(),
        redirect: "manual",
      })
        .then(async (r) => {
          if (!r.ok || r.status === 302) return null;
          const json = await r.json();
          return Array.isArray(json) ? json[0] : json;
        })
        .catch(() => null)
    )
  );

  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);
}

/**
 * 추천 목록 응답을 사이트에서 쓰기 좋은 구조로 정제합니다.
 * RECOMMAND_LIST_URL 응답과 GOODS_DETAIL_URL 응답 모두 처리합니다.
 */
function normalizeRecommandItem(item, fallbackId) {
  if (!item) return null;

  // RECOMMAND_LIST_URL 응답의 필드 (확인 전 — 실제 필드명은 Network 탭 확인 후 수정)
  // GOODS_DETAIL_URL 응답의 필드 (확인됨)
  return {
    id: item.operationCourseGetSeq ?? item.goodsCode ?? fallbackId ?? "",
    title: item.goodsName ?? item.courseName ?? item.trainingCourseName ?? "",
    price: item.price ?? item.salePrice ?? item.amount ?? 0,
    image: item.imageUrl ?? item.thumbnailUrl ?? item.thumnailImageUrl ?? "",
    category: item.categoryDetailName ?? "",
    largeCategory: item.categoryLargeName ?? "",
    credit: item.categoryMidiumName ?? "",
    type: item.categorySmallName ?? "",
  };
}

// ============================================================
// 추천 목록 캐시 (단건 캐시와 별도 키 사용)
// ============================================================
const RECOMMAND_CACHE_KEY = "__recommand__";

/**
 * GET /api/recommend
 * 추천 강의 목록 조회 (최대 외부 요청 2회, 10분 캐시)
 *
 * 동작 순서:
 * 1. getNewNonLoginAIRecommand.edu → ID 목록 (외부 1회)
 * 2-a. RECOMMAND_LIST_URL → 목록 상세 (외부 1회) — URL이 맞으면 이 경로
 * 2-b. getGoodsDetailInfo.edu × N — URL 미확인 시 폴백
 */
app.get("/api/recommend", async (req, res) => {
  // 캐시 히트
  const cacheEntry = getCache(RECOMMAND_CACHE_KEY);
  if (cacheEntry) {
    console.log("[추천목록] 캐시 HIT");
    return res.json({
      ...cacheEntry.data,
      cached: true,
      cachedAt: cacheEntry.cachedAt,
    });
  }

  console.log("[추천목록] 외부 요청 시작");

  try {
    // 외부 요청 1: 추천 ID 목록
    const { ids, cookies: sessionCookies } = await fetchRecommandIds();
    console.log(`[추천목록] ID ${ids.length}개 수신: ${ids.join(", ")}`);

    // 외부 요청 2: 목록 상세 (RECOMMAND_LIST_URL 시도 → 실패 시 폴백)
    let rawList = await fetchRecommandListPrimary(ids, sessionCookies);
    const usedFallback = !rawList;

    if (usedFallback) {
      rawList = await fetchRecommandListFallback(ids);
    }

    // 정규화
    const courses = rawList
      .map((item, i) => normalizeRecommandItem(item, ids[i]))
      .filter(Boolean);

    const now = new Date().toISOString();
    const result = {
      courses,
      usedFallback,
      // usedFallback이 true이면 RECOMMAND_LIST_URL을 Network 탭에서 확인 필요
    };

    setCache(RECOMMAND_CACHE_KEY, result);
    console.log(`[추천목록] 완료: ${courses.length}개 (폴백: ${usedFallback})`);

    return res.json({ ...result, cached: false, cachedAt: now });
  } catch (err) {
    console.error("[추천목록] 에러:", err.message);
    return res.status(500).json({
      error: "추천 강의 목록을 가져오는 중 오류가 발생했습니다.",
      detail: err.message,
    });
  }
});

// ============================================================
// 서버 시작
// ============================================================
app.listen(PORT, () => {
  console.log(`\n✅ 서버 시작됨`);
  console.log(`   브라우저 테스트: http://localhost:${PORT}`);
  console.log(`   API 테스트:      http://localhost:${PORT}/api/course/O1005871`);
  console.log(`   추천 목록:       http://localhost:${PORT}/api/recommend`);
  console.log(`   캐시 상태 확인:  http://localhost:${PORT}/api/cache-status\n`);
});
