import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirects visitors without a session hint to /login before rendering private areas.
 * This is only a UX shortcut — every API call is still authorised by the backend.
 */
const PRIVATE = ["/platform", "/admin", "/me", "/account"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PRIVATE.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!req.cookies.get("bdc_session")) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/platform/:path*", "/admin/:path*", "/me/:path*", "/account/:path*"],
};
