import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
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
