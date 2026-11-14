import { afterEach, expect, it } from "vitest";
import { lab, deliver, publishedProject, type Lab } from "./testkit";
import { randomUUID } from "node:crypto";
const labs: Lab[] = [];
const make = (app: Parameters<typeof lab>[0]) => {
  const l = lab(app);
  labs.push(l);
  return l;
};
afterEach(() => labs.splice(0).forEach((l) => l.close()));
it("credits an adult ambassador in the existing ledger only after independently confirmed results", () => {
  const a = make("ambassador-platform"),
    portal = make("school-portal");
  a.store.run(
    'INSERT INTO "Ambassador" VALUES (?,?,?,?,?,?,?)',
    "legacy-adult",
    "AdultOrbit",
    "KZ",
    "",
    1,
    "Bronze",
    new Date().toISOString(),
  );
  a.store.run(
    'INSERT INTO "Ambassador" VALUES (?,?,?,?,?,?,?)',
    "legacy-minor",
    "StudentOrbit",
    "KZ",
    "",
    0,
    "Bronze",
    new Date().toISOString(),
  );
  expect(() =>
    a.mutate(
      "ambassador.link",
      {
        ambassadorId: "legacy-minor",
        subjectId: a.actor("ambassador").id,
        source: "Fixture",
      },
      "admin",
    ),
  ).toThrow("18+");
  a.mutate(
    "ambassador.link",
    {
      ambassadorId: "legacy-adult",
      subjectId: a.actor("ambassador").id,
      source: "Verified fictional adult mapping",
    },
    "admin",
  );
  const cohort = portal.store.create("cohort", portal.actor("teacher"), {
    title: "demo cohort",
    institutionId: "demo-institution",
    program: "trial-45",
    startAt: "2026-11-14T00:00:00Z",
    endAt: "2026-11-15T00:00:00Z",
    status: "started",
    consent: true,
    participantIds: [],
    projectIds: [],
  });
  portal.store.emit(
    "cohort.updated",
    portal.actor("teacher"),
    cohort,
    cohort.data,
    ["ambassador-platform"],
    "verified",
  );
  deliver(portal, a);
  const claim = a.mutate(
    "ambassador.claim",
    {
      cohortId: cohort.id,
      evidence: "Actual launch confirmation fixture",
      consent: true,
    },
    "ambassador",
  );
  expect(a.store.all('SELECT * FROM "PointsLedger"')).toHaveLength(0);
  a.store.run(
    'INSERT INTO "FraudFlag" VALUES (?,?,?,?,?)',
    randomUUID(),
    "legacy-adult",
    "Existing review flag",
    0,
    new Date().toISOString(),
  );
  expect(() =>
    a.mutate(
      "ambassador.review",
      { claimId: claim.id, approved: true, reason: "Confirmed launch" },
      "coordinator",
    ),
  ).toThrow("fraud review");
  a.store.run('UPDATE "FraudFlag" SET resolved=1');
  a.mutate(
    "ambassador.review",
    { claimId: claim.id, approved: true, reason: "Independent launch review" },
    "coordinator",
  );
  expect(a.store.all('SELECT * FROM "PointsLedger"')[0].delta).toBe(20);
  expect(() =>
    a.mutate(
      "ambassador.review",
      { claimId: claim.id, approved: true, reason: "repeat" },
      "coordinator",
    ),
  ).toThrow("already reviewed");
  expect(() =>
    a.mutate(
      "ambassador.claim",
      { cohortId: cohort.id, evidence: "repeat", consent: true },
      "ambassador",
    ),
  ).toThrow("already");
  expect(a.store.all('SELECT * FROM "PointsLedger"')).toHaveLength(1);
  expect(a.store.all("SELECT * FROM v2_ledger")).toHaveLength(0);
});
it("keeps intern access limited to assigned tasks and assigned supervisor review", () => {
  const a = make("ambassador-platform"),
    task = a.mutate(
      "intern.assign",
      {
        scope: "*",
        subjectId: a.actor("intern").id,
        direction: "research",
        task: "Review public program descriptions",
        deliverable: "Sources and unknowns",
        dueAt: "2026-12-01T00:00:00Z",
        hours: 2,
        criteria: "No personal contacts",
      },
      "coordinator",
    );
  expect(a.hub.read(a.actor("intern"), task.id).data.expertStatus).toBe(false);
  expect(() => a.hub.read(a.actor(), task.id)).toThrow("not found");
  expect(() => a.mutate("intern.assign", { scope: "*" }, "intern")).toThrow(
    "Permission",
  );
  a.mutate(
    "intern.submit",
    {
      taskId: task.id,
      artifact: "Source review with evidence",
      limitations: "Unverified interest",
    },
    "intern",
  );
  expect(() =>
    a.mutate(
      "intern.review",
      {
        taskId: task.id,
        status: "accepted",
        feedback: "Review",
        nextTask: "Next",
      },
      "admin",
    ),
  ).toThrow("Assigned supervisor");
  const accepted = a.mutate(
    "intern.review",
    {
      taskId: task.id,
      status: "accepted",
      feedback: "Good source retention",
      nextTask: "Review another public program",
    },
    "coordinator",
  );
  expect(accepted.data.status).toBe("accepted");
  expect(a.actor("intern").roles).toEqual([
    { role: "intern", scope: a.actor("intern").id },
  ]);
  expect(a.mutate("task.read", { id: task.id }, "intern").id).toBe(task.id);
});
it("adds solo/project/team entrants while leaving the 2–5 legacy team invariant intact", () => {
  const a = make("challenge-platform"),
    studio = make("founder-studio"),
    p = publishedProject(studio);
  deliver(studio, a);
  const event = a.mutate(
    "event.create",
    {
      scope: "*",
      title: "prototype battle",
      format: "prototype_battle",
      audience: "Founders",
      stage: "prototype",
      rules: "Individual and team categories",
      rubric: "Function and evidence",
      startAt: "2026-12-01T00:00:00Z",
      endAt: "2026-12-02T00:00:00Z",
      entrantTypes: "individual,project,team",
      resources: "Local demo review",
    },
    "coordinator",
  );
  const solo = a.mutate("event.enter", {
    eventId: event.id,
    entrantType: "individual",
    nextAction: "Continue learning",
  });
  expect(solo.data.entityRef).toBe(a.actor().id);
  expect(
    a.mutate("event.enter", {
      eventId: event.id,
      entrantType: "individual",
      nextAction: "Repeat",
    }).id,
  ).toBe(solo.id);
  expect(
    a.mutate("event.enter", {
      eventId: event.id,
      entrantType: "project",
      projectId: p.id,
      nextAction: "One retest",
    }).data.projectId,
  ).toBe(p.id);
  a.store.run(
    'INSERT INTO "Team" VALUES (?,?,?,?,?,?)',
    "legacy-team",
    "legacy-challenge",
    "orbit team",
    "START-001",
    "KZ",
    new Date().toISOString(),
  );
  a.store.run(
    'INSERT INTO "TeamMember" VALUES (?,?,?,?,?)',
    "member1",
    "legacy-team",
    "opaque1",
    "OrbitOne",
    "KZ",
  );
  expect(() =>
    a.mutate(
      "event.enter",
      {
        eventId: event.id,
        entrantType: "team",
        teamId: "legacy-team",
        nextAction: "Retest",
      },
      "coordinator",
    ),
  ).toThrow("2–5");
  a.store.run(
    'INSERT INTO "TeamMember" VALUES (?,?,?,?,?)',
    "member2",
    "legacy-team",
    "opaque2",
    "OrbitTwo",
    "UZ",
  );
  expect(
    a.mutate(
      "event.enter",
      {
        eventId: event.id,
        entrantType: "team",
        teamId: "legacy-team",
        nextAction: "Retest",
      },
      "coordinator",
    ).data.entityRef,
  ).toBe("legacy-team");
});
it("reserves finite partner opportunities and retains a 14-day action follow-up", () => {
  const a = make("challenge-platform"),
    studio = make("founder-studio"),
    p = publishedProject(studio);
  deliver(studio, a);
  const opportunity = a.mutate(
      "opportunity.create",
      {
        title: "a pilot review",
        problem: "Improve a public workflow",
        resource: "One short review",
        constraints: "One place only",
        places: 1,
        deadline: "2026-12-01T00:00:00Z",
      },
      "partner",
    ),
    input = {
      opportunityId: opportunity.id,
      projectId: p.id,
      resource: "Review the main flow",
      dueAt: "2026-11-30T00:00:00Z",
      confirmationMethod: "Partner confirms delivered review",
      consent: true,
    };
  const c = a.mutate("commitment.request", input);
  expect(
    Date.parse(c.data.followUpAt) - Date.parse(c.createdAt),
  ).toBeGreaterThan(13.99 * 86400000);
  expect(() =>
    a.mutate("commitment.transition", {
      commitmentId: c.id,
      status: "accepted",
      evidence: "self",
    }),
  ).toThrow("Partner must accept");
  a.mutate(
    "commitment.transition",
    { commitmentId: c.id, status: "accepted", evidence: "Agreed scope" },
    "partner",
  );
  const second = a.mutate("commitment.request", input);
  expect(() =>
    a.mutate(
      "commitment.transition",
      { commitmentId: second.id, status: "accepted", evidence: "Too many" },
      "partner",
    ),
  ).toThrow("No available resource");
  for (const status of ["scheduled", "delivered", "reviewed"])
    a.mutate(
      "commitment.transition",
      {
        commitmentId: c.id,
        status,
        evidence: "Actual party confirmation fixture",
      },
      "partner",
    );
  expect(a.store.get(c.id).data.status).toBe("reviewed");
  expect(
    a.hub.records(a.actor("partner"), "commitment").some((r) => r.id === c.id),
  ).toBe(true);
});
