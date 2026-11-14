// Real HTTP smoke for the independent Global Impact app. Build before running.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const origin = "http://127.0.0.1:3006";
let child;
let logs = "";
async function post(path, body, cookie) {
  const response = await fetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}
try {
  let occupied = false;
  try {
    await fetch(origin, { signal: AbortSignal.timeout(500) });
    occupied = true;
  } catch {}
  assert(
    !occupied,
    "Port3006 is occupied; stop that service before this smoke test.",
  );
  child = spawn("pnpm", ["--filter", "global-dashboard", "start"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (b) => (logs = (logs + b).slice(-10000)));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(origin + "/api/data")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert(ready, "Global Impact startup timeout: " + logs);
  assert.equal((await fetch(origin)).status, 200);
  const before = await fetch(origin + "/api/data").then((r) => r.json());
  assert.equal(before.countries.length, 10);
  assert(before.countries.some((c) => c.iso === "KE"));
  assert.equal(before.globals.length, 13);
  assert.equal(before.metrics.length, 650);
  assert(before.feedback.length >= 60);
  assert(before.globals[0].users >= 4000);
  assert(before.globals[0].publishedProjects >= 567);
  assert(before.globals[12].users >= 100000);
  assert(before.globals[12].publishedProjects >= 10000);
  function sums(state) {
    for (const g of state.globals) {
      for (const [direction, key] of [
        ["growth", "users"],
        ["league", "publishedProjects"],
      ])
        assert.equal(
          state.metrics
            .filter(
              (m) => m.monthIndex === g.monthIndex && m.direction === direction,
            )
            .reduce((n, m) => n + m.primaryMetric, 0),
          g[key],
          `${direction} sums at month${g.monthIndex}`,
        );
    }
  }
  sums(before);
  const sim = await post("/api/simulate", { month: 4 });
  assert.equal(sim.response.status, 200, JSON.stringify(sim.body));
  assert(sim.body.pulses.length > 0);
  assert(sim.body.state.globals[4].users > before.globals[4].users);
  sums(sim.body.state);
  assert.deepEqual(sim.body.state.globals[3], before.globals[3]);
  assert.equal(
    (await post("/api/simulate", { month: 99 })).response.status,
    400,
  );
  const input = {
    iso: "UZ",
    direction: "ambassador",
    authorType: "ambassador",
    nickname: "OrbitSmoke77",
    category: "localization",
    lang: "en",
    text: "Please add short local lesson examples.",
  };
  assert.equal(
    (await post("/api/feedback", { ...input, nickname: "John Smith" })).response
      .status,
    400,
  );
  assert.equal(
    (
      await post("/api/feedback", {
        ...input,
        text: "Contact me at hello@example.org",
      })
    ).response.status,
    400,
  );
  const made = await post("/api/feedback", input);
  assert.equal(made.response.status, 200, JSON.stringify(made.body));
  assert(made.body.state.feedback.some((f) => f.id === made.body.feedback.id));
  const id = made.body.feedback.id;
  const voted = await post("/api/feedback/" + id, { action: "vote" });
  assert.equal(voted.response.status, 200);
  assert.equal(voted.body.state.feedback.find((f) => f.id === id).votes, 1);
  assert.equal(
    (await post("/api/feedback/" + id, { action: "status", status: "planned" }))
      .response.status,
    400,
  );
  const session = await post("/api/session", { admin: true });
  assert.equal(session.response.status, 200);
  const cookie = session.response.headers.get("set-cookie").split(";")[0];
  assert(cookie.startsWith("global-impact-admin="));
  assert.equal(
    (
      await post(
        "/api/feedback/" + id,
        { action: "status", status: "planned" },
        cookie,
      )
    ).response.status,
    200,
  );
  const csv = await fetch(origin + "/api/insights?iso=IN&lang=en");
  assert.equal(csv.status, 200);
  assert(csv.headers.get("content-type").includes("text/csv"));
  assert((await csv.text()).includes("Hindi"));
  const rejected = await fetch(origin + "/api/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.invalid",
    },
    body: JSON.stringify({ month: 0 }),
  });
  assert.equal(rejected.status, 400);
  console.log(
    "Global Impact HTTP: seeded13-month data,10countries/5directions, exact country sums, simulation/pulses, PII rejection, votes/admin triage, Origin rejection and insights CSV passed.",
  );
} catch (e) {
  console.error(e);
  if (logs) console.error(logs);
  process.exitCode = 1;
} finally {
  if (child)
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  await delay(200);
}
