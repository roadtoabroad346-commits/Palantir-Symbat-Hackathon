import { NextResponse } from "next/server";
import { source, failure } from "../../../lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await source.read());
  } catch (e) {
    return failure(e);
  }
}
