# ice-planner-project

교원 연수 데이터 수집 시스템.  
티처빌(JSON API)·한국교원연수원(HTML+AJAX)·중앙교육연수원(HTML)의 공개 연수 목록을 수집하고  
브라우저에서 검색·필터·정렬하는 내부 테스트용 프로젝트.

> ⚠️ 비로그인 공개 데이터만 사용합니다. 운영 전 각 사이트의 이용약관 및 robots.txt를 반드시 확인하세요.

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
- 데이터 수집 (teacherville / hstudy / neti)
- 캐시 관리
- API Routes 제공

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
npm run dev   # 개발 서버
npm run build # 빌드
npm start     # 프로덕션
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

| 경로 | 설명 |
|---|---|
| `/api/all-courses` | 티처빌 전체 목록 |
| `/api/hstudy-courses` | 한국교원연수원 목록 |
| `/api/neti-courses` | 중앙교육연수원 목록 |
| `/api/course/[id]` | 티처빌 단건 상세 |
| `/api/recommend-ids` | 추천 강의 ID 목록 |

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

---

## Provider별 기능 차이

| 기능 | 티처빌 | 한국교원연수원 | 중앙교육연수원 |
|---|---|---|---|
| 상세 API | 가능 | 불가 | 불가 |
| 외부 상세 링크 | 가능 | 가능 | 가능 |
| 패키지 연수 | 있음 | 없음 | 없음 |
| 리뷰/찜 수 | 있음 | 없음 | 없음 |

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
| 추천순 | `isRecommended × 100 + reviewCount × 3 + wishCount` |

---

## 주의사항

- 비로그인 공개 데이터만 수집
- 약관 및 robots.txt 확인 필수
- Vercel 배포 시 서버 메모리 캐시 미유지 가능 (캐시 MISS 시 외부 요청 증가)
