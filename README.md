# ice-planner-project

교원 연수·이벤트 통합 모니터링 시스템.  
티처빌(JSON API)·한국교원연수원(HTML+AJAX)·중앙교육연수원(HTML)·YBM의 공개 연수·이벤트 목록을 수집하고  
브라우저에서 검색·필터·정렬하는 내부 테스트용 프로젝트.

> ⚠️ 비로그인 공개 데이터만 사용합니다. 운영 전 각 사이트의 이용약관 및 robots.txt를 반드시 확인하세요.

## 수집 대상

| 기관 | 연수 | 이벤트 |
|---|:---:|:---:|
| 티처빌 (teacherville) | ✅ | ✅ |
| 한국교원연수원 (hstudy) | ✅ | ✅ |
| 중앙교육연수원 (neti) | ✅ | — |
| YBM (ybm) | — | ✅ |

---

## 프로젝트 구조

```
ice-planner-project/
├── course-api/          # Express.js REST API 서버 (보조)
└── course-next-api/     # Next.js 15 App Router (메인 앱)
```

---

## 서브 프로젝트 역할

### course-api (Express.js)

외부 API(티처빌)를 래핑하는 보조 서버.

- 외부 API 호출 전용
- 단건 상세 및 목록 응답
- 테스트/분리용 서버

### course-next-api (Next.js 15 + React 19)

메인 애플리케이션.

- UI 렌더링
- 데이터 수집 (teacherville / hstudy / neti / ybm)
- 캐시 관리
- API Routes 제공

디렉터리 구조:

```
course-next-api/
├── app/
│   ├── page.js          # 컨트롤러 (상태·필터·정렬, UI 마크업 금지)
│   ├── globals.css
│   └── api/             # App Router API Routes (연수)
├── pages/api/           # 레거시 API Routes (이벤트)
├── components/          # UI 컴포넌트
└── lib/                 # 수집·캐시·필터 로직
```

---

## 실행 방법

### course-api

```bash
cd course-api
npm run dev   # 개발 서버 (포트 3000)
npm start     # 프로덕션
```

### course-next-api

```bash
cd course-next-api
npm run dev            # 개발 서버
npm run build          # 빌드
npm start              # 프로덕션
npm start -- -p 3010   # 포트 지정 실행
```

환경변수는 `course-next-api/.env.local`에 설정합니다.

---

## 환경변수

| 변수명 | 설명 |
|---|---|
| `TEACHERVILLE_BASE_URL` | 티처빌 베이스 URL |
| `LIST_CACHE_TTL_MS` | 목록 캐시 유지 시간 (ms) |
| `DETAIL_CACHE_TTL_MS` | 상세 캐시 유지 시간 (ms) |
| `REQUEST_DELAY_MS` | 외부 요청 간격 (ms) |
| `PAGE_SIZE` | 페이지당 수집 수 |
| `MAX_PAGES` | 최대 수집 페이지 수 |
| `MAX_COURSE_COUNT` | 최대 수집 강의 수 |
| `MAX_EXTERNAL_REQUESTS` | 최대 외부 요청 횟수 |

---

## API Routes (course-next-api)

### 연수 — App Router (`app/api/`)

| 경로 | 설명 |
|---|---|
| `/api/all-courses` | 티처빌 전체 목록 |
| `/api/ai-courses` | 티처빌 AI 연수 목록 |
| `/api/hstudy-courses` | 한국교원연수원 목록 |
| `/api/neti-courses` | 중앙교육연수원 목록 |
| `/api/course/[goodsCode]` | 티처빌 단건 상세 |
| `/api/recommend-ids` | 추천 강의 ID 목록 |

### 이벤트 — 레거시 Pages Router (`pages/api/`)

| 경로 | 설명 |
|---|---|
| `/api/teacherville-events` | 티처빌 이벤트 |
| `/api/hstudy-events` | 한국교원연수원 이벤트 |
| `/api/ybm-events` | YBM 이벤트 |

> App Router 마이그레이션 전 구버전입니다. `app/api/` 내 `_*_backup/` 디렉터리는 비활성 백업본입니다.

---

## 컴포넌트 (`components/`)

| 파일 | 역할 |
|---|---|
| `CourseCard.jsx` | 연수 카드 · 검색어 하이라이트 · 즐겨찾기 별표 · 무료 배지 |
| `CourseList.jsx` | 연수 목록 렌더링 |
| `CourseCardSkeleton.jsx` | 연수 카드 로딩 스켈레톤 |
| `EventCard.jsx` | 이벤트 카드 · 즐겨찾기 별표 · 마감 임박 배지 |
| `EventList.jsx` | 이벤트 목록 렌더링 |
| `EventCardSkeleton.jsx` | 이벤트 카드 로딩 스켈레톤 |
| `DetailPanel.jsx` | 우측 연수 상세 패널 |
| `EmptyResult.jsx` | 검색·필터 0건 빈 상태 UI |
| `CacheStatusPanel.jsx` | 캐시 상태(meta) 표시 패널 |

