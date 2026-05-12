// ============================================================
// 티처빌 강의 조회 테스트 페이지 — 클라이언트 스크립트
// 로컬 테스트 전용 단건 조회 API + 추천 목록 사이드바
//
// ⚠️ 운영 원칙
//   - 사용자 액션(버튼 클릭)이 있을 때만 API 호출
//   - 페이지 로드 시 자동 조회 없음
//   - 요청 진행 중 중복 요청 차단
//   - 실패 시 자동 재시도 없음
//   - setInterval / setTimeout 기반 폴링 없음
// ============================================================

// ============================================================
// DOM 요소 참조
// ============================================================
const inputGoodsCode   = document.getElementById("input-goods-code");
const btnSearch        = document.getElementById("btn-search");
const statusMessage    = document.getElementById("status-message");
const resultWrap       = document.getElementById("result-wrap");
const btnLoadRecommand = document.getElementById("btn-load-recommand");
const recommandStatus  = document.getElementById("recommand-status");
const recommandList    = document.getElementById("recommand-list");

// ============================================================
// 중복 요청 방지용 플래그
// ============================================================
let isDetailLoading    = false; // 단건 조회 진행 중
let isRecommandLoading = false; // 추천 목록 로딩 중

// ============================================================
// 유틸 함수
// ============================================================

function formatPrice(value) {
  if (!value && value !== 0) return "-";
  if (value === 0) return "0원";
  return Number(value).toLocaleString("ko-KR") + "원";
}

function orDash(value) {
  return value || "-";
}

// ============================================================
// 단건 조회: 상태 메시지
// ============================================================

function showLoading() {
  statusMessage.className = "status-message loading";
  statusMessage.textContent = "조회 중...";
  statusMessage.hidden = false;
  resultWrap.hidden = true;
}

function showError(message) {
  statusMessage.className = "status-message error";
  statusMessage.textContent = message || "데이터를 가져오지 못했습니다.";
  statusMessage.hidden = false;
  resultWrap.hidden = true;
}

function hideStatus() {
  statusMessage.hidden = true;
}

// ============================================================
// 추천 목록: 상태 메시지
// ============================================================

function showRecommandLoading() {
  recommandStatus.className = "recommand-status loading";
  recommandStatus.textContent = "추천 목록 불러오는 중...";
  recommandStatus.hidden = false;
}

function showRecommandError(message) {
  recommandStatus.className = "recommand-status error";
  recommandStatus.textContent = message || "추천 목록을 가져오지 못했습니다.";
  recommandStatus.hidden = false;
}

function hideRecommandStatus() {
  recommandStatus.hidden = true;
}

// ============================================================
// 단건 조회: 화면 렌더링
// ============================================================

function renderInfo(data) {
  const imgEl = document.getElementById("result-image");
  if (data.image) {
    imgEl.src = data.image;
    imgEl.alt = data.title || "강의 썸네일";
    imgEl.hidden = false;
  } else {
    imgEl.src = "";
    imgEl.hidden = true;
  }

  document.getElementById("result-large-category").textContent = orDash(data.largeCategory);
  document.getElementById("result-title").textContent = orDash(data.title);
  document.getElementById("result-category").textContent = orDash(data.category);
  document.getElementById("result-credit").textContent = orDash(data.credit);
  document.getElementById("result-type").textContent = orDash(data.type);
  document.getElementById("result-price").textContent = formatPrice(data.price);

  const cacheEl = document.getElementById("cache-indicator");
  if (cacheEl) {
    if (data.cached) {
      cacheEl.textContent = `캐시 데이터 (저장: ${data.cachedAt ?? ""})`;
      cacheEl.className = "cache-indicator cached";
    } else {
      cacheEl.textContent = `새로 조회됨 (${data.cachedAt ?? ""})`;
      cacheEl.className = "cache-indicator fresh";
    }
    cacheEl.hidden = false;
  }

  const noticeEl = document.getElementById("goods-data-notice");
  if (noticeEl) noticeEl.hidden = !data.goodsDataMissing;
}

function renderLessons(lessons) {
  const listEl = document.getElementById("result-lessons");
  listEl.innerHTML = "";

  if (!Array.isArray(lessons) || lessons.length === 0) {
    listEl.innerHTML = '<li class="empty-message">차시 정보가 없습니다.</li>';
    return;
  }

  lessons.forEach((lesson) => {
    const li = document.createElement("li");
    li.className = "lesson-item";
    li.innerHTML = `
      <span class="lesson-order">${lesson.order ?? "-"}차시</span>
      <span class="lesson-title">${lesson.title || "(제목 없음)"}</span>
      <span class="lesson-meta">${lesson.time ? lesson.time + "분" : ""}${lesson.pageCount ? " · " + lesson.pageCount + "페이지" : ""}</span>
    `;
    listEl.appendChild(li);
  });
}

