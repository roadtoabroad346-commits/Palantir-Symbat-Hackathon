// Production-build HTTP acceptance with seven isolated databases, no external sends.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { relayOnce } from "./v2-relay.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  temp = await mkdtemp(join(tmpdir(), "startify-v2-http-")),
  children = [],
  logs = new Map();
const names = [
  "growth-engine",
  "ambassador-platform",
  "challenge-platform",
  "school-portal",
  "school-league",
  "global-dashboard",
  "founder-studio",
];
const selected = process.argv[2] ? [process.argv[2]] : names;
const origin = (name) => `http://127.0.0.1:${3001 + names.indexOf(name)}`;
const subject = (name) =>
  "demo-" +
  createHash("sha256")
    .update("startify-v2:" + name)
    .digest("hex")
    .slice(0, 24);
const cookies = new Map();
async function waitFor(fn, label, timeout = 60000) {
  const end = Date.now() + timeout;
  let error;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      error = e;
    }
    await delay(200);
  }
  throw Error(`${label}: ${error?.message ?? "timeout"}`);
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await waitFor(
    () => child.exitCode !== null || child.signalCode !== null,
    "server stop",
    10000,
  );
}
async function start(name, demo = true) {
  const portOrigin = origin(name);
  let busy = false;
  try {
    await fetch(portOrigin, { signal: AbortSignal.timeout(500) });
    busy = true;
  } catch {}
  assert(!busy, `${name} port is occupied; stop it before this suite`);
  const file = join(temp, name + ".db");
  if (!logs.has(name)) {
    const db = new DatabaseSync(file);
    for (const migration of ["001_init.sql", "002_growth_hub_v2.sql"])
      db.exec(
        await readFile(
          join(root, "apps", name, "prisma/migrations", migration),
          "utf8",
        ),
      );
    db.close();
  }
  logs.set(name, "");
  const child = spawn("pnpm", ["--filter", name, "start"], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      DEMO_PRODUCTION: demo ? "1" : "",
      V2_DATABASE_PATH: file,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (b) =>
      logs.set(name, (logs.get(name) + b).slice(-20000)),
    );
  await waitFor(async () => {
    if (child.exitCode !== null || child.signalCode !== null)
      throw Error(logs.get(name));
    return (await fetch(portOrigin + "/api/v2/health")).ok;
  }, `${name} readiness`);
  return child;
}
async function request(
  name,
  path,
  {
    data,
    profile = "solo",
    key = randomUUID(),
    expected = 200,
    raw = false,
    headers = {},
  } = {},
) {
  const response = await fetch(origin(name) + "/api/v2/" + path, {
    method: data ? "POST" : "GET",
    headers: {
      Origin: origin(name),
      "Content-Type": "application/json",
      ...(cookies.has(`${name}:${profile}`)
        ? { cookie: cookies.get(`${name}:${profile}`) }
        : {}),
      "Idempotency-Key": key,
      ...headers,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body = raw ? await response.text() : await response.json();
  assert.equal(
    response.status,
    expected,
    `${name}/${path}: ${JSON.stringify(body)}`,
  );
  return { response, body };
}
async function session(name, profile) {
  const result = await request(name, "session", {
    data: { subjectId: subject(profile) },
    profile,
  });
  cookies.set(
    `${name}:${profile}`,
    result.response.headers.get("set-cookie").split(";")[0],
  );
  return result;
}
async function action(
  name,
  op,
  data,
  profile = "solo",
  expected = 201,
  key = randomUUID(),
) {
  return (
    await request(name, "actions/" + op, { data, profile, expected, key })
  ).body.result;
}
async function syncAll() {
  for (let round = 0; round < 3; round++) {
    const results = await relayOnce();
    if (results.every((r) => !r.ok || r.pending === 0)) return;
  }
  throw Error("Persistent pending event deliveries");
}
const evidence = [];
try {
  for (const name of selected) {
    await start(name);
    assert.equal((await request(name, "health")).body.schemaVersion, 2);
    assert.equal((await fetch(origin(name) + "/v2")).status, 200);
    await session(name, "solo");
    const noOrigin = await fetch(origin(name) + "/api/v2/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId: subject("admin") }),
    });
    assert.equal(noOrigin.status, 403);
  }
  if (selected.length === 1) {
    await action(selected[0], "project.create", {
      title: "http solo flow",
      problem: "A real local save action",
      audience: "Teachers",
      stage: "idea",
      country: "KZ",
    });
    evidence.push("Founder API writes and correct session/origin checks");
  } else {
    for (const [name, profiles] of [
      ["school-portal", ["teacher", "admin", "reviewer"]],
      [
        "founder-studio",
        ["teacher", "school-founder", "reviewer", "expert-research"],
      ],
      ["growth-engine", ["school-founder"]],
      ["school-league", ["reviewer", "coordinator"]],
      ["global-dashboard", ["coordinator"]],
    ])
      for (const profile of profiles) await session(name, profile);
    const portal = "school-portal",
      studio = "founder-studio",
      growth = "growth-engine",
      league = "school-league",
      dashboard = "global-dashboard";
    const org = await action(
      portal,
      "institution.create",
      {
        title: "http demo academy",
        type: "school",
        country: "KZ",
        website: "https://example.org",
        language: "ru",
        timezone: "Asia/Qyzylorda",
        resources: "Fictional local pilot resources",
        consent: true,
      },
      "teacher",
    );
    await action(
      portal,
      "institution.verify",
      {
        institutionId: org.id,
        verificationStatus: "verified",
        source: "Independent local demo fixture review",
      },
      "reviewer",
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
      ].map((k) => [k, `Agreed demo ${k}, no external legal claim`]),
    );
    const doc = await action(
      portal,
      "document.create",
      { institutionId: org.id, type: "memorandum", ...fields },
      "teacher",
    );
    await action(
      portal,
      "document.transition",
      {
        documentId: doc.id,
        status: "signed",
        signedEvidence: "Cannot skip review",
      },
      "teacher",
      409,
    );
    for (const status of ["internal_review", "institution_review", "agreed"])
      await action(
        portal,
        "document.transition",
        { documentId: doc.id, status },
        "teacher",
      );
    await action(
      portal,
      "document.transition",
      {
        documentId: doc.id,
        status: "signed",
        signedEvidence: "Authorized counterparty confirmation fixture",
      },
      "admin",
    );
    const cohort = await action(
      portal,
      "cohort.create",
      {
        institutionId: org.id,
        documentId: doc.id,
        title: "http demo cohort",
        program: "residency-4w",
        startAt: "2026-11-15T10:00:00Z",
        endAt: "2026-12-15T10:00:00Z",
        coordinatorId: subject("teacher"),
        teacherId: subject("teacher"),
        loadMinutes: 360,
        budgetMinor: 0,
        currency: "KZT",
        criteria: "Saved artifacts and a checked prototype",
        consent: true,
      },
      "teacher",
    );
    await action(
      portal,
      "cohort.enroll",
      { cohortId: cohort.id, subjectId: subject("solo"), consent: true },
      "teacher",
    );
    await action(
      portal,
      "cohort.start",
      {
        cohortId: cohort.id,
        confirmation: "Actual first demo session confirmed",
      },
      "teacher",
    );
    await syncAll();
    const input = {
        title: "http orbit prototype",
        problem: "Collect useful feedback",
        audience: "Teachers",
        stage: "prototype",
        country: "KZ",
        institutionId: org.id,
        cohortId: cohort.id,
      },
      key = randomUUID();
    const p = await action(studio, "project.create", input, "solo", 201, key);
    assert.equal(
      (await action(studio, "project.create", input, "solo", 201, key)).id,
      p.id,
    );
    await request(studio, "records/project/" + p.id, {
      profile: "school-founder",
      expected: 404,
    });
    const material = await action(studio, "mission.submit", {
      projectId: p.id,
      missionId: "trial",
      artifact: "One observed difficulty, saved persistently",
      source: "Local observation fixture",
      limitations: "One preliminary observation",
    });
    assert.equal(
      (await request(studio, "records/submission/" + material.id)).body.record
        .data.artifact,
      "One observed difficulty, saved persistently",
    );
    const version = await action(studio, "prototype.save", {
      projectId: p.id,
      route: "existing",
      brief: {
        user: "Teacher",
        task: "Save feedback",
        actions: "Enter, save, reload",
        data: "Feedback",
        constraints: "No contacts",
        errors: "Empty input explained",
        acceptance: "Saved text survives reload",
      },
      url: "https://example.org/prototype",
      change: "Initial functional form",
    });
    const checks = Object.fromEntries(
      [
        "main_path",
        "empty_input",
        "invalid_input",
        "save",
        "reopen",
        "unavailable",
        "recovery",
      ].map((k) => [
        k,
        {
          status: "passed",
          expected: "Specified behavior",
          observed: "Human-recorded demo observation",
          reproduce: "Repeat the documented flow",
        },
      ]),
    );
    await action(studio, "prototype.check", {
      projectId: p.id,
      prototypeId: version.id,
      checks,
    });
    const experiment = await action(studio, "experiment.create", {
      projectId: p.id,
      hypothesis: "The action is clear",
      target: "Teachers",
      role: "teacher",
      language: "ru",
      minAge: 18,
      maxAge: 100,
      task: "Save one entry",
      format: "usability",
      deadline: "2026-12-01T00:00:00Z",
    });
    await action(
      studio,
      "tester.profile",
      {
        role: "teacher",
        language: "ru",
        age: 25,
        interests: "education",
        experience: "Teaching fixture",
        consent: true,
      },
      "teacher",
    );
    await action(
      studio,
      "experiment.apply",
      { experimentId: experiment.id },
      "teacher",
    );
    await action(
      studio,
      "experiment.respond",
      {
        experimentId: experiment.id,
        original: "I could not find save",
        completed: false,
        difficulty: "Action unclear",
        permission: true,
      },
      "teacher",
    );
    await action(studio, "experiment.decide", {
      experimentId: experiment.id,
      decision: "change",
      assumed: "Clear action",
      learned: "Action was missed",
      changed: "Make it visible",
      limitations: "One teacher",
      nextStep: "Retest",
    });
    await action(studio, "project.visibility", {
      projectId: p.id,
      visibility: "public",
      consent: true,
    });
    await syncAll();
    await action(
      portal,
      "cohort.project",
      { cohortId: cohort.id, projectId: p.id },
      "teacher",
    );
    evidence.push(
      "Institution agreement → enrolled solo founder → saved mission → prototype checks → negative SIGNAL response and decision",
    );
    const campaign = await action(growth, "campaign.create", {
      title: "http pilot testers",
      projectId: p.id,
      country: "KZ",
      goal: "testers",
      audience: "teacher",
      minAge: 18,
      language: "ru",
      description: "Try a local prototype",
      advantages: "Saved form works",
      limitations: "Local demo only",
      cta: "Volunteer to test",
      channels: "manual_export",
      dailyLimit: 5,
      spendLimitMinor: 0,
    });
    await action(growth, "campaign.approve", {
      campaignId: campaign.id,
      approvedRecipients: "",
    });
    const landing = await request(
      growth,
      `landing/${campaign.id}?source=${campaign.data.source}`,
      { raw: true },
    );
    assert(landing.body.includes('name="response"'));
    const application = {
      visitorToken: randomUUID(),
      nickname: "TeacherTest42",
      response: "I volunteer to try the form",
      consent: true,
      source: campaign.data.source,
    };
    const lead = (
      await request(growth, "landing/" + campaign.id, {
        data: application,
        expected: 201,
      })
    ).body;
    assert.equal(
      (
        await request(growth, "landing/" + campaign.id, {
          data: { ...application, source: "direct" },
          expected: 201,
        })
      ).body.id,
      lead.id,
    );
    const content = await action(growth, "content.create", {
      campaignId: campaign.id,
      title: "http reel story",
      storyboard: {
        hook: "One useful action",
        script: "Show a prototype and a test",
        shots: "Own recording",
        onScreen: "A useful change",
        subtitles: "Manual text",
        cover: "Prototype",
        caption: "Small local test",
        cta: "Volunteer",
      },
      rights: "Own fictional demo assets",
      snapshotId: "",
    });
    const exported = await action(growth, "content.export", {
      contentId: content.id,
    });
    assert(
      JSON.parse(
        (
          await request(growth, "artifacts/" + exported.artifactId, {
            raw: true,
          })
        ).body,
      ).notVideo,
    );
    const render = await action(growth, "content.render", {
      contentId: content.id,
    });
    assert.equal(render.data.errorCode, "renderer_not_connected");
    evidence.push(
      "Marketing landing → deduplicated voluntary lead → real storyboard export; unavailable video renderer reports failure",
    );
    const expertProfileId = subject("expert-research-profile");
    await action(
      studio,
      "expert.review",
      {
        expertProfileId,
        status: "approved",
        reviewEvidence: "Independent fictional qualification review",
      },
      "reviewer",
    );
    const offer = await action(
      studio,
      "offer.create",
      {
        title: "http research review",
        skill: "research",
        stage: "prototype",
        language: "ru",
        format: "short_session",
        priceMinor: 500,
        capacity: 1,
      },
      "expert-research",
    );
    const startAt = new Date(Date.now() + 2 * 86400000).toISOString(),
      endAt = new Date(Date.parse(startAt) + 1800000).toISOString();
    const slot = await action(
      studio,
      "availability.create",
      { offerId: offer.id, startAt, endAt, timezone: "Asia/Qyzylorda" },
      "expert-research",
    );
    await action(studio, "wallet.demo_credit", {
      amountMinor: 5000,
      reference: randomUUID(),
    });
    const bookingInput = {
        projectId: p.id,
        slotId: slot.id,
        timezone: "Asia/Qyzylorda",
        brief: "Prototype and prior attempts",
        question: "How to improve a test?",
        materials: "Local fixture",
        funding: "service_credit",
      },
      bookingKey = randomUUID();
    const booking = await action(
      studio,
      "booking.hold",
      bookingInput,
      "solo",
      201,
      bookingKey,
    );
    assert.equal(
      (
        await action(
          studio,
          "booking.hold",
          bookingInput,
          "solo",
          201,
          bookingKey,
        )
      ).id,
      booking.id,
    );
    await action(studio, "booking.confirm", { bookingId: booking.id });
    await action(studio, "booking.cancel", {
      bookingId: booking.id,
      reason: "Release local demo reservation",
    });
    evidence.push(
      "Reviewed expert → price/rules/brief hold → idempotent booking → confirmation → refund",
    );
    const proof = await action(league, "evidence.submit", {
      projectId: p.id,
      title: "http functional check",
      description: "Observed local prototype checks",
      sourceType: "document_review",
      sourceRef: version.id,
      url: "https://example.org/proof",
      consent: true,
      sensitive: false,
    });
    await action(
      league,
      "evidence.review",
      {
        evidenceId: proof.id,
        verificationStatus: "verified",
        reason: "Independent saved artifact review",
        method: "document_review",
      },
      "reviewer",
    );
    const period = {
      periodStart: "2026-11-01T00:00:00Z",
      periodEnd: "2026-12-01T00:00:00Z",
    };
    const metric = await action(league, "metric.submit", {
      projectId: p.id,
      evidenceId: proof.id,
      metricKey: "tests",
      value: 1,
      unit: "count",
      ...period,
      aggregation: "period",
      visibility: "public",
      consent: true,
    });
    assert.equal(metric.data.verificationStatus, "self_reported");
    await action(
      league,
      "metric.review",
      {
        metricId: metric.id,
        verificationStatus: "verified",
        reason: "Original local test reviewed",
      },
      "reviewer",
    );
    const season = await action(
      league,
      "season.create",
      {
        scope: "*",
        title: "http demo season",
        ...period,
        eligibilityPolicy: "Prototype individual, reviewed evidence",
        category: "individual",
        stage: "prototype",
        country: "KZ",
      },
      "coordinator",
    );
    await action(
      league,
      "season.transition",
      { seasonId: season.id, status: "registration" },
      "coordinator",
    );
    const entry = await action(league, "season.enter", {
      seasonId: season.id,
      projectId: p.id,
    });
    await action(
      league,
      "season.transition",
      { seasonId: season.id, status: "active" },
      "coordinator",
    );
    await action(
      league,
      "evaluation.submit",
      {
        entryId: entry.id,
        ratings: [4, 3, 2, 3, 4],
        evidenceRefs: [proof.id],
        reason: "Five criteria reviewed",
        noConflict: true,
      },
      "reviewer",
    );
    await action(
      league,
      "season.transition",
      { seasonId: season.id, status: "review" },
      "coordinator",
    );
    const snapshot = await action(
      league,
      "season.freeze",
      { seasonId: season.id },
      "coordinator",
    );
    assert.equal(snapshot.data.rows[0].score, 76.25);
    await syncAll();
    const countries = (await request(dashboard, "countries")).body;
    assert.equal(countries.global.projects, 1);
    assert.equal(countries.global.localParticipants, 1);
    assert.equal(countries.global.upstreamVerifiedParticipants, 0);
    const pack = await action(
      dashboard,
      "evidence_pack.create",
      {
        country: "KZ",
        ...period,
        dataMode: "demo",
        acknowledgeDemo: true,
        teacherWorkload: "Recorded fictional workload",
        resources: "Fictional pilot resources",
        pilotPlan: "One class, one coordinator, one limited test",
        limitations: "Demo only, no verified real upstream activation",
        consent: true,
      },
      "coordinator",
    );
    const exportedPack = JSON.parse(
      (await request(dashboard, "evidence-packs/" + pack.id, { raw: true }))
        .body,
    );
    assert.equal(exportedPack.snapshotIds[0], snapshot.id);
    assert.equal(exportedPack.metrics[0].id, metric.id);
    assert.equal(exportedPack.dataMode, "demo");
    await request(dashboard, `evidence-packs/${pack.id}?format=csv`, {
      raw: true,
    });
    await request(dashboard, `evidence-packs/${pack.id}?format=html`, {
      raw: true,
    });
    await action(studio, "project.visibility", {
      projectId: p.id,
      visibility: "private",
      consent: false,
    });
    await syncAll();
    await request(dashboard, "evidence-packs/" + pack.id, { expected: 410 });
    evidence.push(
      "Reviewed evidence → V2 frozen 76.25 score → deduplicated country projection → labelled JSON/CSV/print pack → consent revocation blocks export",
    );
  }
  const founderChild = children.find(
    (_, index) => selected[index] === "founder-studio",
  );
  if (founderChild) {
    await stop(founderChild);
    await start("founder-studio", false);
    await request("founder-studio", "session", {
      data: { subjectId: subject("admin") },
      expected: 503,
    });
    const legacy = await fetch(origin("founder-studio") + "/api/session", {
      method: "POST",
      headers: {
        Origin: origin("founder-studio"),
        "Content-Type": "application/json",
        Cookie: "demo-role-founder-studio=admin",
      },
      body: "{}",
    });
    assert.equal(legacy.status, 503);
    evidence.push(
      "Normal production build rejects both V2 demo sessions and legacy role-cookie endpoints",
    );
  }
  console.log(
    JSON.stringify(
      { status: "PASS", isolatedDatabases: true, externalSends: 0, evidence },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  for (const [name, output] of logs) console.error(name + " logs:\n" + output);
  throw error;
} finally {
  for (const child of children.reverse()) await stop(child).catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
