import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { MockDataSource } from "./datasource";
export const source = new MockDataSource(db);
export const ADMIN_COOKIE = "global-impact-admin";
export function failure(error: unknown) {
  console.error(
    "Global Impact request failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Request failed / Запрос не выполнен",
    },
    { status: 400 },
  );
}
export function assertOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    throw new Error("Invalid request origin / Недопустимый источник запроса");
}