function renderSchedules(schedules) {
  const listEl = document.getElementById("result-schedules");
  listEl.innerHTML = "";

  if (!Array.isArray(schedules) || schedules.length === 0) {
    listEl.innerHTML = '<li class="empty-message">운영 일정 정보가 없습니다.</li>';
    return;
  }

  schedules.forEach((sch) => {
    const li = document.createElement("li");
    li.className = "schedule-item" + (sch.available ? " available" : "");
    const badgeClass = sch.available ? "open" : "closed";
    const badgeText  = sch.available ? "신청 가능" : "신청 마감";

    li.innerHTML = `
      <div class="schedule-name">
        <span class="schedule-badge ${badgeClass}">${badgeText}</span>
        ${sch.name || ""}
      </div>
      <div class="schedule-dates">
        <span>신청 기간: ${sch.requestStartDate || "-"} ~ ${sch.requestDate || "-"}</span>
        <span>연수 기간: ${sch.schedule || "-"}</span>
        <span>이수 기한: ${sch.completionDate || "-"}</span>
      </div>
    `;
    listEl.appendChild(li);
  });
}

function renderReviews(reviews) {
  const listEl = document.getElementById("result-reviews");
  listEl.innerHTML = "";

  if (!Array.isArray(reviews) || reviews.length === 0) {
    listEl.innerHTML = '<li class="empty-message">후기 정보가 없습니다.</li>';
    return;
  }

  reviews.forEach((review) => {
    const li = document.createElement("li");
    li.className = "review-item";
    li.innerHTML = `
      <p class="review-title">${review.title || "(제목 없음)"}</p>
      <p class="review-body">${review.body || ""}</p>
      <p class="review-footer">${review.writer || "익명"} · ${review.date || ""}</p>
    `;
    listEl.appendChild(li);
  });
}

function renderResult(data) {
  renderInfo(data);
  renderLessons(data.lessons);
  renderSchedules(data.schedules);
  renderReviews(data.reviews);
  document.getElementById("result-raw").textContent = JSON.stringify(data, null, 2);
  resultWrap.hidden = false;
}

// ============================================================
// 추천 목록: 화면 렌더링
// ============================================================

function renderRecommandList(courses, currentId) {
  recommandList.innerHTML = "";

  if (!Array.isArray(courses) || courses.length === 0) {
    recommandList.innerHTML = '<li class="empty-message" style="padding:16px">추천 강의가 없습니다.</li>';
    return;
  }

  courses.forEach((course) => {
    const li = document.createElement("li");
    li.className = "recommand-item" + (course.id === currentId ? " active" : "");
    li.dataset.id = course.id;

    const thumbHtml = course.image
      ? `<img class="recommand-thumb" src="${course.image}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="recommand-thumb-placeholder"></div>`;

    const metaParts = [course.credit, course.category].filter(Boolean);

    li.innerHTML = `
      ${thumbHtml}
      <div class="recommand-info">
        <p class="recommand-title">${course.title || "(제목 없음)"}</p>
        <p class="recommand-meta">${metaParts.join(" · ") || ""}</p>
      </div>
    `;

    // 클릭 시 ID를 입력창에 넣고 단건 조회 실행
    li.addEventListener("click", () => {
      inputGoodsCode.value = course.id;

      // 활성 항목 표시 업데이트
      document.querySelectorAll(".recommand-item").forEach((el) => el.classList.remove("active"));
      li.classList.add("active");

      // 단건 조회 실행
      handleSearch();
    });

    recommandList.appendChild(li);
  });
}

// ============================================================
// API 호출 함수
// ============================================================

async function fetchCourse(goodsCode) {
  const response = await fetch(`/api/course/${encodeURIComponent(goodsCode)}`);

  if (!response.ok) {
    let errMsg = `서버 오류 (HTTP ${response.status})`;
    try {
      const errData = await response.json();
      if (errData.error) errMsg = errData.error;
      if (errData.detail) errMsg += ` — ${errData.detail}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return response.json();
}

async function fetchRecommand() {
  const response = await fetch("/api/recommend");

  if (!response.ok) {
    let errMsg = `서버 오류 (HTTP ${response.status})`;
    try {
      const errData = await response.json();
      if (errData.error) errMsg = errData.error;
      if (errData.detail) errMsg += ` — ${errData.detail}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return response.json();
}

// ============================================================
// 단건 조회 실행
// ============================================================

async function handleSearch() {
  if (isDetailLoading) return;

  const goodsCode = inputGoodsCode.value.trim();
  if (!goodsCode) {
    showError("강의 ID를 입력해 주세요.");
    return;
  }

  isDetailLoading = true;
  btnSearch.disabled = true;
  showLoading();

  try {
    const data = await fetchCourse(goodsCode);
    hideStatus();
    renderResult(data);
  } catch (err) {
    showError(err.message || "데이터를 가져오지 못했습니다.");
  } finally {
    isDetailLoading = false;
    btnSearch.disabled = false;
  }
}

// ============================================================
// 추천 목록 불러오기
// ============================================================

async function handleLoadRecommand() {
  if (isRecommandLoading) return;

  isRecommandLoading = true;
  btnLoadRecommand.disabled = true;
  showRecommandLoading();

  try {
    const data = await fetchRecommand();
    hideRecommandStatus();

    const currentId = inputGoodsCode.value.trim();
    renderRecommandList(data.courses ?? [], currentId);
  } catch (err) {
    showRecommandError(err.message || "추천 목록을 가져오지 못했습니다.");
  } finally {
    isRecommandLoading = false;
    btnLoadRecommand.disabled = false;
  }
}

// ============================================================
// 이벤트 바인딩
// ⚠️ 페이지 로드 시 자동 실행 없음 — 사용자 클릭/Enter만 허용
// ============================================================

btnSearch.addEventListener("click", handleSearch);

inputGoodsCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});

btnLoadRecommand.addEventListener("click", handleLoadRecommand);
