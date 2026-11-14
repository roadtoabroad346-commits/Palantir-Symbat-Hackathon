import { NextRequest, NextResponse } from "next/server";
// Legacy demo endpoints are unavailable in a normal production deployment.
// Explicit local demonstrations of production builds set DEMO_PRODUCTION=1.
export function proxy(req: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEMO_PRODUCTION !== "1" &&
    !req.nextUrl.pathname.startsWith("/api/v2/") &&
    req.nextUrl.pathname !== "/v2"
  ) {
    if (req.nextUrl.pathname.startsWith("/api/"))
      return NextResponse.json(
        {
          error: {
            code: "demo_disabled",
            message: "Demo cookies are not production authentication",
          },
        },
        { status: 503 },
      );
    return NextResponse.redirect(new URL("/v2", req.url));
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
