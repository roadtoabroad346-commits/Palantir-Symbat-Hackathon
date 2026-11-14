import { hubHandler } from "@startify/shared/v2/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = hubHandler("global-dashboard");
export const POST = GET;
