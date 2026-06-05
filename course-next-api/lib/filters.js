export const PAGE_SIZE_UI = 50;

export const PRICE_FILTERS = [
  { label: "전체",        test: () => true },
  { label: "5만원 이하",  test: (p) => p <= 50_000 },
  { label: "5–10만원",    test: (p) => p > 50_000 && p <= 100_000 },
  { label: "10만원 초과", test: (p) => p > 100_000 },
  // 무료는 인덱스 안정성(URL 하위호환) 위해 끝에 추가
  { label: "무료",        test: (p) => p === 0 },
];

export const TYPE_FILTERS = [
  { label: "전체",     value: "" },
  { label: "일반연수", value: "일반연수" },
  { label: "패키지",   value: "패키지" },
];

export const PROVIDER_FILTERS = [
  { label: "전체",          value: "" },
  { label: "티처빌",        value: "teacherville" },
  { label: "한국교원연수원", value: "hstudy" },
  { label: "중앙교육연수원", value: "neti" },
];

export const SORT_TABS = [
  { key: "latest",    label: "최신순" },
  { key: "popular",   label: "인기순" },
  { key: "recommend", label: "추천순" },
];
