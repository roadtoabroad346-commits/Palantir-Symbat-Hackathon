import { describe, it, expect } from "vitest";
import { DEMO_APPS, identifyApp, appUrl } from "./demo-apps.mjs";
describe("demo entry contracts", () => {
  it("has six distinct products and gives globe the landing priority", () => {
    expect(DEMO_APPS).toHaveLength(6);
    expect(new Set(DEMO_APPS.map((a) => a.port)).size).toBe(6);
    expect(DEMO_APPS[0].key).toBe("globe");
  });
  it("requires domain identity rather than an open port", () => {
    const growth = DEMO_APPS.find((a) => a.key === "growth")!;
    expect(identifyApp(growth, { app: "growth-engine" })).toBe(true);
    expect(identifyApp(growth, { app: "school-league" })).toBe(false);
    const globe = DEMO_APPS[0];
    expect(
      identifyApp(globe, {
        countries: Array(10),
        globals: Array(13),
        metrics: Array(650),
      }),
    ).toBe(true);
    expect(identifyApp(globe, { ok: true })).toBe(false);
  });
  it("uses the viewers hostname and the app port", () => {
    expect(appUrl("https://example.test:3000", 3006)).toBe(
      "https://example.test:3006/",
    );
    expect(appUrl("http://localhost:3000", 3001)).toBe(
      "http://localhost:3001/",
    );
  });
});

it("reports a busy hub port without starting or killing any application", async () => {
  const { createServer } = await import("node:net");
  const { spawn } = await import("node:child_process");
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "0.0.0.0", resolve));
  const address = blocker.address();
  if (!address || typeof address === "string")
    throw new Error("Missing allocated port");
  try {
    const result = await new Promise<{ code: number | null; output: string }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/demo.mjs"], {
          env: {
            ...process.env,
            DEMO_PORT: String(address.port),
            DEMO_NO_OPEN: "1",
          },
        });
        let output = "";
        child.stderr.on("data", (b) => (output += b));
        child.on("error", reject);
        child.on("exit", (code) => resolve({ code, output }));
      },
    );
    expect(result.code).toBe(1);
    expect(result.output).toContain("could not start");
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});
