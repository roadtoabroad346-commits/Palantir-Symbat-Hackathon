import { afterAll, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "../generated/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { MockDataSource, HttpDataSource, seedDatabase } from "./datasource";
import type { FeedbackInput } from "./types";
const dir = mkdtempSync(join(tmpdir(), "globe-database-"));
const path = join(dir, "demo.db");
const sql = new DatabaseSync(path);
sql.exec(
  readFileSync("apps/global-dashboard/prisma/migrations/001_init.sql", "utf8"),
);
sql.close();
const db = new PrismaClient({
  adapter: new PrismaLibSQL({ url: "file:" + path }),
});
const source = new MockDataSource(db);
afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
it("persists seed idempotently and simulates only active countries while preserving sums", async () => {
  await seedDatabase(db);
  const before = await source.read();
  await seedDatabase(db);
  expect((await source.read()).feedback).toHaveLength(60);
  const result = await source.simulate(4);
  expect(result.pulses.length).toBeGreaterThan(0);
  for (const p of result.pulses)
    expect(
      before.countries.find((c) => c.iso === p.iso)!.wave,
    ).toBeLessThanOrEqual(2);
  expect(result.state.globals[4].users).toBeGreaterThan(
    before.globals[4].users,
  );
  expect(result.state.globals[3]).toEqual(before.globals[3]);
  for (const g of result.state.globals) {
    expect(
      result.state.metrics
        .filter(
          (m) => m.monthIndex === g.monthIndex && m.direction === "growth",
        )
        .reduce((n, m) => n + m.primaryMetric, 0),
    ).toBe(g.users);
    expect(
      result.state.metrics
        .filter(
          (m) => m.monthIndex === g.monthIndex && m.direction === "league",
        )
        .reduce((n, m) => n + m.primaryMetric, 0),
    ).toBe(g.publishedProjects);
  }
  await expect(source.simulate(99)).rejects.toThrow();
});
it("rejects public PII and stores comments, votes and admin triage", async () => {
  await seedDatabase(db);
  const input: FeedbackInput = {
    iso: "UZ",
    direction: "ambassador",
    authorType: "ambassador",
    nickname: "OrbitNew77",
    category: "localization",
    lang: "en",
    text: "Please add local lesson examples.",
  };
  await expect(
    source.addFeedback({ ...input, nickname: "John Smith" }),
  ).rejects.toThrow();
  await expect(
    source.addFeedback({ ...input, text: "Send to a@example.org" }),
  ).rejects.toThrow();
  const made = await source.addFeedback(input);
  expect(made.feedback.textOriginal).toBe(input.text);
  expect(made.state.feedback.some((f) => f.id === made.feedback.id)).toBe(true);
  await source.updateFeedback(made.feedback.id, "vote");
  expect(
    (await source.read()).feedback.find((f) => f.id === made.feedback.id)
      ?.votes,
  ).toBe(1);
  await expect(
    source.updateFeedback(made.feedback.id, "status", "planned", false),
  ).rejects.toThrow("admin");
  await source.updateFeedback(made.feedback.id, "status", "planned", true);
  expect(
    (await source.read()).feedback.find((f) => f.id === made.feedback.id)
      ?.status,
  ).toBe("planned");
  await expect(source.addFeedback({ ...input, iso: "XX" })).rejects.toThrow();
});
it("HTTP datasource never pretends to contact a real platform", async () => {
  const http = new HttpDataSource();
  await expect(http.read()).rejects.toThrow("not implemented");
});
