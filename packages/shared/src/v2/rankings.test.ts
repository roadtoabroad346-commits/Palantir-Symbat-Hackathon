import { afterEach, expect, it } from "vitest";
import {
  lab,
  publishedProject,
  verifiedEvidence,
  deliver,
  type Lab,
} from "./testkit";
import { scoreV2, ranked, retentionW2, POLICY } from "./rankings";
const labs: Lab[] = [];
const make = (app: Parameters<typeof lab>[0]) => {
  const l = lab(app);
  labs.push(l);
  return l;
};
afterEach(() => labs.splice(0).forEach((l) => l.close()));
const period = {
  periodStart: "2026-11-01T00:00:00Z",
  periodEnd: "2026-12-01T00:00:00Z",
};
function season(a: Lab) {
  const s = a.mutate(
    "season.create",
    {
      scope: "*",
      title: "pilot season",
      ...period,
      eligibilityPolicy:
        "Prototype-stage individual projects with independently reviewed evidence",
      category: "individual",
      stage: "prototype",
      country: "KZ",
    },
    "coordinator",
  );
  a.mutate(
    "season.transition",
    { seasonId: s.id, status: "registration" },
    "coordinator",
  );
  return s;
}
function frozen(studio: Lab, league: Lab) {
  const { project: p, evidence } = verifiedEvidence(studio, league),
    s = season(league),
    entry = league.mutate("season.enter", { seasonId: s.id, projectId: p.id });
  league.mutate(
    "season.transition",
    { seasonId: s.id, status: "active" },
    "coordinator",
  );
  league.mutate(
    "evaluation.submit",
    {
      entryId: entry.id,
      ratings: [4, 3, 2, 3, 4],
      evidenceRefs: [evidence.id],
      reason: "Rubric supported by saved evidence",
      noConflict: true,
    },
    "reviewer",
  );
  league.mutate(
    "season.transition",
    { seasonId: s.id, status: "review" },
    "coordinator",
  );
  const snapshot = league.mutate(
    "season.freeze",
    { seasonId: s.id },
    "coordinator",
  );
  return { p, evidence, s, entry, snapshot };
}
it("reproduces score 0–100 with competition ranks and strict rating bounds", () => {
  expect(scoreV2([0, 0, 0, 0, 0])).toBe(0);
  expect(scoreV2([4, 4, 4, 4, 4])).toBe(100);
  expect(scoreV2([4, 3, 2, 3, 4])).toBe(76.25);
  for (const r of [
    [1, 2],
    [5, 1, 1, 1, 1],
    [1.5, 2, 2, 2, 2],
  ])
    expect(() => scoreV2(r)).toThrow();
  expect(
    ranked([
      { projectId: "c", score: 10 },
      { projectId: "a", score: 90 },
      { projectId: "b", score: 90 },
    ]).map((r) => r.rank),
  ).toEqual([1, 1, 3]);
});
it("uses exact W2 [7,14) maturity windows and treats missing data separately", () => {
  const at = "2026-01-01T00:00:00Z",
    asOf = "2026-01-15T00:00:00Z";
  expect(
    retentionW2(
      [
        { id: "a", activatedAt: at, actions: ["2026-01-08T00:00:00Z"] },
        { id: "b", activatedAt: at, actions: ["2026-01-15T00:00:00Z"] },
        {
          id: "c",
          activatedAt: "2026-01-02T00:00:00Z",
          actions: ["2026-01-10T00:00:00Z"],
        },
      ],
      asOf,
    ),
  ).toEqual({ numerator: 1, denominator: 2, value: 50 });
  expect(retentionW2([], asOf).value).toBeNull();
});
it("does not turn a self-declared institution affiliation into official institutional season credit", () => {
  const studio = make("founder-studio"),
    portal = make("school-portal"),
    a = make("school-league");
  const org = portal.store.list("institution")[0];
  deliver(portal, studio);
  deliver(portal, a);
  const p = publishedProject(studio, { institutionId: org.id });
  deliver(studio, a);
  const s = season(a);
  const entry = a.mutate("season.enter", { seasonId: s.id, projectId: p.id });
  expect(entry.data.primaryInstitutionId).toBeNull();
  expect(entry.data.affiliations).toContain(org.id);
});
it("keeps self-reported observations distinct, validates financial and ratio definitions", () => {
  const studio = make("founder-studio"),
    a = make("school-league"),
    { project: p, evidence } = verifiedEvidence(studio, a),
    input = {
      projectId: p.id,
      evidenceId: evidence.id,
      metricKey: "tests",
      value: 2,
      unit: "count",
      ...period,
      aggregation: "period",
      visibility: "public",
      consent: true,
    };
  const m = a.mutate("metric.submit", input);
  expect(m.data.verificationStatus).toBe("self_reported");
  expect(() =>
    a.mutate("metric.review", {
      metricId: m.id,
      verificationStatus: "verified",
      reason: "self",
    }),
  ).toThrow("Permission");
  a.mutate(
    "metric.review",
    {
      metricId: m.id,
      verificationStatus: "verified",
      reason: "Reviewed original observations",
    },
    "reviewer",
  );
  expect(a.store.get(m.id).data.verifiedBy).toBe(a.actor("reviewer").id);
  const revision = a.mutate("metric.revise", {
    metricId: m.id,
    ...input,
    value: 3,
    reason: "Additional test, new period definition retained",
  });
  expect(revision.data.previousId).toBe(m.id);
  expect(a.store.get(m.id).data.value).toBe(2);
  expect(revision.data.verificationStatus).toBe("pending");
  expect(() =>
    a.mutate("metric.submit", {
      ...input,
      metricKey: "conversion",
      value: 50,
      numerator: 1,
      denominator: 0,
    }),
  ).toThrow();
  expect(() =>
    a.mutate("metric.submit", {
      ...input,
      metricKey: "conversion",
      value: 90,
      numerator: 1,
      denominator: 2,
    }),
  ).toThrow("Ratio");
  expect(
    a.mutate("metric.submit", {
      ...input,
      metricKey: "conversion",
      value: 50,
      numerator: 1,
      denominator: 2,
      unit: "percent",
    }).data.denominator,
  ).toBe(2);
  expect(() =>
    a.mutate("metric.submit", { ...input, metricKey: "revenue", currency: "" }),
  ).toThrow();
  expect(
    a.mutate("metric.submit", {
      ...input,
      metricKey: "revenue",
      currency: "KZT",
      unit: "minor_units",
    }).data.currency,
  ).toBe("KZT");
  expect(() => a.mutate("metric.submit", { ...input, value: -1 })).toThrow(
    "nonnegative",
  );
});
it("freezes a versioned rubric without rewriting frozen V1 history and retains independent reviewer inputs", () => {
  const studio = make("founder-studio"),
    a = make("school-league");
  a.store.run(
    'INSERT INTO "Season" VALUES (?,?,?,?,?,?)',
    "legacy-frozen",
    "legacy",
    "2026-01-01",
    "2026-02-01",
    0,
    1,
  );
  a.store.run(
    'INSERT INTO "PointsSnapshot" VALUES (?,?,?,?,?,?,?)',
    "legacy-row",
    "legacy-frozen",
    "legacy-school",
    1,
    1,
    11,
    "2026-02-01",
  );
  const old = JSON.stringify(a.store.all('SELECT * FROM "PointsSnapshot"'));
  const { s, entry, snapshot } = frozen(studio, a);
  expect(snapshot.data.policyVersion).toBe(POLICY.version);
  expect(snapshot.data.rows[0].score).toBe(76.25);
  expect(() =>
    a.mutate(
      "evaluation.submit",
      {
        entryId: entry.id,
        ratings: [4, 4, 4, 4, 4],
        evidenceRefs: [],
        reason: "late",
        noConflict: true,
      },
      "reviewer",
    ),
  ).toThrow("Independent evaluation");
  expect(() =>
    a.mutate("season.freeze", { seasonId: s.id }, "coordinator"),
  ).toThrow("review");
  expect(JSON.stringify(a.store.all('SELECT * FROM "PointsSnapshot"'))).toBe(
    old,
  );
  expect(
    a.mutate("ranking.read", { snapshotId: snapshot.id }).data.rows,
  ).toHaveLength(1);
  studio.mutate("wallet.demo_credit", {
    amountMinor: 10000,
    reference: "rank-independent",
  });
  expect(a.store.get(snapshot.id).data.rows[0].score).toBe(76.25);
  a.mutate(
    "season.transition",
    { seasonId: s.id, status: "archived" },
    "coordinator",
  );
  expect(a.store.get(s.id).data.status).toBe("archived");
});
it("keeps original snapshots when an appeal creates a new explained revision", () => {
  const studio = make("founder-studio"),
    a = make("school-league"),
    { p, snapshot } = frozen(studio, a),
    original = JSON.stringify(a.store.get(snapshot.id)),
    appeal = a.mutate("appeal.create", {
      snapshotId: snapshot.id,
      projectId: p.id,
      reason: "Missed improvement evidence",
      evidence: "New review material",
    });
  const resolved = a.mutate(
    "appeal.resolve",
    {
      appealId: appeal.id,
      accepted: true,
      ratings: "4,4,4,4,4",
      reason: "Independent reviewer accepted corrected evidence",
    },
    "reviewer",
  );
  expect(resolved.data.resultSnapshotId).not.toBe(snapshot.id);
  expect(JSON.stringify(a.store.get(snapshot.id))).toBe(original);
  expect(
    a.store.get(resolved.data.resultSnapshotId).data.previousSnapshotId,
  ).toBe(snapshot.id);
  expect(a.store.get(resolved.data.resultSnapshotId).data.rows[0].score).toBe(
    100,
  );
});
it("refuses empty or unverified season scoring and preserves revoked public permissions", () => {
  const studio = make("founder-studio"),
    a = make("school-league"),
    { p, snapshot } = frozen(studio, a);
  studio.mutate("project.visibility", {
    projectId: p.id,
    visibility: "private",
    consent: false,
  });
  deliver(studio, a);
  expect(
    a.mutate("ranking.read", { snapshotId: snapshot.id }).data.rows,
  ).toHaveLength(0);
  expect(a.store.get(snapshot.id).data.rows).toHaveLength(1);
  const s = season(a);
  a.mutate(
    "season.transition",
    { seasonId: s.id, status: "active" },
    "coordinator",
  );
  a.mutate(
    "season.transition",
    { seasonId: s.id, status: "review" },
    "coordinator",
  );
  expect(() =>
    a.mutate("season.freeze", { seasonId: s.id }, "coordinator"),
  ).toThrow("Insufficient");
});
it("shows small institutions as provisional and freezes a reproducible institution formula", () => {
  const studio = make("founder-studio"),
    portal = make("school-portal"),
    a = make("school-league");
  const org = portal.mutate(
    "institution.create",
    {
      title: "demo academy",
      type: "school",
      country: "KZ",
      website: "",
      language: "ru",
      timezone: "UTC",
      resources: "Pilot",
      consent: true,
    },
    "teacher",
  );
  const cohort = portal.store.create("cohort", portal.actor("teacher"), {
    title: "authorized pilot cohort",
    institutionId: org.id,
    program: "residency-4w",
    startAt: "2026-11-01T00:00:00Z",
    endAt: "2026-12-01T00:00:00Z",
    status: "started",
    consent: true,
    participantIds: [studio.actor().id],
    projectIds: [],
  });
  portal.store.emit(
    "cohort.updated",
    portal.actor("teacher"),
    cohort,
    cohort.data,
    ["founder-studio", "school-league"],
    "verified",
  );
  deliver(portal, a);
  deliver(portal, studio);
  const p = publishedProject(studio, {
    institutionId: org.id,
    cohortId: cohort.id,
  });
  verifiedEvidence(studio, a, p);
  const s = season(a),
    entry = a.mutate("season.enter", { seasonId: s.id, projectId: p.id });
  a.mutate(
    "season.transition",
    { seasonId: s.id, status: "active" },
    "coordinator",
  );
  const e = a.store.list("evidence")[0];
  a.mutate(
    "evaluation.submit",
    {
      entryId: entry.id,
      ratings: [4, 4, 4, 4, 4],
      evidenceRefs: [e.id],
      reason: "Rubric evidence",
      noConflict: true,
    },
    "reviewer",
  );
  a.mutate(
    "season.transition",
    { seasonId: s.id, status: "review" },
    "coordinator",
  );
  a.mutate("season.freeze", { seasonId: s.id }, "coordinator");
  expect(a.hub.institutions(a.actor())[0].status).toBe("provisional");
  const result = a.mutate(
    "institution.rank",
    {
      institutionId: org.id,
      seasonId: s.id,
      asOf: new Date().toISOString(),
      reason: "Frozen pilot roster",
    },
    "coordinator",
  );
  expect(result.data.projectCount).toBe(1);
  expect(result.data.participantCount).toBe(1);
  expect(result.data.institutionScore).toBeNull();
  expect(result.data.status).toBe("provisional");
  expect(
    a.hub.institutions(a.actor()).find((r) => r.institutionId === org.id)?.id,
  ).toBe(result.id);
});
