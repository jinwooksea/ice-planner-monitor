"use client";

// ============================================================
// 티처빌 전체 연수 목록 조회 — 내부 테스트 페이지
//
// 이 프로젝트는 로컬/내부 테스트용 공개 목록 데이터 조회 프로토타입입니다.
// ⚠️ 실제 운영 전에 대상 사이트의 이용약관, robots.txt,
//    데이터 사용 권한을 반드시 확인하세요.
// ============================================================

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import CourseList from "@/components/CourseList";
import EventList from "@/components/EventList";
import CacheStatusPanel from "@/components/CacheStatusPanel";
import DetailPanel from "@/components/DetailPanel";
import {
  PAGE_SIZE_UI,
  PRICE_FILTERS,
  PROVIDER_FILTERS,
  SORT_TABS,
} from "@/lib/filters";
import { markNewCourses } from "@/lib/format";

// ============================================================
// 메인 페이지 — 컨트롤러
// ============================================================
export default function Page() {
  // ── 목록 상태 ────────────────────────────────────────────
  const [courses, setCourses]         = useState([]);
  const [meta, setMeta]               = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError]     = useState(null);
  const [rawJson, setRawJson]         = useState(null);

  // ── 상세 상태 ────────────────────────────────────────────
  const [activeId, setActiveId]           = useState(null);
  const [detail, setDetail]               = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState(null);

  // ── 검색/필터/정렬 (외부 요청 없음) ─────────────────────
  const [searchText, setSearchText]         = useState("");
  const [filterCredit, setFilterCredit]     = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriceIdx, setFilterPriceIdx] = useState(0);
  const [filterType, setFilterType]         = useState(""); // "" | "일반연수" | "패키지"
  const [filterProvider, setFilterProvider] = useState(""); // "" | "teacherville" | "hstudy"
  const [sortKey, setSortKey]               = useState("latest"); // latest | popular | recommend

  // ── 즐겨찾기 (localStorage 영속, 강의+이벤트 공용) ──────
  const [favoriteIds, setFavoriteIds]             = useState(() => new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // ── 추천 ID (추천순 정렬 + 배지용) ──────────────────────
  const [recommendIds, setRecommendIds] = useState(new Set());

  // ── hstudy 수집 상태 ─────────────────────────────────
  const [hstudyLoading, setHstudyLoading] = useState(false);
  const [hstudyMeta, setHstudyMeta]       = useState(null);
  const [hstudyError, setHstudyError]     = useState(null);

  // ── neti 수집 상태 ───────────────────────────────────
  const [netiLoading, setNetiLoading] = useState(false);
  const [netiMeta, setNetiMeta]       = useState(null);
  const [netiError, setNetiError]     = useState(null);

  // ── 더보기 상태 ──────────────────────────────────────────
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE_UI);

  // ── 탭 상태 ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("course");

  // ── 이벤트 상태 ──────────────────────────────────────────
  const [events, setEvents]               = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError]     = useState(null);

  // ── 전체 목록 + 추천 ID 동시 불러오기 ──────────────────
  const handleLoad = useCallback(async () => {
    if (listLoading) return;
    setListLoading(true);
    setListError(null);
    setVisibleCount(PAGE_SIZE_UI);   // 더보기 초기화

    try {
      // 전체 목록(필수)과 추천 ID(선택)를 동시 요청
      const [coursesResult, recommendResult] = await Promise.allSettled([
        fetch("/api/all-courses"),
        fetch("/api/recommend-ids"),
      ]);

      // 전체 목록 처리 (실패 시 에러)
      if (coursesResult.status === "rejected") throw coursesResult.reason;
      if (!coursesResult.value.ok) {
        const err = await coursesResult.value.json().catch(() => ({}));
        throw new Error(err.detail ?? err.error ?? `HTTP ${coursesResult.value.status}`);
      }
      const data = await coursesResult.value.json();
      const rawCourses = data.courses ?? [];
      setCourses(markNewCourses(rawCourses));
      setMeta(data.meta ?? null);
      setRawJson(data);

      // 추천 ID 처리 (실패해도 목록 표시에 영향 없음 — 점수 0으로 폴백)
      if (
        recommendResult.status === "fulfilled" &&
        recommendResult.value.ok
      ) {
        const recData = await recommendResult.value.json();
        setRecommendIds(new Set((recData.ids ?? []).map(String)));
      }
    } catch (err) {
      setListError(err.message ?? "데이터를 가져오지 못했습니다.");
    } finally {
      setListLoading(false);
    }
  }, [listLoading]);

  // ── hstudy 목록 추가 수집 ───────────────────────────
  const handleLoadHstudy = useCallback(async () => {
    if (hstudyLoading) return;
    setHstudyLoading(true);
    setHstudyError(null);

    try {
      const res = await fetch("/api/hstudy-courses");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();

      // 기존 코스와 합산 (중복 ID 제거: hstudy ID는 s로 시작, 충돌 없음)
      setCourses((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const incoming = (data.courses ?? []).filter((c) => !existingIds.has(c.id));
        const marked = markNewCourses(incoming);
        const merged = [...prev, ...marked];
        return merged;
      });
      setHstudyMeta(data.meta ?? null);
    } catch (err) {
      setHstudyError(err.message ?? "hstudy 데이터를 가져오지 못했습니다.");
    } finally {
      setHstudyLoading(false);
    }
  }, [hstudyLoading]);

  // ── neti 목록 추가 수집 ─────────────────────────────
  const handleLoadNeti = useCallback(async () => {
    if (netiLoading) return;
    setNetiLoading(true);
    setNetiError(null);

    try {
      const res = await fetch("/api/neti-courses");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();

      setCourses((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const incoming = (data.courses ?? []).filter((c) => !existingIds.has(c.id));
        const marked = markNewCourses(incoming);
        const merged = [...prev, ...marked];
        return merged;
      });
      setNetiMeta(data.meta ?? null);
    } catch (err) {
      setNetiError(err.message ?? "neti 데이터를 가져오지 못했습니다.");
    } finally {
      setNetiLoading(false);
    }
  }, [netiLoading]);

  // ── 이벤트 목록 수집 ────────────────────────────────────
  const handleLoadEvents = useCallback(async () => {
    if (eventsLoading) return;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const [tvResult, hsResult, ybmResult] = await Promise.allSettled([
        fetch("/api/teacherville-events"),
        fetch("/api/hstudy-events"),
        fetch("/api/ybm-events"),
      ]);

      let tvEvents = [];
      if (tvResult.status === "fulfilled" && tvResult.value.ok) {
        const data = await tvResult.value.json();
        tvEvents = data.events ?? [];
      }

      let hsEvents = [];
      if (hsResult.status === "fulfilled" && hsResult.value.ok) {
        const data = await hsResult.value.json();
        hsEvents = data.events ?? [];
      }

      let ybmEvents = [];
      if (ybmResult.status === "fulfilled" && ybmResult.value.ok) {
        const data = await ybmResult.value.json();
        ybmEvents = data.events ?? [];
      }

      console.log("[events] tv:", tvEvents.length);
      console.log("[events] hs:", hsEvents.length);
      console.log("[events] ybm:", ybmEvents.length);

      const seen = new Set();
      const merged = [...tvEvents, ...hsEvents, ...ybmEvents].filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      console.log("[events] merged:", merged.length);

      if (merged.length === 0) {
        setEventsError("이벤트 데이터를 가져오지 못했습니다.");
        return;
      }

      merged.sort((a, b) => {
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return new Date(b.startDate) - new Date(a.startDate);
      });

      setEvents(merged);
    } catch (err) {
      setEventsError(err.message ?? "이벤트 데이터를 가져오지 못했습니다.");
    } finally {
      setEventsLoading(false);
    }
  }, [eventsLoading]);

  // ── 이벤트 탭 진입 시 자동 로드 ────────────────────────
  useEffect(() => {
    if (
      activeTab === "event" &&
      events.length === 0 &&
      !eventsLoading
    ) {
      handleLoadEvents();
    }
  }, [activeTab]);

  // ── 티처빌 + hstudy 동시 불러오기 ──────────────────────
  const handleLoadAll = useCallback(async () => {
    if (listLoading || hstudyLoading || netiLoading) return;
    setListLoading(true);
    setHstudyLoading(true);
    setNetiLoading(true);
    setListError(null);
    setHstudyError(null);
    setNetiError(null);
    setVisibleCount(PAGE_SIZE_UI);

    try {
      const [teachervilleRes, recommendRes, hstudyRes, netiRes] = await Promise.allSettled([
        fetch("/api/all-courses"),
        fetch("/api/recommend-ids"),
        fetch("/api/hstudy-courses"),
        fetch("/api/neti-courses"),
      ]);

      // 티처빌 처리 (실패해도 다른 소스는 표시)
      let teachervilleData = [];
      if (teachervilleRes.status === "rejected") {
        setListError(teachervilleRes.reason?.message ?? "데이터를 가져오지 못했습니다.");
      } else if (!teachervilleRes.value.ok) {
        const err = await teachervilleRes.value.json().catch(() => ({}));
        setListError(err.detail ?? err.error ?? `HTTP ${teachervilleRes.value.status}`);
      } else {
        const data = await teachervilleRes.value.json();
        teachervilleData = data.courses ?? [];
        setMeta(data.meta ?? null);
        setRawJson(data);
      }

      // 추천 ID 처리 (실패해도 목록 표시에 영향 없음 — 점수 0으로 폴백)
      if (recommendRes.status === "fulfilled" && recommendRes.value.ok) {
        const recData = await recommendRes.value.json();
        setRecommendIds(new Set((recData.ids ?? []).map(String)));
      }

      // hstudy 처리
      let hstudyData = [];
      if (hstudyRes.status === "rejected") {
        setHstudyError(hstudyRes.reason?.message ?? "hstudy 데이터를 가져오지 못했습니다.");
      } else if (!hstudyRes.value.ok) {
        const err = await hstudyRes.value.json().catch(() => ({}));
        setHstudyError(err.detail ?? err.error ?? `HTTP ${hstudyRes.value.status}`);
      } else {
        const data = await hstudyRes.value.json();
        hstudyData = data.courses ?? [];
        setHstudyMeta(data.meta ?? null);
      }

      // neti 처리
      let netiData = [];
      if (netiRes.status === "rejected") {
        setNetiError(netiRes.reason?.message ?? "neti 데이터를 가져오지 못했습니다.");
      } else if (!netiRes.value.ok) {
        const err = await netiRes.value.json().catch(() => ({}));
        setNetiError(err.detail ?? err.error ?? `HTTP ${netiRes.value.status}`);
      } else {
        const data = await netiRes.value.json();
        netiData = data.courses ?? [];
        setNetiMeta(data.meta ?? null);
      }

      // 병합 (중복 ID 제거)
      const anySuccess = teachervilleData.length > 0 || hstudyData.length > 0 || netiData.length > 0;
      if (!anySuccess) {
        // 모든 provider 실패 — 기존 courses 유지 (rate-limit 등 일시 오류 대응)
        return;
      }

      const rawMerged = [...(teachervilleData || [])];
      const mergedIds = new Set(rawMerged.map((c) => c.id));
      [...(hstudyData || []), ...(netiData || [])].forEach((c) => {
        if (!mergedIds.has(c.id)) { rawMerged.push(c); mergedIds.add(c.id); }
      });
      const marked = markNewCourses(rawMerged);
      setCourses(marked);
    } finally {
      setListLoading(false);
      setHstudyLoading(false);
      setNetiLoading(false);
    }
  }, [listLoading, hstudyLoading, netiLoading]);

  // ── 최초 진입 시 전체 연수 자동 로드 ───────────────────
  const didAutoLoadRef = useRef(false);

  useEffect(() => {
    if (didAutoLoadRef.current) return;
    didAutoLoadRef.current = true;
    handleLoadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 즐겨찾기 로드 (최초 1회) ────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("iceFavorites") || "[]");
      if (Array.isArray(saved)) setFavoriteIds(new Set(saved.map(String)));
    } catch {}
  }, []);

  // ── 즐겨찾기 토글 (상태 + localStorage 동시 갱신) ───────
  const toggleFavorite = useCallback((id) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("iceFavorites", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // ── 카드 클릭 → 단건 상세 (반복 호출 없음) ──────────────
  const handleCardClick = useCallback(async (course) => {
    if (detailLoading) return;

    if (activeId === course.id) {
      setActiveId(null);
      setDetail(null);
      return;
    }

    setActiveId(course.id);
    setDetail(null);
    setDetailError(null);

    if (course.provider === "neti") {
      setDetail(course);
      return;
    }

    setDetailLoading(true);
    try {
      const res = await fetch(`/api/course/${encodeURIComponent(course.id)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
      }
      const apiDetail = await res.json();
      setDetail({
        ...apiDetail,
        tutorName:   apiDetail.tutorName   || course.tutorName   || "",
        reviewCount: apiDetail.reviewCount ?? course.reviewCount ?? 0,
        wishCount:   apiDetail.wishCount   || course.wishCount   || 0,
        provider:    "teacherville",
      });
    } catch (err) {
      setDetailError(err.message ?? "상세 정보를 가져오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }, [detailLoading, activeId]);

  const handleDetailClose = () => {
    setActiveId(null);
    setDetail(null);
    setDetailError(null);
  };


  // ── 필터 초기화 (재사용용) ───────────────────────────────
  const handleResetFilters = useCallback(() => {
    setSearchText("");
    setFilterCategory("");
    setFilterCredit("");
    setFilterPriceIdx(0);
    setFilterType("");
    setFilterProvider("");
    setShowFavoritesOnly(false);
    setVisibleCount(PAGE_SIZE_UI);
  }, []);

  // ── 필터 옵션 (외부 요청 없음) ───────────────────────────
  const creditOptions = useMemo(() => {
    const s = new Set(courses.map((c) => c.credit).filter(Boolean));
    return [...s].sort();
  }, [courses]);

  const categoryOptions = useMemo(() => {
    const s = new Set(courses.map((c) => c.category).filter(Boolean));
    return [...s].sort();
  }, [courses]);

  // ── 검색 → 필터 → 점수 → 정렬 처리 (외부 요청 없음) ────
  const processedCourses = useMemo(() => {
    const q = searchText.toLowerCase();
    const priceTest = PRICE_FILTERS[filterPriceIdx].test;

    // 1. 검색
    const searched = courses.filter((c) =>
      !searchText || c.title.toLowerCase().includes(q)
    );

    // 2. 필터
    // 패키지 선택 시 티처빌(teacherville)만 표시 — hstudy/neti는 패키지 없음
    const effectiveProvider =
      filterType === "패키지" ? "teacherville" : filterProvider;

    const filtered = searched.filter((c) =>
      (!filterCredit        || c.credit       === filterCredit)        &&
      (!filterCategory      || c.category     === filterCategory)      &&
      (!filterType          || c.trainingType === filterType)          &&
      (!effectiveProvider   || c.provider     === effectiveProvider)   &&
      (!showFavoritesOnly   || favoriteIds.has(String(c.id)))          &&
      priceTest(c.price)
    );

    // 3. 랭킹 점수 부여 (추천순 정렬 + 배지에 사용)
    //    isRecommended: +100 / reviewCount * 3 / wishCount * 1 / 패키지: +10
    const withScore = filtered.map((c) => {
      const isRecommended = recommendIds.has(String(c.id));
      const score =
        (isRecommended ? 100 : 0) +
        (c.reviewCount ?? 0) * 3 +
        (c.wishCount   ?? 0) +
        (c.trainingType === "패키지" ? 10 : 0);
      return { ...c, isRecommended, score };
    });

    // 4. 정렬
    if (sortKey === "popular") {
      // 인기순: reviewCount * 2 + wishCount (기존 방식 유지)
      return [...withScore].sort((a, b) => {
        const aScore = (a.reviewCount ?? 0) * 2 + (a.wishCount ?? 0);
        const bScore = (b.reviewCount ?? 0) * 2 + (b.wishCount ?? 0);
        return bScore - aScore;
      });
    }
    if (sortKey === "recommend") {
      // 추천순: 랭킹 점수 내림차순
      return [...withScore].sort((a, b) => b.score - a.score);
    }
    // 최신순: sortDate 내림차순 (없는 항목은 뒤로)
    return [...withScore].sort((a, b) => {
      const aTime = a.sortDate ? new Date(a.sortDate).getTime() : 0;
      const bTime = b.sortDate ? new Date(b.sortDate).getTime() : 0;
      if (aTime && bTime) return bTime - aTime;
      if (aTime && !bTime) return -1;
      if (!aTime && bTime) return 1;
      return 0;
    });
  }, [courses, searchText, filterCredit, filterCategory, filterPriceIdx, filterType, filterProvider, showFavoritesOnly, favoriteIds, sortKey, recommendIds]);

  // ── 더보기로 슬라이스 ────────────────────────────────────
  const visibleCourses = useMemo(
    () => processedCourses.slice(0, visibleCount),
    [processedCourses, visibleCount]
  );

  const hasMore = visibleCount < processedCourses.length;

  // ── 이벤트 즐겨찾기 필터 ────────────────────────────────
  const visibleEvents = useMemo(
    () => (showFavoritesOnly ? events.filter((e) => favoriteIds.has(String(e.id))) : events),
    [events, showFavoritesOnly, favoriteIds]
  );

  const isPanelOpen = activeId !== null || detailLoading;

  return (
    <div className={`page-wrap${isPanelOpen ? " panel-open" : ""}`}>

      {/* ── 헤더 ── */}
      <header className="page-header">
        <h1 className="page-title">연수·이벤트 통합 모니터링</h1>
        <p className="page-desc">
          비로그인 공개 목록 API 페이지네이션 수집 &nbsp;·&nbsp;
          totalCount는 API 응답 기준 동적 계산 &nbsp;·&nbsp;
          검색/필터/정렬은 클라이언트 처리
        </p>

        <div className="control-row">
          <button
            className="btn-load"
            onClick={handleLoadAll}
            disabled={listLoading || hstudyLoading || netiLoading}
          >
            {listLoading || hstudyLoading || netiLoading ? "수집 중..." : "최신 불러오기"}
          </button>
          <a
            className="btn-guide"
            href="https://hickory-dragonfly-831.notion.site/358ce6e98c8a80b59b4fca00fef2b829#358ce6e98c8a8058ada7c56367e2916f"
            target="_blank"
            rel="noopener noreferrer"
          >
            ICE Planner 사용 가이드
          </a>
          <a
            className="btn-guide"
            href="https://docs.google.com/spreadsheets/d/1Zne9do9bUhmjAmeMLmwef_31LASO9W-ciY69chAmz64/edit?hl=ko&gid=0#gid=0"
            target="_blank"
            rel="noopener noreferrer"
          >
            피드백 보내기
          </a>
        </div>

        {/* provider 별 수집 현황 */}
        <div className="provider-badge-group">
          {(() => {
            const tvEvt  = events.filter((e) => e.provider === "teacherville").length;
            const hsEvt  = events.filter((e) => e.provider === "hstudy").length;
            const ybmEvt = events.filter((e) => e.provider === "ybm").length;
            const PROVIDERS = [
              {
                key:    "teacherville",
                label:  "티처빌",
                course: { supported: true,  count: meta?.totalCount,          loading: listLoading },
                event:  { supported: true,  count: tvEvt,                     loading: eventsLoading },
              },
              {
                key:    "hstudy",
                label:  "한국교원연수원",
                course: { supported: true,  count: hstudyMeta?.fetchedCount,  loading: hstudyLoading },
                event:  { supported: true,  count: hsEvt,                     loading: eventsLoading },
              },
              {
                key:    "neti",
                label:  "중앙교육연수원",
                course: { supported: true,  count: netiMeta?.fetchedCount,    loading: netiLoading },
                event:  { supported: false },
              },
              {
                key:    "ybm",
                label:  "YBM",
                course: { supported: false },
                event:  { supported: true,  count: ybmEvt,                    loading: eventsLoading },
              },
            ];
            return (
              <>
                {PROVIDERS.map(({ key, label, course, event }) => (
                  <div key={key} className={`provider-summary-card provider-summary-card--${key}`}>
                    <p className="provider-summary-title">{label}</p>
                    <ul className="provider-summary-list">
                      <li className={`provider-summary-item ${course.supported ? "is-supported" : "is-disabled"}`}>
                        <span className="provider-summary-label">연수</span>
                        <span className="provider-summary-count">
                          {course.supported
                            ? course.loading
                              ? "조회 중…"
                              : `지원 ${course.count?.toLocaleString() ?? "-"}개`
                            : "미지원"}
                        </span>
                      </li>
                      <li className={`provider-summary-item ${event.supported ? "is-supported" : "is-disabled"}`}>
                        <span className="provider-summary-label">이벤트</span>
                        <span className="provider-summary-count">
                          {event.supported
                            ? event.loading
                              ? "조회 중…"
                              : `지원 ${event.count ?? 0}개`
                            : "미지원"}
                        </span>
                      </li>
                    </ul>
                  </div>
                ))}
                {courses.length > 0 && !listLoading && !hstudyLoading && !netiLoading && (
                  <span className="result-count">
                    {processedCourses.length.toLocaleString()} / {courses.length.toLocaleString()}개 표시
                  </span>
                )}
              </>
            );
          })()}
        </div>

        {/* 수집 중 로딩 메시지 */}
        {(listLoading || hstudyLoading || netiLoading) && (
          <div className="loading-message">
            <span className="loading-spinner">⏳</span>
            <span>
              {netiLoading
                ? "중앙교육연수원 데이터를 수집 중입니다..."
                : hstudyLoading
                ? "한국교원연수원 데이터를 수집 중입니다..."
                : "연수 데이터를 수집 중입니다..."}
            </span>
            <span className="loading-sub">약 5~15초 소요됩니다</span>
          </div>
        )}

        {listError   && <div className="error-banner">⚠️ {listError}</div>}
        {hstudyError && <div className="error-banner">⚠️ [hstudy] {hstudyError}</div>}
        {netiError   && <div className="error-banner">⚠️ [neti] {netiError}</div>}

        <CacheStatusPanel meta={meta} />
      </header>

      <div className="content-area">
        <div className="list-area">

          {/* ── 메인 탭 ── */}
          <div className="main-tabs">
            <button
              className={`main-tab${activeTab === "course" ? " active" : ""}`}
              onClick={() => setActiveTab("course")}
            >
              연수 강의
            </button>
            <button
              className={`main-tab${activeTab === "event" ? " active" : ""}`}
              onClick={() => setActiveTab("event")}
            >
              이벤트
            </button>
          </div>

          {activeTab === "event" && (
            <>
              {events.length > 0 && (
                <div className="favorites-bar">
                  <button
                    type="button"
                    className={`btn-fav-toggle${showFavoritesOnly ? " active" : ""}`}
                    onClick={() => setShowFavoritesOnly((v) => !v)}
                  >
                    ★ 즐겨찾기만
                  </button>
                </div>
              )}
              <EventList
                events={visibleEvents}
                loading={eventsLoading}
                error={eventsError}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
              />
            </>
          )}

          {activeTab === "course" && (
            <>
          {/* ── 정렬 탭 ── */}
          {courses.length > 0 && (
            <div className="sort-tabs">
              {SORT_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  className={`sort-tab${sortKey === key ? " active" : ""}`}
                  onClick={() => { setSortKey(key); setVisibleCount(PAGE_SIZE_UI); }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ── 통합 필터 박스 ── */}
          {courses.length > 0 && (
            <div className="filter-box">
              <input
                type="text"
                className="filter-input"
                placeholder="강의명 검색..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setVisibleCount(PAGE_SIZE_UI); }}
              />

              <div className="filter-box-row">
                <div className="type-filter-row filter-box-providers">
                  {PROVIDER_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      className={`type-filter-btn provider-filter-btn${filterProvider === f.value ? " active" : ""}`}
                      onClick={() => { setFilterProvider(f.value); setVisibleCount(PAGE_SIZE_UI); }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="filter-selects">
                  <select
                    className="filter-select"
                    value={filterCategory}
                    onChange={(e) => { setFilterCategory(e.target.value); setVisibleCount(PAGE_SIZE_UI); }}
                  >
                    <option value="">전체 카테고리</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    className="filter-select"
                    value={filterCredit}
                    onChange={(e) => { setFilterCredit(e.target.value); setVisibleCount(PAGE_SIZE_UI); }}
                  >
                    <option value="">전체 학점</option>
                    {creditOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    className="filter-select"
                    value={filterPriceIdx}
                    onChange={(e) => { setFilterPriceIdx(Number(e.target.value)); setVisibleCount(PAGE_SIZE_UI); }}
                  >
                    {PRICE_FILTERS.map((f, i) => (
                      <option key={i} value={i}>{f.label}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className={`btn-fav-toggle${showFavoritesOnly ? " active" : ""}`}
                    onClick={() => { setShowFavoritesOnly((v) => !v); setVisibleCount(PAGE_SIZE_UI); }}
                  >
                    ★ 즐겨찾기만
                  </button>

                  {(searchText || filterCategory || filterCredit || filterPriceIdx > 0 || filterProvider || showFavoritesOnly) && (
                    <button
                      className="btn-reset"
                      onClick={handleResetFilters}
                    >
                      초기화
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <CourseList
            visibleCourses={visibleCourses}
            activeId={activeId}
            onCardClick={handleCardClick}
            courses={courses}
            processedCourses={processedCourses}
            hasMore={hasMore}
            visibleCount={visibleCount}
            onLoadMore={() => setVisibleCount((n) => n + PAGE_SIZE_UI)}
            isLoading={listLoading || hstudyLoading || netiLoading}
            onResetFilters={handleResetFilters}
            query={searchText}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
          />

          {/* ── 원본 JSON ── */}
          {rawJson && (
            <div className="raw-wrap">
              <details>
                <summary className="raw-summary">목록 원본 JSON 보기</summary>
                <pre className="raw-json">{JSON.stringify(rawJson, null, 2)}</pre>
              </details>
            </div>
          )}
            </>
          )}
        </div>

        {/* ── 우측 상세 패널 ── */}
        <DetailPanel
          detail={detail}
          isLoading={detailLoading}
          error={detailError}
          onClose={handleDetailClose}
        />
      </div>

    </div>
  );
}
