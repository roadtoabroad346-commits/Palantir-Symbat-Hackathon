// Explicit fictional presentation data. Never runs from ordinary preparation.
import { getHub } from "@startify/shared/v2/http";
import { actorFrom } from "../packages/shared/src/v2/access";
import { DEMO_ID } from "../packages/shared/src/v2/seed";
import { eventHeaders } from "../packages/shared/src/v2/events";
import { APPS, type App, type Data } from "@startify/shared/v2/types";
const hubs = Object.fromEntries(
  (Object.keys(APPS) as App[]).map((app) => [app, getHub(app)]),
);
const studio = hubs["founder-studio"],
  marker = "presentation_v2_1";
if (studio.store.one("SELECT value FROM v2_setting WHERE key=?", marker)) {
  console.log(
    "V2 presentation fixture already exists; all user edits preserved.",
  );
  for (const hub of Object.values(hubs)) hub.store.close();
  process.exit(0);
}
let anchor = studio.store.one(
  "SELECT value FROM v2_setting WHERE key='presentation_anchor'",
)?.value;
if (!anchor) {
  anchor = new Date().toISOString();
  studio.store.run(
    "INSERT INTO v2_setting VALUES ('presentation_anchor',?)",
    anchor,
  );
}
const at = (days: number, minutes = 0) =>
  new Date(
    Date.parse(anchor) + days * 86400000 + minutes * 60000,
  ).toISOString();
