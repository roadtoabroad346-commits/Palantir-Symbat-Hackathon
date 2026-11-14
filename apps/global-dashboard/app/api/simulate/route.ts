import { NextRequest, NextResponse } from "next/server";
import { source, failure, assertOrigin } from "../../../lib/api";
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    const body = await req.json();
    return NextResponse.json(await source.simulate(body.month));
  } catch (e) {
    return failure(e);
  }
}
