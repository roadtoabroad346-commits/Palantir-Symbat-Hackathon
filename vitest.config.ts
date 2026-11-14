import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: [
        "packages/shared/src/index.ts",
        "packages/shared/src/server.ts",
        "packages/shared/src/server/**/*.ts",
        "apps/global-dashboard/lib/logic.ts",
        "apps/global-dashboard/lib/seed-data.ts",
        "apps/global-dashboard/lib/feedback-seed.ts",
        "apps/global-dashboard/lib/datasource.ts",
      ],
      exclude: ["**/types.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
