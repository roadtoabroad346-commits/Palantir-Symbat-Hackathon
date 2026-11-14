import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "@prisma/adapter-libsql",
    "@libsql/client",
    "libsql",
  ],
  transpilePackages: ["@startify/shared"],
  experimental: { cpus: 2 },
  devIndicators: false,
};
export default config;
