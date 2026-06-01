# 브리프 규칙
- 요청이 불완전하면 작업 전에 반드시 질문한다
- 모호한 부분은 추측하지 말고 확인한다
- 질문은 한 번에 몰아서 (여러 번 왔다갔다 금지)

---

# ice-planner-project

교원 연수 데이터 수집 시스템.  
티처빌(JSON API)·한국교원연수원(HTML+AJAX)·중앙교육연수원(HTML)의 공개 연수 목록을 수집하고  
브라우저에서 검색·필터·정렬하는 내부 테스트용 프로젝트.

---

## 프로젝트 구조

ice-planner-project/
├── course-api/          # Express.js REST API 서버 (보조)
└── course-next-api/     # Next.js 15 App Router (메인 앱)

---

## 서브 프로젝트 역할

### course-api (Express.js)

외부 API(티처빌)를 래핑하는 보조 서버.

- 외부 API 호출 전용
- 단건 상세 및 목록 응답
- 테스트/분리용 서버

⚠️ 신규 기능은 여기서 구현하지 않는다

---

### course-next-api (Next.js 15.5.15 + React 19)

메인 애플리케이션.

- UI 렌더링
- 데이터 수집 (teacherville / hstudy / neti)
- 캐시 관리
- API Routes 제공

✔ 모든 기능 개발은 기본적으로 여기에서 수행

---

## 실행 정보

### course-api
- 진입점: server.js
- 포트: 3000

실행:
npm run dev
npm start

---

### course-next-api
실행:
npm run dev

환경변수:
.env.local

---

## 핵심 아키텍처

- 서버(API Route) → 외부 데이터 수집 → 캐시 저장
- 클라이언트 → 검색 / 필터 / 정렬 처리
- API 재호출 없음
- 외부 요청 최소화가 최우선 원칙

---

## UI 구조 규칙 (중요)

- app/page.js = 컨트롤러
- UI는 반드시 components로 분리

### components/ (course-next-api/components/)

| 파일 | 역할 |
|------|------|
| `CourseCard.jsx` | 연수 카드 UI |
| `CourseList.jsx` | 연수 목록 렌더링 |
| `EventCard.jsx` | 이벤트 카드 UI |
| `EventList.jsx` | 이벤트 목록 렌더링 |

금지:
- page.js에 UI 마크업 작성 금지
- page.js에서 스타일 수정 금지

---

## 라이브러리 (course-next-api/lib/)

| 파일 | 역할 |
|------|------|
| `cache.js` | 서버 공용 메모리 캐시 + In-Flight Lock |
| `rate-limit.js` | IP 기반 인메모리 요청 제한 |
| `teacherville-all-courses.js` | 티처빌 전체 목록 수집 |
| `teacherville-ai-courses.js` | 티처빌 AI 연수 목록 수집 |
| `teacherville-course-detail.js` | 티처빌 단건 상세 조회 |
| `teacherville-recommend.js` | 티처빌 AI 추천 ID 수집 |
| `teacherville-events.js` | 티처빌 이벤트 수집 |
| `hstudy-courses.js` | 한국교원연수원 목록 수집 |
| `hstudy-events.js` | 한국교원연수원 이벤트 수집 |
| `neti-courses.js` | 중앙교육연수원 목록 수집 |
| `ybm-events.js` | YBM 이벤트 수집 |

---

## API Routes (Next.js App Router — course-next-api/app/api/)

- /api/all-courses
- /api/ai-courses
- /api/recommend-ids
- /api/course/[goodsCode]
- /api/hstudy-courses
- /api/neti-courses

### 레거시 라우트 (pages/api/ — 건드리지 않음)

- pages/api/hstudy-events.js
- pages/api/teacherville-events.js
- pages/api/ybm-events.js

> App Router 마이그레이션 전 구버전. 삭제 전 확인 필요.

### 백업 라우트 (app/api/ 내 비활성)

- _hstudy-events_backup/
- _teacherville-events_backup/
- _ybm-events_backup/

---

## 데이터 수집 규칙

### 티처빌
- JSON API 사용
- totalCount 기반 페이지 계산

### 한국교원연수원
- HTML + cheerio
- sub2.asp → sub2_ajax.asp
- loopCnt 반복 구조

### 중앙교육연수원
- HTML 서버 렌더링
- pageIndex 기반 페이지네이션

---

## provider별 기능 차이

| 기능 | teacherville | hstudy | neti |
|------|-------------|--------|------|
| 상세 API | 가능 | 불가 | 불가 |
| 외부 상세 링크 | 가능 | 가능 | 가능 |
| 패키지 | 있음 | 없음 | 없음 |
| 리뷰/찜 | 있음 | 없음 | 없음 |

규칙:
- 없는 데이터는 생성하지 않는다
- provider별 기능 차이를 UI에 반영한다

---

## 상세 페이지 처리 규칙

- teacherville → 내부 API
- hstudy / neti → 외부 페이지 이동

URL 규칙:
- detailUrl이 있으면 항상 우선 사용
- URL 하드코딩 금지

금지:
- 상세 HTML 크롤링
- 로그인 데이터 수집

---

## 필터 설계 원칙

- 실제 존재하는 데이터만 사용

규칙:
- provider 전용 필터는 확장하지 않는다
- 결과 0개는 정상

---

## 캐시 정책

목록: 24시간  
상세: 1시간  
추천: 12시간  

- in-flight Promise lock 사용
- 동일 요청 → 1회 실행

---

## 외부 요청 정책 (절대 준수)

- delay: 1000ms
- 병렬 요청 금지
- 최대 요청: 20회

---

## 클라이언트 처리 규칙

- 검색 / 필터 / 정렬 → 클라이언트
- API 재호출 금지
- useMemo 유지

---

## 정렬 규칙

최신순: API 순서  
인기순: reviewCount * 2 + wishCount  
추천순: isRecommended * 100 + reviewCount * 3 + wishCount  

---

## 데이터 통합 규칙

- provider로 구분
- normalize 후 합산

ID 규칙:
- teacherville: 그대로
- hstudy: s prefix
- neti: n prefix

---

## 배포

- Vercel (서울 리전: icn1)
- vercel.json: course-next-api/vercel.json에 리전 설정 있음

### 주의사항

- 서버 메모리 캐시 유지 안될 수 있음 (Vercel 서버리스)
- 캐시 MISS 시 외부 요청 증가 가능

---

## 절대 금지 사항

- 상세 반복 호출
- 외부 API 병렬 요청
- totalCount 하드코딩
- 필터 시 API 호출
- 자동 수집 (cron)
- DB 저장
- 파일 저장
- API 구조 변경

---

## 작업 우선 원칙

1. 구조 유지
2. 외부 요청 증가 금지
3. 캐시 유지
4. 데이터 최소 수집
5. 클라이언트 처리 우선

---

## 환경변수

TEACHERVILLE_BASE_URL  
LIST_CACHE_TTL_MS  
DETAIL_CACHE_TTL_MS  
REQUEST_DELAY_MS  
PAGE_SIZE  
MAX_PAGES  
MAX_COURSE_COUNT  
MAX_EXTERNAL_REQUESTS  

---

## 허용 명령어

node -e 항상 허용

---

## 주의사항

- 비로그인 데이터만 사용
- 약관 및 robots.txt 확인 필수
- 외부 서버 부하 최소화 유지

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