function act(app: App, op: string, data: Data, profile = "solo", step = op) {
  const hub = hubs[app];
  return hub.mutate(
    actorFrom(hub.store, DEMO_ID(profile)),
    op,
    data,
    `demo-story-v2:${step}`,
  );
}
function sync() {
  for (const source of Object.values(hubs))
    for (const row of source.store.all(
      "SELECT d.eventId,d.target,e.envelope FROM v2_delivery d JOIN v2_event e ON e.eventId=d.eventId WHERE deliveredAt IS NULL ORDER BY e.createdAt,e.sequence",
    )) {
      const target = hubs[row.target as App];
      if (!target) continue;
      target.receive(row.envelope, new Headers(eventHeaders(row.envelope)));
      source.store.run(
        "UPDATE v2_delivery SET deliveredAt=?,attempts=attempts+1,lastError=NULL WHERE eventId=? AND target=?",
        new Date().toISOString(),
        row.eventId,
        row.target,
      );
    }
}
const warnings: string[] = [];
try {
  const portal = "school-portal",
    growth = "growth-engine",
    league = "school-league",
    dashboard = "global-dashboard",
    founder = "founder-studio";
  const org = act(
    portal,
    "institution.create",
    {
      title: "demo residency academy",
      type: "school",
      country: "KZ",
      website: "https://example.org",
      language: "ru",
      timezone: "Asia/Qyzylorda",
      resources: "Fictional demo room and teacher time",
      consent: true,
    },
    "teacher",
  );
  act(
    portal,
    "institution.verify",
    {
      institutionId: org.id,
      verificationStatus: "verified",
      source: "Fictional independent document-review fixture",
    },
    "reviewer",
  );
  const rep = act(
    portal,
    "representative.nominate",
    {
      institutionId: org.id,
      subjectId: DEMO_ID("representative"),
      authoritySource: "Fictional appointment fixture",
      expiresAt: at(90),
      consent: true,
    },
    "teacher",
  );
  act(
    portal,
    "representative.review",
    {
      representativeId: rep.id,
      status: "verified",
      confirmation: "Fictional authorized institution confirmation",
    },
    "admin",
  );
  const fields = Object.fromEntries(
    [
      "parties",
      "authority",
      "goal",
      "format",
      "dates",
      "resources",
      "cost",
      "dataPolicy",
      "publication",
      "workRights",
      "reschedule",
      "termination",
      "reporting",
      "responsible",
    ].map((key) => [
      key,
      `Fictional demo ${key}; parties must approve any real use`,
    ]),
  );
  const document = act(
    portal,
    "document.create",
    { institutionId: org.id, type: "memorandum", ...fields },
    "teacher",
  );
  for (const status of ["internal_review", "institution_review", "agreed"])
    act(
      portal,
      "document.transition",
      { documentId: document.id, status },
      "teacher",
      `document:${status}`,
    );
  act(
    portal,
    "document.transition",
    {
      documentId: document.id,
      status: "signed",
      signedEvidence:
        "Fictional counterparty confirmation; not a legal agreement",
    },
    "admin",
    "document:signed",
  );
  const cohort = act(
    portal,
    "cohort.create",
    {
      institutionId: org.id,
      documentId: document.id,
      title: "demo four week residency",
      program: "residency-4w",
      startAt: at(-1),
      endAt: at(28),
      coordinatorId: DEMO_ID("teacher"),
      teacherId: DEMO_ID("teacher"),
      loadMinutes: 360,
      budgetMinor: 0,
      currency: "KZT",
      criteria:
        "Saved learning evidence, prototype and original test responses",
      consent: true,
    },
    "teacher",
  );
  act(
    portal,
    "cohort.enroll",
    {
      cohortId: cohort.id,
      subjectId: DEMO_ID("school-founder"),
      consent: true,
    },
    "teacher",
  );
  act(
    portal,
    "cohort.start",
    {
      cohortId: cohort.id,
      confirmation: "Fictional demo first session; not an actual school launch",
    },
    "teacher",
  );
  for (const status of [
    "interested",
    "discussion",
    "pilot_agreed",
    "scheduled",
    "started",
  ])
    act(
      portal,
      "institution.status",
      {
        institutionId: org.id,
        status,
        reason: "Fictional demo lifecycle example",
      },
      "teacher",
      `institution:${status}`,
    );
  sync();
  const solo = act(founder, "project.create", {
    title: "demo solo orbit",
    problem: "A familiar local problem",
    audience: "Teachers",
    stage: "prototype",
    country: "KZ",
  });
  act(
    founder,
    "mission.submit",
    {
      projectId: solo.id,
      missionId: "trial",
      artifact: "Fictional trial observation, no team or school required",
      source: "Demo fixture",
      limitations: "Not a real interview",
    },
    "solo",
    "solo:trial",
  );
  act(
    founder,
    "project.visibility",
    { projectId: solo.id, visibility: "public", consent: true },
    "solo",
    "solo:public",
  );
  const p = act(
    founder,
    "project.create",
    {
      title: "demo feedback orbit",
      problem: "Review useful voluntary feedback",
      audience: "Teachers",
      stage: "prototype",
      country: "KZ",
      institutionId: org.id,
      cohortId: cohort.id,
    },
    "school-founder",
    "institutional-project",
  );
  act(
    founder,
    "mission.submit",
    {
      projectId: p.id,
      missionId: "trial",
      artifact: "Fictional saved research material",
      source: "Demo fixture, not a real interview",
      limitations: "Demonstration only",
    },
    "school-founder",
    "project:trial",
  );
  const brief = {
    user: "A teacher",
    task: "Save feedback",
    actions: "Open, enter, save, reopen",
    data: "Observation text",
    constraints: "No personal contacts",
    errors: "Explain invalid and empty input",
    acceptance: "Saved text survives reopening",
  };
  const version = act(
    founder,
    "prototype.save",
    {
      projectId: p.id,
      route: "existing",
      brief,
      url: "https://example.org/prototype",
      change: "Fictional initial prototype",
    },
    "school-founder",
  );
  const checks = Object.fromEntries(
    [
      "main_path",
      "empty_input",
      "invalid_input",
      "save",
      "reopen",
      "unavailable",
      "recovery",
    ].map((key) => [
      key,
      {
        status: "passed",
        expected: "Specified behavior",
        observed: "Fictional example observation, not an external test",
        reproduce: "Repeat the documented example",
      },
    ]),
  );
  act(
    founder,
    "prototype.check",
    { projectId: p.id, prototypeId: version.id, checks },
    "school-founder",
  );
  const bug = act(
    founder,
    "bug.report",
    {
      projectId: p.id,
      expected: "Entry remains",
      observed: "Example entry vanished",
      reproduce: "Example save and reload",
      error: "Demo only",
      lastChange: "Example form",
    },
    "school-founder",
  );
  const changed = act(
    founder,
    "prototype.save",
    {
      projectId: p.id,
      route: "existing",
      brief,
      url: "https://example.org/prototype",
      change: "Fictional persistence fix",
    },
    "school-founder",
    "prototype:fixed",
  );
  const retest = act(
    founder,
    "prototype.check",
    { projectId: p.id, prototypeId: changed.id, checks },
    "school-founder",
    "prototype:retest",
  );
  act(
    founder,
    "bug.resolve",
    {
      projectId: p.id,
      bugId: bug.id,
      checkId: retest.id,
      change: "Fictional demonstrated fix",
    },
    "school-founder",
  );
  const experiment = act(
    founder,
    "experiment.create",
    {
      projectId: p.id,
      hypothesis: "The first action is understandable",
      target: "Teachers",
      role: "teacher",
      language: "ru",
      minAge: 18,
      maxAge: 100,
      task: "Save an observation without a hint",
      format: "usability",
      deadline: at(7),
    },
    "school-founder",
  );
  act(
    founder,
    "tester.profile",
    {
      role: "teacher",
      language: "ru",
      age: 25,
      interests: "education",
      experience: "Fictional teacher profile",
      consent: true,
    },
    "teacher",
  );
  act(founder, "experiment.apply", { experimentId: experiment.id }, "teacher");
  act(
    founder,
    "experiment.respond",
    {
      experimentId: experiment.id,
      original: "Fictional example: I could not find save",
      completed: false,
      difficulty: "Example action was unclear",
      permission: true,
    },
    "teacher",
  );
  act(
    founder,
    "experiment.decide",
    {
      experimentId: experiment.id,
      decision: "change",
      assumed: "Clear action",
      learned: "Example negative observation",
      changed: "Make the action visible",
      limitations: "Fictional small sample",
      nextStep: "Run a real voluntary test when available",
    },
    "school-founder",
  );
  act(
    founder,
    "project.visibility",
    { projectId: p.id, visibility: "public", consent: true },
    "school-founder",
    "project:public",
  );
  const team = act(founder, "team.create", {
    title: "demo optional team",
    memberIds: [DEMO_ID("solo"), DEMO_ID("school-founder")],
  });
  act(founder, "team.accept", { teamId: team.id }, "school-founder");
  sync();
  act(
    portal,
    "cohort.project",
    { cohortId: cohort.id, projectId: p.id },
    "teacher",
  );
  const campaign = act(
    growth,
    "campaign.create",
    {
      title: "demo voluntary prototype check",
      projectId: p.id,
      country: "KZ",
      goal: "testers",
      audience: "teacher",
      minAge: 18,
      language: "ru",
      description: "Fictional invitation to a local prototype test",
      advantages: "Example saved workflow",
      limitations: "Demo only, no guaranteed results",
      cta: "Volunteer to test",
      channels: "manual_export",
      dailyLimit: 5,
      spendLimitMinor: 0,
    },
    "school-founder",
  );
  act(
    growth,
    "campaign.approve",
    { campaignId: campaign.id, approvedRecipients: "" },
    "school-founder",
  );
  const lead = hubs[growth].inbound(campaign.id, {
    visitorToken: DEMO_ID("story-visitor"),
    nickname: "DemoVolunteer",
    response: "Fictional voluntary tester response",
    consent: true,
    source: campaign.data.source,
  });
  for (const status of ["interested", "qualified"])
    act(
      growth,
      "lead.transition",
      {
        leadId: lead.id,
        status,
        reason: "Fictional response reviewed for fit",
        evidence: "Fictional demo response, not a real lead",
      },
      "school-founder",
      `lead:${status}`,
    );
  const content = act(
    growth,
    "content.create",
    {
      campaignId: campaign.id,
      title: "demo prototype story",
      storyboard: {
        hook: "One useful action",
        script: "Problem, prototype, test, change",
        shots: "Own permitted screen recording",
        onScreen: "A small improvement",
        subtitles: "Manual fictional text",
        cover: "Prototype in progress",
        caption: "A preliminary demo observation",
        cta: "Volunteer to test",
      },
      rights: "Fictional self-owned assets",
      snapshotId: "",
    },
    "school-founder",
  );
  act(growth, "content.export", { contentId: content.id }, "school-founder");
  act(growth, "content.render", { contentId: content.id }, "school-founder");
  const expertId = DEMO_ID("expert-research-profile"),
    expert = studio.store.get(expertId, "expert");
  if (expert.revision === 1) {
    act(
      founder,
      "expert.review",
      {
        expertProfileId: expertId,
        status: "approved",
        reviewEvidence: "Fictional independent expert-review fixture",
      },
      "reviewer",
    );
  }
  if (studio.store.get(expertId).data.status === "approved") {
    const offer = act(
        founder,
        "offer.create",
        {
          title: "demo research review",
          skill: "research",
          stage: "prototype",
          language: "ru",
          format: "short_session",
          priceMinor: 500,
          capacity: 1,
        },
        "expert-research",
      ),
      slot = act(
        founder,
        "availability.create",
        {
          offerId: offer.id,
          startAt: at(2),
          endAt: at(2, 30),
          timezone: "Asia/Qyzylorda",
        },
        "expert-research",
      );
    act(
      founder,
      "wallet.demo_credit",
      { amountMinor: 5000, reference: "demo-story-service-credit" },
      "school-founder",
    );
    const booking = act(
      founder,
      "booking.hold",
      {
        projectId: p.id,
        slotId: slot.id,
        timezone: "Asia/Qyzylorda",
        brief: "Fictional prototype and prior attempts",
        question: "How to improve the test?",
        materials: "Demo material",
        funding: "service_credit",
      },
      "school-founder",
    );
    act(
      founder,
      "booking.confirm",
      { bookingId: booking.id },
      "school-founder",
    );
    act(
      founder,
      "booking.cancel",
      {
        bookingId: booking.id,
        reason: "Fictional cancellation/refund example",
      },
      "school-founder",
    );
  } else
    warnings.push(
      "Existing expert review state preserved; booking fixture skipped.",
    );
  const proof = act(
    league,
    "evidence.submit",
    {
      projectId: p.id,
      title: "demo prototype check",
      description: "Fictional human-check material",
      sourceType: "document_review",
      sourceRef: retest.id,
      url: "https://example.org/proof",
      consent: true,
      sensitive: false,
    },
    "school-founder",
  );
  act(
    league,
    "evidence.review",
    {
      evidenceId: proof.id,
      verificationStatus: "verified",
      reason: "Fictional independent local review; not real-world proof",
      method: "document_review",
    },
    "reviewer",
  );
  const period = { periodStart: at(-1), periodEnd: at(28) };
  const metric = act(
    league,
    "metric.submit",
    {
      projectId: p.id,
      evidenceId: proof.id,
      metricKey: "tests",
      value: 1,
      unit: "count",
      ...period,
      aggregation: "period",
      visibility: "public",
      consent: true,
    },
    "school-founder",
  );
  act(
    league,
    "metric.review",
    {
      metricId: metric.id,
      verificationStatus: "verified",
      reason: "Fictional reviewed fixture",
    },
    "reviewer",
  );
  act(
    league,
    "metric.submit",
    {
      projectId: p.id,
      evidenceId: proof.id,
      metricKey: "applications",
      value: 1,
      unit: "count",
      ...period,
      aggregation: "period",
      visibility: "public",
      consent: true,
    },
    "school-founder",
    "metric:self-reported",
  );
  const season = act(
    league,
    "season.create",
    {
      scope: "*",
      title: "demo evidence season",
      ...period,
      eligibilityPolicy:
        "Individual prototype with independently reviewed demo evidence",
      category: "individual",
      stage: "prototype",
      country: "KZ",
    },
    "coordinator",
  );
  act(
    league,
    "season.transition",
    { seasonId: season.id, status: "registration" },
    "coordinator",
    "season:registration",
  );
  const entry = act(
    league,
    "season.enter",
    { seasonId: season.id, projectId: p.id },
    "school-founder",
  );
  act(
    league,
    "season.transition",
    { seasonId: season.id, status: "active" },
    "coordinator",
    "season:active",
  );
  act(
    league,
    "evaluation.submit",
    {
      entryId: entry.id,
      ratings: [4, 3, 2, 3, 4],
      evidenceRefs: [proof.id],
      reason: "Fictional rubric example",
      noConflict: true,
    },
    "reviewer",
  );
  act(
    league,
    "season.transition",
    { seasonId: season.id, status: "review" },
    "coordinator",
    "season:review",
  );
  const snapshot = act(
    league,
    "season.freeze",
    { seasonId: season.id },
    "coordinator",
  );
  act(
    league,
    "appeal.create",
    {
      snapshotId: snapshot.id,
      projectId: p.id,
      reason: "Example request to inspect a criterion",
      evidence: "Fictional additional material",
    },
    "school-founder",
  );
  // The frozen season correctly refuses roster mutation; use a separate open season for the delegation.
  const open = act(
    league,
    "season.create",
    {
      scope: "*",
      title: "demo open delegation season",
      ...period,
      eligibilityPolicy: "Voluntary affiliated projects",
      category: "delegation",
      stage: "prototype",
      country: "KZ",
    },
    "coordinator",
    "delegation:season",
  );
  const openDelegation = act(
    league,
    "delegation.create",
    {
      institutionId: org.id,
      title: "demo active delegation",
      seasonId: open.id,
      criteria: "Voluntary participation",
      consent: true,
    },
    "representative",
    "delegation:open",
  );
  act(
    league,
    "delegation.add",
    { delegationId: openDelegation.id, projectId: p.id },
    "representative",
  );
  sync();
  const pack = act(
    dashboard,
    "evidence_pack.create",
    {
      country: "KZ",
      ...period,
      dataMode: "demo",
      acknowledgeDemo: true,
      teacherWorkload: "Fictional 360-minute pilot workload",
      resources: "Fictional agreed pilot resources",
      pilotPlan: "One institution, limited group, responsible adult",
      limitations:
        "All profiles, observations and verifications are fictional demo fixtures",
      consent: true,
    },
    "coordinator",
  );
  const intern = act(
    "ambassador-platform",
    "intern.assign",
    {
      scope: "*",
      subjectId: DEMO_ID("intern"),
      direction: "research",
      task: "Review permitted program sources",
      deliverable: "Sources and known unknowns",
      dueAt: at(7),
      hours: 2,
      criteria: "No private contacts",
    },
    "coordinator",
  );
  act(
    "ambassador-platform",
    "intern.submit",
    {
      taskId: intern.id,
      artifact: "Fictional reviewed source notes",
      limitations: "No interest verified",
    },
    "intern",
  );
  const event = act(
    "challenge-platform",
    "event.create",
    {
      scope: "*",
      title: "demo progress battle",
      format: "progress_battle",
      audience: "Individual founders and teams",
      stage: "prototype",
      rules: "Separate individual/project/team formats",
      rubric: "Evidence and iteration",
      startAt: at(7),
      endAt: at(8),
      entrantTypes: "individual,project,team",
      resources: "Fictional reviewer time",
    },
    "coordinator",
  );
  act("challenge-platform", "event.enter", {
    eventId: event.id,
    entrantType: "individual",
    nextAction: "Continue the next experiment",
  });
  act(
    "challenge-platform",
    "event.enter",
    {
      eventId: event.id,
      entrantType: "team",
      teamId: team.id,
      nextAction: "Retest one flow",
    },
    "solo",
    "event:team",
  );
  sync();
  studio.store.run(
    "INSERT INTO v2_setting VALUES (?,?)",
    marker,
    JSON.stringify({
      projectId: p.id,
      soloProjectId: solo.id,
      institutionId: org.id,
      snapshotId: snapshot.id,
      packId: pack.id,
      delegationId: openDelegation.id,
    }),
  );
  console.log(
    JSON.stringify(
      {
        status: "demo_fixture_ready",
        allDataMode: "demo",
        externalSends: 0,
        projectId: p.id,
        packId: pack.id,
        warnings,
      },
      null,
      2,
    ),
  );
} finally {
  for (const hub of Object.values(hubs)) hub.store.close();
}
