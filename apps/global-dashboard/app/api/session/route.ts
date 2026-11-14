import { NextRequest, NextResponse } from "next/server";
import { failure, assertOrigin, ADMIN_COOKIE } from "../../../lib/api";
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    const data = await req.json();
    if (typeof data.admin !== "boolean")
      throw new Error("admin must be boolean");
    const res = NextResponse.json({ admin: data.admin });
    res.cookies.set(ADMIN_COOKIE, String(data.admin), {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    return res;
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: NextRequest) {
  return NextResponse.json({
    admin: req.cookies.get(ADMIN_COOKIE)?.value === "true",
  });
}
