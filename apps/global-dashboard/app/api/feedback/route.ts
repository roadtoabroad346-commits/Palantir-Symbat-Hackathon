import { NextRequest, NextResponse } from "next/server";
import { source, failure, assertOrigin } from "../../../lib/api";
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    return NextResponse.json(await source.addFeedback(await req.json()));
  } catch (e) {
    return failure(e);
  }
}
