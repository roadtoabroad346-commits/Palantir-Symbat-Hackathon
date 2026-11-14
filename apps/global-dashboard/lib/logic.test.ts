import { describe, it, expect } from "vitest";
import {
  captureScore,
  dominantDirection,
  overallCapture,
  markerFan,
  filterFeedback,
  localizationInsights,
} from "./logic";
import { createSeed } from "./seed-data";
import { COUNTRIES, startMonth } from "../config/targets";
import type { Metric } from "./types";
const metric = (direction: Metric["direction"], capture: number): Metric => ({
  iso: "KZ",
  direction,
  monthIndex: 0,
  capture,
  primaryMetric: 0,
  secondaryMetric: 0,
});
describe("capture and geometry", () => {
  it("clamps scores and guards invalid targets", () => {
    expect(captureScore(4, 8)).toBe(50);
    expect(captureScore(100, 1)).toBe(100);
    expect(captureScore(-1, 20)).toBe(0);
    expect(captureScore(2, 0)).toBe(0);
    expect(captureScore(NaN, 3)).toBe(0);
  });
  it("finds dominant with deterministic tie break and weighted overall", () => {
    expect(
      dominantDirection([metric("growth", 30), metric("league", 80)]),
    ).toBe("league");
    expect(dominantDirection([])).toBeNull();
    expect(
      dominantDirection([metric("growth", 80), metric("league", 80)]),
    ).toBe("growth");
    expect(overallCapture([metric("growth", 100)])).toBe(20);
  });
  it("places five distinct non-overlapping markers around a centroid", () => {
    const a = markerFan(COUNTRIES[0], 5);
    expect(a).toEqual(markerFan(COUNTRIES[0], 5));
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++)
        expect(
          Math.hypot(a[i].lat - a[j].lat, a[i].lng - a[j].lng),
        ).toBeGreaterThan(1.8);
  });
});
describe("deterministic expansion", () => {
  it("matches exact endpoints, monotonic totals and country sums at each month", () => {
    const s = createSeed();
    expect(s.globals[0]).toMatchObject({ users: 4000, publishedProjects: 567 });
    expect(s.globals[12]).toMatchObject({
      users: 100000,
      publishedProjects: 10000,
    });
    for (const g of s.globals) {
      expect(
        s.metrics
          .filter(
            (m) => m.monthIndex === g.monthIndex && m.direction === "growth",
          )
          .reduce((n, m) => n + m.primaryMetric, 0),
      ).toBe(g.users);
      expect(
        s.metrics
          .filter(
            (m) => m.monthIndex === g.monthIndex && m.direction === "league",
          )
          .reduce((n, m) => n + m.primaryMetric, 0),
      ).toBe(g.publishedProjects);
      if (g.monthIndex)
        expect(g.users).toBeGreaterThan(s.globals[g.monthIndex - 1].users);
    }
    for (const c of s.countries) {
      for (let month = 0; month <= 12; month++) {
        const row = s.metrics.find(
          (m) =>
            m.iso === c.iso &&
            m.monthIndex === month &&
            m.direction === "growth",
        )!;
        if (month < startMonth(c)) expect(row.primaryMetric).toBe(0);
        else expect(row.primaryMetric).toBeGreaterThan(0);
        if (month)
          expect(row.primaryMetric).toBeGreaterThanOrEqual(
            s.metrics.find(
              (m) =>
                m.iso === c.iso &&
                m.monthIndex === month - 1 &&
                m.direction === "growth",
            )!.primaryMetric,
          );
      }
    }
  });
  it("reproduces every seeded row and creates60 safe comments", () => {
    expect(createSeed()).toEqual(createSeed());
    expect(createSeed().feedback).toHaveLength(60);
  });
});
describe("feedback filters and insight themes", () => {
  it("filters every dimension and sorts votes and date without mutating", () => {
    const s = createSeed().feedback;
    const f = filterFeedback(s, {
      iso: "UZ",
      direction: "ambassador",
      category: "localization",
      authorType: "ambassador",
      status: "triaged",
      sort: "votes",
    });
    expect(f).toHaveLength(1);
    expect(f.every((v) => v.iso === "UZ" && v.direction === "ambassador")).toBe(
      true,
    );
    const sorted = filterFeedback(s, { sort: "votes" });
    expect(sorted[0].votes).toBeGreaterThanOrEqual(sorted.at(-1)!.votes);
    expect(s).toEqual(createSeed().feedback);
    expect(
      filterFeedback(s, { sort: "date" })[0].createdAt >=
        filterFeedback(s, { sort: "date" }).at(-1)!.createdAt,
    ).toBe(true);
  });
  it("produces country-specific localized themes and summary", () => {
    const s = createSeed();
    const insight = localizationInsights(
      COUNTRIES.find((c) => c.iso === "IN")!,
      s.feedback,
      "en",
    );
    expect(insight.summary).toContain("Hindi");
    expect(insight.themes.length).toBeLessThanOrEqual(3);
    expect(insight.counts.localization).toBeGreaterThan(0);
  });
});
