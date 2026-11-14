import { PrismaClient } from "../generated/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
const scope = globalThis as unknown as { globalDashboardDb?: PrismaClient };
const root = process.cwd().endsWith("global-dashboard")
  ? process.cwd()
  : process.cwd() + "/apps/global-dashboard";
export const db =
  scope.globalDashboardDb ??
  new PrismaClient({
    adapter: new PrismaLibSQL({ url: `file:${root}/prisma/demo.db` }),
  });
if (process.env.NODE_ENV !== "production") scope.globalDashboardDb = db;
