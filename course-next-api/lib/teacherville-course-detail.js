// ============================================================
// 티처빌 단건 강의 상세 조회 모듈
// 로컬 테스트 전용 — 비로그인 공개 XHR만 사용
//
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
//
// 동작 플로우:
//   1. courseDataSearch.edu  → 차시/일정/후기 + 세션 쿠키 발급
//   2. getGoodsDetailInfo.edu → 강의명/가격/썸네일/카테고리
// ============================================================

const BASE_URL =
  process.env.TEACHERVILLE_BASE_URL ?? "https://www.teacherville.co.kr";

const COURSE_DETAIL_URL  = `${BASE_URL}/trainapply/courseDataSearch.edu`;
const GOODS_DETAIL_URL   = `${BASE_URL}/api/groobee/getGoodsDetailInfo.edu`;

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: `${BASE_URL}/trainapply/aiCourseList.edu`,
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  Origin: BASE_URL,
};

// ── Set-Cookie 파서 ─────────────────────────────────────────
function extractCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

// ── Step 1: courseDataSearch.edu ────────────────────────────
async function fetchCourseDataSearch(goodsCode) {
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
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`courseDataSearch 요청 실패: HTTP ${res.status}`);

  const cookies = extractCookies(res);
  const json = await res.json();
  const data = Array.isArray(json) ? (json[0] ?? {}) : (json ?? {});

  return { data, cookies };
}

// ── Step 2: getGoodsDetailInfo.edu ──────────────────────────
async function fetchGoodsDetailInfo(goodsCode, sessionCookies) {
  const headers = { ...COMMON_HEADERS };
  if (sessionCookies) headers["Cookie"] = sessionCookies;

  const res = await fetch(GOODS_DETAIL_URL, {
    method: "POST",
    headers,
    body: new URLSearchParams({ goodsCode }).toString(),
    cache: "no-store",
    redirect: "manual",
  });

  if (res.status === 302 || res.status === 301) {
    console.warn(`[상세] getGoodsDetailInfo 302 → 가격/이미지 공란 처리 (${goodsCode})`);
    return null;
  }
  if (!res.ok) throw new Error(`getGoodsDetailInfo 요청 실패: HTTP ${res.status}`);

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json") && !ct.includes("text/plain")) return null;

  const json = await res.json();
  return Array.isArray(json) ? (json[0] ?? {}) : (json ?? {});
}

// ── 날짜 정규화 ─────────────────────────────────────────────
function formatDate(d) {
  if (!d) return "";
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(d)) return d;
  return d.replace(/T.*$/, "").replace(/-/g, ".");
}

// ── 데이터 정제 ─────────────────────────────────────────────
function parseLessons(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    order:     item.ordering ?? 0,
    title:     item.contentsName ?? "",
    time:      parseInt(item.trainingDate, 10) || 0,
    pageCount: item.contentPageCount ?? 0,
  }));
}

function parseSchedules(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const start = formatDate(item.scheduleStartDateTime);
    const end   = formatDate(item.scheduleEndDateTime);
    return {
      name:            item.semesterName ?? "",
      courseSeq:       item.trainingCourseGetSeq ?? "",
      courseName:      item.trainingCourseName ?? "",
      requestDate:     formatDate(item.requestDateTime),
      requestStartDate: formatDate(item.requestStartDateTime),
      schedule:        start && end ? `${start} ~ ${end}` : "",
      startDate:       start,
      endDate:         end,
      completionDate:  formatDate(item.completionDateTime),
      available:       item.trainingAcceptYn === "Y",
      credit:          item.trainingGradePointCodeName ?? "",
    };
  });
}

function parseReviews(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    title:  item.title ?? "",
    body:   item.bodyContents ?? "",
    writer: item.memberName ?? "",
    date:   formatDate(item.registrationDateTime),
  }));
}

function buildCourseData(goodsCode, goodsData, detailData) {
  const masterInfo = detailData?.masterCourseInfoVO ?? {};
  const lessons    = parseLessons(masterInfo.contentsObjectList);
  const schedules  = parseSchedules(detailData?.trainingCourseScheduleList);
  const reviews    = parseReviews(detailData?.reviewList);

  const firstSchedule = schedules[0] ?? {};
  const title =
    goodsData?.goodsName || firstSchedule.courseName || detailData?.courseName || "";
  const credit =
    goodsData?.categoryMidiumName || firstSchedule.credit || "";

  const masterCourseSeq = masterInfo?.masterCourseGetSeq ?? "";
  const detailUrl = `/trainapply/newCourseDetail.edu?division=T&courseSeq=${goodsCode}&t=${masterCourseSeq}`;

  return {
    id:              goodsCode,
    title,
    price:           goodsData?.price ?? 0,
    amount:          goodsData?.amount ?? 0,
    image:           goodsData?.imageUrl ?? "",
    category:        goodsData?.categoryDetailName ?? "",
    largeCategory:   goodsData?.categoryLargeName ?? "",
    credit,
    type:            goodsData?.categorySmallName ?? "",
    goodsDataMissing: !goodsData,
    detailUrl,
    lessons,
    schedules,
    reviews,
    tutorName:   masterInfo.tutorName ?? detailData?.tutorName ?? "",
    target:      masterInfo.targetMemberName ?? detailData?.targetMemberName ?? "",
    reviewCount: reviews.length,
    wishCount:   goodsData?.wishCount ?? goodsData?.likeCount ?? 0,
  };
}

// ── 메인 함수 ───────────────────────────────────────────────
export async function fetchCourseDetail(goodsCode) {
  // 외부 요청 1: courseDataSearch (세션 쿠키 포함)
  const { data: detailData, cookies } = await fetchCourseDataSearch(goodsCode);

  // 외부 요청 2: getGoodsDetailInfo (세션 쿠키 전달)
  let goodsData = null;
  try {
    goodsData = await fetchGoodsDetailInfo(goodsCode, cookies);
  } catch (e) {
    console.warn(`[상세] goodsData 실패: ${e.message}`);
  }

  return buildCourseData(goodsCode, goodsData, detailData);
}
