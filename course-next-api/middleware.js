import { NextResponse } from "next/server";

const SKIP_PREFIXES = ["/_next", "/favicon.ico"];
const SKIP_EXTS    = /\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|woff|woff2|ttf|map)$/i;

export function middleware(req) {
  const { pathname } = req.nextUrl;

  const skip =
    SKIP_PREFIXES.some((p) => pathname.startsWith(p)) ||
    SKIP_EXTS.test(pathname);

  if (!skip) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "-";

    const ua   = req.headers.get("user-agent") ?? "-";
    const time = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    console.log(`[ACCESS] ${time} | ${ip} | ${req.method} ${pathname} | ${ua}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
