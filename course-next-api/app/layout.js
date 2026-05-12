import "./globals.css";

export const metadata = {
  title: "연수·이벤트 통합 모니터링",
  description: "aiCourseList.edu 페이지 기준 목록 데이터를 조회합니다.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
