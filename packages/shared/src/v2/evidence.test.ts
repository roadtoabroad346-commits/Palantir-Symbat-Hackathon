import { afterEach, expect, it } from "vitest";
import {
  lab,
  publishedProject,
  verifiedEvidence,
  deliver,
  type Lab,
} from "./testkit";
import { countryProjection, csvCell, exportPack } from "./evidence";
import { rebuild } from "./events";
const labs: Lab[] = [];
const make = (app: Parameters<typeof lab>[0]) => {
  const l = lab(app);
  labs.push(l);
  return l;
};
afterEach(() => labs.splice(0).forEach((l) => l.close()));
const input = {
  country: "KZ",
  periodStart: "2026-11-01T00:00:00Z",
  periodEnd: "2026-12-01T00:00:00Z",
  dataMode: "demo",
  acknowledgeDemo: true,
  teacherWorkload: "Demo pilot teacher workload",
  resources: "Demo resources",
  pilotPlan: "One limited trial with assigned adult",
  limitations: "Small local demo, no upstream users",
  consent: true,
};
it("reconciles country and global totals by canonical project and person IDs", () => {
  const studio = make("founder-studio"),
    a = make("global-dashboard"),
    p = publishedProject(studio);
  publishedProject(studio, { title: "second project", country: "UZ" });
  deliver(studio, a);
  deliver(studio, a);
  let data = countryProjection(a.store, "demo");
  expect(data.global.projects).toBe(2);
  expect(data.global.localParticipants).toBe(1);
  expect(data.countries.reduce((s, c) => s + c.localParticipants, 0)).toBe(1);
  expect(data.global.upstreamVerifiedParticipants).toBe(0);
  expect(data.countries.reduce((s, c) => s + c.projects, 0)).toBe(
    data.global.projects,
  );
  expect(countryProjection(a.store, "production").global.projects).toBe(0);
  rebuild(a.store);
  expect(countryProjection(a.store, "demo").global).toEqual(data.global);
  studio.mutate("project.visibility", {
    projectId: p.id,
    visibility: "private",
    consent: false,
  });
  deliver(studio, a);
  data = countryProjection(a.store, "demo");
  expect(data.global.projects).toBe(1);
  expect(data.health.some((s) => s.missing)).toBe(true);
});
it("exports labelled JSON, CSV and printable HTML with provenance and blocks revoked material", () => {
  const studio = make("founder-studio"),
    league = make("school-league"),
    a = make("global-dashboard"),
    { project: p, evidence } = verifiedEvidence(studio, league);
  const metric = league.mutate("metric.submit", {
    projectId: p.id,
    evidenceId: evidence.id,
    metricKey: "tests",
    value: 2,
    unit: "count",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    aggregation: "period",
    visibility: "public",
    consent: true,
  });
  league.mutate(
    "metric.review",
    {
      metricId: metric.id,
      verificationStatus: "verified",
      reason: "Inspected local evidence",
    },
    "reviewer",
  );
  deliver(studio, a);
  deliver(league, a);
  expect(() =>
    a.mutate(
      "evidence_pack.create",
      { ...input, acknowledgeDemo: false },
      "coordinator",
    ),
  ).toThrow("demo export");
  const pack = a.mutate("evidence_pack.create", input, "coordinator");
  const json = JSON.parse(exportPack(a.store, null, pack.id, "json").body);
  expect(json.dataMode).toBe("demo");
  expect(json.policyVersion).toBe("evidence-v2.0");
  expect(json.metrics[0].sourceRef).toBe("local-review-material");
  expect(json.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(exportPack(a.store, null, pack.id, "csv").body).toContain(
    '"dataMode"',
  );
  expect(exportPack(a.store, null, pack.id, "html").body).toContain(
    "Print this page to PDF",
  );
  studio.mutate("project.visibility", {
    projectId: p.id,
    visibility: "private",
    consent: false,
  });
  deliver(studio, a);
  expect(() => exportPack(a.store, null, pack.id, "json")).toThrow(
    "Public permission changed",
  );
});
it("distinguishes missing country data, private packs, explicit revocation and CSV formulas", () => {
  const a = make("global-dashboard"),
    studio = make("founder-studio");
  expect(() => a.mutate("evidence_pack.create", input, "coordinator")).toThrow(
    "No permitted country",
  );
  publishedProject(studio);
  deliver(studio, a);
  const privatePack = a.mutate(
    "evidence_pack.create",
    { ...input, consent: false },
    "coordinator",
  );
  expect(() => exportPack(a.store, null, privatePack.id, "json")).toThrow(
    "not found",
  );
  expect(
    exportPack(a.store, a.actor("coordinator"), privatePack.id, "json")
      .filename,
  ).toContain("demo");
  const pack = a.mutate("evidence_pack.create", input, "coordinator");
  a.mutate(
    "evidence_pack.revoke",
    { packId: pack.id, reason: "Consent withdrawn" },
    "coordinator",
  );
  expect(() => exportPack(a.store, null, pack.id, "json")).toThrow(
    "Export revoked",
  );
  expect(csvCell("=SUM(1,2)")).toBe('"\'=SUM(1,2)"');
  expect(csvCell('x"y')).toBe('"x""y"');
});
it("never publishes a metric from closed evidence and immediately restricts linked observations when consent is withdrawn", () => {
  const studio = make("founder-studio"),
    league = make("school-league"),
    dashboard = make("global-dashboard"),
    { project: p, evidence } = verifiedEvidence(studio, league);
  const d = {
    projectId: p.id,
    evidenceId: evidence.id,
    metricKey: "tests",
    value: 1,
    unit: "count",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    aggregation: "period",
    visibility: "public",
    consent: true,
  };
  const metric = league.mutate("metric.submit", d);
  league.mutate(
    "metric.review",
    {
      metricId: metric.id,
      verificationStatus: "verified",
      reason: "Reviewed material",
    },
    "reviewer",
  );
  deliver(studio, dashboard);
  deliver(league, dashboard);
  const pack = dashboard.mutate("evidence_pack.create", input, "coordinator");
  league.mutate("evidence.visibility", {
    evidenceId: evidence.id,
    consent: false,
  });
  expect(league.store.get(metric.id).visibility).toBe("private");
  expect(
    league.hub.proofCheck({ ids: [metric.id], dataMode: "demo" }, "metric")
      .allowed,
  ).toEqual([]);
  expect(() =>
    league.hub.read(league.actor("school-founder"), metric.id),
  ).toThrow("not found");
  expect(() => league.mutate("metric.submit", d)).toThrow(
    "Public metric requires publication permission",
  );
  expect(
    league.hub.proofCheck({ ids: [evidence.id], dataMode: "demo" }, "evidence")
      .allowed,
  ).toEqual([]);
  deliver(league, dashboard);
  expect(() => exportPack(dashboard.store, null, pack.id, "json")).toThrow(
    "verification or permission changed",
  );
  league.mutate("evidence.visibility", {
    evidenceId: evidence.id,
    consent: true,
  });
  expect(league.store.get(metric.id).visibility).toBe("private");
  expect(() =>
    league.mutate("evidence.submit", {
      projectId: p.id,
      title: "unsafe public evidence",
      description: "student@example.org",
      sourceType: "document_review",
      sourceRef: "source",
      url: "",
      consent: true,
      sensitive: false,
    }),
  ).toThrow("Email");
});
