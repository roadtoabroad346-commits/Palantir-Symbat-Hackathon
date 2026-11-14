import { afterEach, expect, it } from "vitest";
import { lab, deliver, project, type Lab } from "./testkit";
import { actorFrom } from "./access";
const labs: Lab[] = [];
const make = (app: Parameters<typeof lab>[0] = "school-portal") => {
  const l = lab(app);
  labs.push(l);
  return l;
};
afterEach(() => labs.splice(0).forEach((l) => l.close()));
export const documentFields = {
  parties: "Program and institution",
  authority: "Authorized representatives confirm",
  goal: "One limited pilot",
  format: "Four-week residency",
  dates: "Agreed pilot dates",
  resources: "Two sessions per week",
  cost: "No unconfirmed free resources",
  dataPolicy: "Minimum data, consent and scoped access",
  publication: "Separate opt-in",
  workRights: "Creators retain their work",
  reschedule: "Agree in advance",
  termination: "Either party can terminate",
  reporting: "Current state report with evidence",
  responsible: "Named responsible adults",
};
export function organization(a: Lab) {
  return a.mutate(
    "institution.create",
    {
      title: "demo academy",
      type: "school",
      country: "KZ",
      website: "https://example.org",
      language: "ru",
      timezone: "Asia/Qyzylorda",
      resources: "Demo teacher workload",
      consent: true,
    },
    "teacher",
  );
}
export function agreedDocument(a: Lab, institutionId: string) {
  const doc = a.mutate(
    "document.create",
    { institutionId, type: "memorandum", ...documentFields },
    "teacher",
  );
  for (const status of ["internal_review", "institution_review", "agreed"])
    a.mutate("document.transition", { documentId: doc.id, status }, "teacher");
  a.mutate(
    "document.transition",
    {
      documentId: doc.id,
      status: "signed",
      signedEvidence:
        "Authorized counterparty reviewed and confirmed demo terms",
    },
    "admin",
  );
  return a.store.get(doc.id);
}
it("distinguishes organization qualification, verification and refusal causes", () => {
  const a = make(),
    org = organization(a);
  expect(org.data.verificationStatus).toBe("self_reported");
  for (const status of [
    "interested",
    "discussion",
    "pilot_agreed",
    "scheduled",
  ])
    a.mutate(
      "institution.status",
      { institutionId: org.id, status, reason: "Actual contact documented" },
      "teacher",
    );
  expect(() =>
    a.mutate(
      "institution.status",
      { institutionId: org.id, status: "started" },
      "teacher",
    ),
  ).toThrow("Actually started cohort");
  expect(() =>
    a.mutate(
      "institution.verify",
      { institutionId: org.id, verificationStatus: "verified", source: "self" },
      "teacher",
    ),
  ).toThrow("Permission");
  const verified = a.mutate(
    "institution.verify",
    {
      institutionId: org.id,
      verificationStatus: "verified",
      source: "Independent document review",
    },
    "reviewer",
  );
  expect(verified.data.verifiedBy).toBe(a.actor("reviewer").id);
  expect(
    a.mutate(
      "institution.status",
      {
        institutionId: org.id,
        status: "archived",
        reason: "No coordinator currently available",
      },
      "teacher",
    ).data.refusalReason,
  ).toContain("No coordinator");
});
it("requires an independent authorized signature and creates a new terms revision", () => {
  const a = make(),
    org = organization(a),
    doc = a.mutate(
      "document.create",
      { institutionId: org.id, type: "memorandum", ...documentFields },
      "teacher",
    );
  expect(() =>
    a.mutate(
      "document.transition",
      { documentId: doc.id, status: "signed", signedEvidence: "fake" },
      "teacher",
    ),
  ).toThrow("unavailable");
  for (const status of ["internal_review", "institution_review", "agreed"])
    a.mutate("document.transition", { documentId: doc.id, status }, "teacher");
  expect(() =>
    a.mutate(
      "document.transition",
      { documentId: doc.id, status: "signed", signedEvidence: "self" },
      "teacher",
    ),
  ).toThrow("Permission");
  a.mutate(
    "document.transition",
    {
      documentId: doc.id,
      status: "signed",
      signedEvidence: "Counterparty confirmation reference",
    },
    "admin",
  );
  const revised = a.mutate(
    "document.revise",
    {
      documentId: doc.id,
      reason: "Change workload",
      resources: "One session per week",
    },
    "teacher",
  );
  expect(revised.data.status).toBe("draft");
  expect(revised.data.revision).toBe(2);
  expect(revised.data.signedEvidence).toBeNull();
  const old = a.store.list("document_revision")[0];
  expect(old.data.fields.resources).toBe("Two sessions per week");
  expect(old.data.signedEvidence).toBe("Counterparty confirmation reference");
});
it("confirms representative authority only in the correct scope and propagates revocation", () => {
  const a = make(),
    league = make("school-league"),
    org = organization(a),
    subjectId = a.actor("representative").id;
  const nomination = a.mutate(
    "representative.nominate",
    {
      institutionId: org.id,
      subjectId,
      authoritySource: "Institution appointment",
      expiresAt: "2027-01-01T00:00:00Z",
      consent: true,
    },
    "teacher",
  );
  expect(actorFrom(a.store, subjectId).roles).toEqual([]);
  a.mutate(
    "representative.review",
    {
      representativeId: nomination.id,
      status: "verified",
      confirmation: "Authorized institution confirmed",
    },
    "admin",
  );
  deliver(a, league);
  expect(actorFrom(league.store, subjectId).roles).toEqual([
    { role: "institution_representative", scope: org.id },
  ]);
  const doc = agreedDocument(a, org.id);
  const other = organization(a);
  expect(() =>
    a.mutate(
      "document.create",
      { institutionId: other.id, type: "proposal", ...documentFields },
      "representative",
    ),
  ).toThrow("Institution permission");
  expect(
    a.mutate(
      "document.transition",
      { documentId: doc.id, status: "active" },
      "representative",
    ).data.status,
  ).toBe("active");
  a.mutate(
    "representative.review",
    {
      representativeId: nomination.id,
      status: "revoked",
      confirmation: "Appointment ended",
    },
    "admin",
  );
  deliver(a, league);
  expect(actorFrom(league.store, subjectId).roles).toEqual([]);
});
it("runs an agreed cohort through enrollment, actual launch, solo project and a truthful report", () => {
  const a = make(),
    studio = make("founder-studio"),
    org = organization(a),
    doc = agreedDocument(a, org.id),
    input = {
      institutionId: org.id,
      documentId: doc.id,
      title: "pilot cohort",
      program: "residency-4w",
      startAt: "2026-11-15T10:00:00Z",
      endAt: "2026-12-15T10:00:00Z",
      coordinatorId: a.actor("teacher").id,
      teacherId: a.actor("teacher").id,
      loadMinutes: 360,
      budgetMinor: 0,
      currency: "KZT",
      criteria: "Saved materials and a checked prototype",
      consent: true,
    };
  const c = a.mutate("cohort.create", input, "teacher");
  expect(() =>
    a.mutate(
      "cohort.start",
      { cohortId: c.id, confirmation: "Started" },
      "teacher",
    ),
  ).toThrow("participants");
  a.mutate(
    "cohort.enroll",
    { cohortId: c.id, subjectId: a.actor().id, consent: true },
    "teacher",
  );
  a.mutate(
    "cohort.enroll",
    { cohortId: c.id, subjectId: a.actor().id, consent: true },
    "teacher",
  );
  expect(a.store.get(c.id).data.participantIds).toHaveLength(1);
  a.mutate(
    "cohort.start",
    { cohortId: c.id, confirmation: "Teacher confirmed actual first session" },
    "teacher",
  );
  deliver(a, studio);
  const p = project(studio, { institutionId: org.id, cohortId: c.id });
  expect(p.data.teamId).toBeUndefined();
  deliver(studio, a);
  a.mutate("cohort.project", { cohortId: c.id, projectId: p.id }, "teacher");
  a.mutate(
    "cohort.complete",
    {
      cohortId: c.id,
      report: "One local prototype checked",
      teacherMinutes: 360,
      nextStep: "Review small pilot, then decide repetition",
    },
    "teacher",
  );
  const report = a.mutate(
    "institution.report",
    { institutionId: org.id, nextStep: "Limited follow-up" },
    "teacher",
  );
  expect(report.data.participants).toBe(1);
  expect(report.data.projects).toBe(1);
  expect(report.data.type).toBe("current_snapshot");
  expect(
    a.mutate(
      "club.create",
      {
        institutionId: org.id,
        title: "startup club",
        responsibleId: a.actor("teacher").id,
        resources: "One reserved room",
        rhythm: "Weekly",
        nextMeeting: "2026-12-20T10:00:00Z",
      },
      "teacher",
    ).data.continuation,
  ).toBe("opt_in");
});
it("blocks a cohort launch after signed terms change", () => {
  const a = make(),
    org = organization(a),
    doc = agreedDocument(a, org.id),
    c = a.mutate(
      "cohort.create",
      {
        institutionId: org.id,
        documentId: doc.id,
        title: "pilot cohort",
        program: "trial-45",
        startAt: "2026-11-15T10:00:00Z",
        endAt: "2026-12-15T10:00:00Z",
        coordinatorId: a.actor("teacher").id,
        teacherId: a.actor("teacher").id,
        loadMinutes: 45,
        budgetMinor: 0,
        currency: "KZT",
        criteria: "One observation",
        consent: true,
      },
      "teacher",
    );
  a.mutate(
    "cohort.enroll",
    { cohortId: c.id, subjectId: a.actor().id, consent: true },
    "teacher",
  );
  a.mutate(
    "document.revise",
    {
      documentId: doc.id,
      reason: "Resource changed",
      resources: "No room confirmed",
    },
    "teacher",
  );
  expect(() =>
    a.mutate(
      "cohort.start",
      { cohortId: c.id, confirmation: "start" },
      "teacher",
    ),
  ).toThrow("Agreement changed");
});
