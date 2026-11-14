import { NextRequest, NextResponse } from "next/server";
import {
  source,
  failure,
  assertOrigin,
  ADMIN_COOKIE,
} from "../../../../lib/api";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(req);
    const { id } = await params;
    const data = await req.json();
    return NextResponse.json(
      await source.updateFeedback(
        id,
        data.action,
        data.status,
        req.cookies.get(ADMIN_COOKIE)?.value === "true",
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
