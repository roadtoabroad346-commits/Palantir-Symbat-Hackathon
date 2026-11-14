import { afterEach, expect, it } from "vitest";
import { CHECKS, MISSIONS } from "./learning";
import { lab, project, deliver, type Lab } from "./testkit";
import { Store } from "./store";
const fixtures: Lab[] = [];
const make = () => {
  const l = lab("founder-studio");
  fixtures.push(l);
  return l;
};
afterEach(() => fixtures.splice(0).forEach((l) => l.close()));
const brief = {
  user: "A teacher",
  task: "Save one observation",
  actions: "Open, enter, save, reopen",
  data: "Observation text",
  constraints: "No personal details",
  errors: "Empty field is explained",
  acceptance: "Same observation after reopening",
};
const checks = (status = "passed") =>
  Object.fromEntries(
    CHECKS.map((k) => [
      k,
      {
        status,
        expected: "The specified behavior",
        observed:
          status === "passed"
            ? "Observed expected behavior"
            : "Could not finish",
        reproduce: "Open the flow and repeat the action",
      },
    ]),
  );
it("lets an individual without team or school save a trial and continue after a new connection", () => {
  const a = make(),
    p = project(a, { stage: "no_idea" });
  expect(p.data.institutionId).toBeNull();
  expect(p.data.teamId).toBeUndefined();
  const result = a.mutate("mission.submit", {
    projectId: p.id,
    missionId: "trial",
    artifact: "A teacher spends too long sorting voluntary feedback",
    source: "Own observation",
    limitations: "One observation; research needed",
  });
  expect(result.data.artifact).toContain("feedback");
  const reopened = new Store("founder-studio", a.file);
  expect(reopened.get(p.id).data.nextMission).toBe("research");
  expect(reopened.get(result.id).data.artifact).toContain("feedback");
  reopened.close();
  for (const mission of MISSIONS.slice(1))
    a.mutate("mission.submit", {
      projectId: p.id,
      missionId: mission.id,
      artifact: `Artifact for ${mission.id}`,
      source: "Human action",
      limitations: "Small sample",
    });
  expect(a.store.get(p.id).data.nextMission).toBe("continue");
  expect(a.store.list("submission")).toHaveLength(8);
});
it("keeps teams optional and requires each active member to accept", () => {
  const a = make(),
    p = project(a);
  expect(() =>
    a.mutate("team.create", { title: "orbit team", memberIds: [a.actor().id] }),
  ).toThrow("2–5");
  const team = a.mutate("team.create", {
    title: "orbit team",
    memberIds: [a.actor().id, a.actor("school-founder").id],
  });
  expect(() =>
    a.mutate("project.team", { projectId: p.id, teamId: team.id }),
  ).toThrow("Active team");
  expect(() => a.mutate("team.accept", { teamId: team.id }, "tester")).toThrow(
    "invited",
  );
  a.mutate("team.accept", { teamId: team.id }, "school-founder");
  expect(
    a.mutate("project.team", { projectId: p.id, teamId: team.id }).data.teamId,
  ).toBe(team.id);
  expect(
    a.mutate("project.team", { projectId: p.id, teamId: "" }).data.teamId,
  ).toBeNull();
});
it("stores functional mini-briefs, human checks, bug reproduction and retest history", () => {
  const a = make(),
    p = project(a);
  const v = a.mutate("prototype.save", {
    projectId: p.id,
    route: "existing",
    brief,
    url: "https://example.org/prototype",
    change: "First persistent form",
  });
  expect(v.data.prompt).toContain(brief.acceptance);
  expect(v.data.version).toBe(1);
  expect(() =>
    a.mutate("prototype.check", {
      projectId: p.id,
      prototypeId: v.id,
      checks: {},
    }),
  ).toThrow("Missing main_path");
  const failed = a.mutate("prototype.check", {
    projectId: p.id,
    prototypeId: v.id,
    checks: checks("failed"),
  });
  expect(failed.data.passed).toBe(false);
  const bug = a.mutate("bug.report", {
    projectId: p.id,
    expected: "Entry remains",
    observed: "Entry vanished",
    reproduce: "Save then reload",
    error: "",
    lastChange: "Added form",
  });
  expect(() =>
    a.mutate("bug.resolve", {
      projectId: p.id,
      bugId: bug.id,
      checkId: failed.id,
      change: "Fixed persistence",
    }),
  ).toThrow("New passing check");
  const v2 = a.mutate("prototype.save", {
    projectId: p.id,
    route: "existing",
    brief: JSON.stringify(brief),
    url: "https://example.org/prototype",
    change: "Persist after reload",
  });
  expect(v2.data.version).toBe(2);
  const passing = a.mutate("prototype.check", {
    projectId: p.id,
    prototypeId: v2.id,
    checks: JSON.stringify(checks()),
  });
  const resolved = a.mutate("bug.resolve", {
    projectId: p.id,
    bugId: bug.id,
    checkId: passing.id,
    change: "Added a real save",
  });
  expect(resolved.data.status).toBe("resolved");
  expect(a.store.list("prototype_version")).toHaveLength(2);
  expect(a.store.get(bug.id).data.reproduce).toBe("Save then reload");
  const another = project(a);
  expect(() =>
    a.mutate("prototype.check", {
      projectId: another.id,
      prototypeId: v.id,
      checks: checks(),
    }),
  ).toThrow("another project");
});
it("keeps project revisions and never turns local activity into upstream activation", () => {
  const a = make(),
    p = project(a);
  a.mutate("project.update", {
    projectId: p.id,
    title: "orbit revision",
    problem: "Refined problem",
    audience: "Teachers",
    stage: "idea",
  });
  expect(a.store.list("project_version")[0].data.previous.title).toBe(
    "orbit project",
  );
  expect(() =>
    a.mutate("project.visibility", {
      projectId: p.id,
      visibility: "public",
      consent: false,
    }),
  ).toThrow("permission");
  a.mutate("project.visibility", {
    projectId: p.id,
    visibility: "public",
    consent: true,
  });
  expect(a.hub.read(null, p.id).id).toBe(p.id);
  a.mutate("project.visibility", {
    projectId: p.id,
    visibility: "private",
    consent: false,
  });
  expect(() => a.hub.read(null, p.id)).toThrow();
  expect(a.store.list("consent")).toHaveLength(2);
  for (const e of a.store.all("SELECT envelope FROM v2_event")) {
    const event = JSON.parse(e.envelope);
    expect(event.payload.upstreamActivation).toBe(false);
    expect(event.payload.upstreamPublication).toBe(false);
  }
});
it("matches real screening and retains original negative responses beside their summary", () => {
  const a = make(),
    p = project(a);
  const experiment = a.mutate("experiment.create", {
    projectId: p.id,
    hypothesis: "Teachers understand the first action",
    target: "Teachers",
    role: "teacher",
    language: "ru",
    minAge: 18,
    maxAge: 100,
    task: "Save a first entry without hints",
    format: "usability",
    deadline: "2026-12-01T00:00:00Z",
  });
  a.mutate(
    "tester.profile",
    {
      role: "student",
      language: "ru",
      age: 16,
      interests: "education",
      experience: "Student",
      consent: true,
    },
    "tester",
  );
  expect(() =>
    a.mutate("experiment.apply", { experimentId: experiment.id }, "tester"),
  ).toThrow("screening");
  a.mutate(
    "tester.profile",
    {
      role: "teacher",
      language: "ru",
      age: 25,
      interests: "education",
      experience: "Teaching",
      consent: true,
    },
    "teacher",
  );
  const app = a.mutate(
    "experiment.apply",
    { experimentId: experiment.id },
    "teacher",
  );
  expect(app.data.reason).toContain("role=teacher");
  expect(
    a.mutate("experiment.apply", { experimentId: experiment.id }, "teacher").id,
  ).toBe(app.id);
  const response = a.mutate(
    "experiment.respond",
    {
      experimentId: experiment.id,
      original: "I could not find the save action",
      completed: false,
      difficulty: "The action was unclear",
      permission: true,
    },
    "teacher",
  );
  const decision = a.mutate("experiment.decide", {
    experimentId: experiment.id,
    decision: "change",
    assumed: "The action was clear",
    learned: "A participant could not find save",
    changed: "Make save visible",
    limitations: "One teacher",
    nextStep: "Retest after change",
  });
  expect(decision.data.summary[0].responseId).toBe(response.id);
  expect(decision.data.summary[0].text).toBe(response.data.original);
  expect(decision.data.decision).toBe("change");
  expect(decision.data.sampleSize).toBe(1);
  expect(decision.data.sampleNote).toContain("Preliminary");
  expect(() =>
    a.mutate(
      "experiment.respond",
      {
        experimentId: experiment.id,
        original: "later",
        completed: true,
        difficulty: "none",
        permission: true,
      },
      "teacher",
    ),
  ).toThrow("Eligible");
});
it("offers baseline help, progress portfolio and configurable reminders without rank or payment", () => {
  const a = make(),
    p = project(a),
    submission = a.mutate("mission.submit", {
      projectId: p.id,
      missionId: "trial",
      artifact: "A familiar problem",
      source: "Observation",
      limitations: "Not confirmed",
    });
  const help = a.mutate("help.request", {
    projectId: p.id,
    reason: "stuck",
    question: "How to ask neutral questions?",
  });
  const reply = a.mutate(
    "help.reply",
    {
      helpId: help.id,
      reply: "Ask about the last occurrence",
      action: "Prepare three neutral questions",
      dueAt: "2026-12-01T00:00:00Z",
    },
    "coordinator",
  );
  expect(reply.data.status).toBe("answered");
  expect(() =>
    a.mutate(
      "help.reply",
      { helpId: help.id, reply: "x", action: "x", dueAt: "x" },
      "intern",
    ),
  ).toThrow("Permission");
  const portfolio = a.mutate("portfolio.issue", {
    projectId: p.id,
    criteria: "Saved trial material",
    evidenceRefs: [submission.id],
  });
  expect(portfolio.data.official).toBe(false);
  expect(portfolio.data.evidenceRefs).toEqual([submission.id]);
  expect(
    a.mutate("notification.settings", { projectId: p.id, frequency: "off" })
      .data.frequency,
  ).toBe("off");
  expect(
    a.mutate("participation.continue", {
      choice: "pause",
      reason: "Need time",
      nextStep: "Return when ready",
      remindAt: "2026-12-01T00:00:00Z",
      frequency: "off",
    }).data.choice,
  ).toBe("pause");
  expect(
    a.mutate("privacy.request", { type: "export", reason: "Personal copy" })
      .data.status,
  ).toBe("pending");
  expect(
    a.mutate("abuse.report", { entityRef: p.id, reason: "Please review" }).data
      .status,
  ).toBe("pending");
  expect(a.mutate("record.read", { id: p.id }).id).toBe(p.id);
});
it("rejects affiliation and enrollment forged by an individual", () => {
  const a = make();
  expect(() => project(a, { institutionId: "invented-school" })).toThrow(
    "Sync source first",
  );
  const portal = lab("school-portal");
  fixtures.push(portal);
  const org = portal.mutate(
    "institution.create",
    {
      title: "demo academy",
      type: "school",
      country: "KZ",
      website: "",
      language: "ru",
      timezone: "UTC",
      resources: "Teacher time",
      consent: true,
    },
    "teacher",
  );
  deliver(portal, a);
  expect(() =>
    project(a, { institutionId: org.id, cohortId: "invented-cohort" }),
  ).toThrow("Sync source first");
});