> UI 마크업은 반드시 `components/`에 둡니다. `app/page.js`는 컨트롤러 역할만 합니다.

---

## 주요 기능

### 검색·필터·정렬 (모두 클라이언트 처리, API 재호출 없음)

- **통합 검색** — 강의명·강사명·카테고리 멀티필드 매칭, 제목에 검색어 하이라이트
- **최근 검색어** — `localStorage`(`iceRecentSearches`) 최신 8개, 입력창 포커스 시 드롭다운
- **필터** — provider(다중 선택) · 카테고리 · 학점 · 가격대(무료 포함) · 유형(일반연수/패키지)
- **provider 카드 필터** — 헤더 기관 카드 클릭으로 해당 기관 연수만 보기 (토글)
- **정렬** — 최신순 / 인기순 / 추천순
- **더보기** — 페이지 단위 추가 렌더링

### 개인화 (브라우저 로컬 저장)

- **즐겨찾기** — 카드 별표(★) → `localStorage`(`iceFavorites`, ID 배열). 연수·이벤트 공용, "★ 즐겨찾기만" 토글로 필터
- **URL 쿼리 동기화** — 화면 상태를 주소에 반영해 새로고침 유지 + 링크 공유로 동일 화면 재현
  - 키: `q · provider · sort · category · credit · price · type · tab · fav`
  - 최초 1회 `URLSearchParams` 복원, 상태 변경 시 `window.history.replaceState`

### 표시 보조

- **NEW 배지** — 신규 등록 연수 표시 (`markNewCourses`)
- **무료 배지** — `price === 0`
- **마감 임박 배지** — 이벤트 "오늘 마감" / "D-N", 3일 이내는 강조 표시
- **로딩 스켈레톤 / 빈 결과 UI** — 첫 수집 대기·0건 상태 안내

---

## 핵심 아키텍처

- 서버(API Route) → 외부 데이터 수집 → 서버 메모리 캐시
- 클라이언트 → 검색 / 필터 / 정렬 처리 (API 재호출 없음)
- 외부 요청 최소화 원칙: delay 1000ms, 병렬 요청 금지, 최대 20회

---

## 데이터 수집 방식

| Provider | 방식 | 비고 |
|---|---|---|
| 티처빌 | JSON API (POST) | totalCount 기반 페이지 계산 |
| 한국교원연수원 | HTML + cheerio | sub2.asp → sub2_ajax.asp, loopCnt 반복 |
| 중앙교육연수원 | HTML + cheerio | pageIndex 기반 페이지네이션 |
| YBM | HTML + cheerio | 이벤트 전용 |

### 데이터 통합 규칙

- provider로 구분 후 normalize → 합산 (중복 ID 제거)
- ID 접두사: 티처빌 = 원본 그대로 / hstudy = `s` / neti = `n`

---

## Provider별 기능 차이

| 기능 | 티처빌 | 한국교원연수원 | 중앙교육연수원 | YBM |
|---|---|---|---|---|
| 연수 목록 | 가능 | 가능 | 가능 | 미지원 |
| 이벤트 목록 | 가능 | 가능 | 미지원 | 가능 |
| 상세 API | 가능 | 불가 | 불가 | — |
| 외부 상세 링크 | 가능 | 가능 | 가능 | 가능 |
| 패키지 연수 | 있음 | 없음 | 없음 | — |
| 리뷰/찜 수 | 있음 | 없음 | 없음 | — |

> 없는 데이터는 생성하지 않으며, provider별 기능 차이를 UI에 그대로 반영합니다.  
> 상세는 티처빌만 내부 API를 사용하고, 나머지는 외부 페이지로 이동합니다 (`detailUrl` 우선).

---

## 캐시 정책

| 대상 | 유지 시간 |
|---|---|
| 목록 | 24시간 |
| 상세 | 1시간 |
| 추천 | 12시간 |

- in-flight Promise lock으로 동일 요청 중복 실행 방지

---

## 정렬 기준

| 정렬 | 기준 |
|---|---|
| 최신순 | `sortDate` 내림차순 (없으면 뒤로) |
| 인기순 | `reviewCount × 2 + wishCount` |
| 추천순 | `isRecommended × 100 + reviewCount × 3 + wishCount + (패키지 ? 10 : 0)` |

---

## 배포

- Vercel (서울 리전 `icn1`, 설정은 `course-next-api/vercel.json`)

---

## 주의사항

- 비로그인 공개 데이터만 수집
- 약관 및 robots.txt 확인 필수
- Vercel 배포 시 서버 메모리 캐시 미유지 가능 (캐시 MISS 시 외부 요청 증가)

### 금지 사항

- 상세 반복 호출 · 외부 API 병렬 요청 · `totalCount` 하드코딩
- 필터 시 API 호출 · 자동 수집(cron) · DB/파일 저장
- 상세 HTML 크롤링 · 로그인 데이터 수집
