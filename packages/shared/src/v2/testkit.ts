import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "./store";
import { HubService } from "./service";
import { actorFrom } from "./access";
import { DEMO_ID } from "./seed";
import { receive } from "./events";
import type { App, Data } from "./types";
export function lab(app: App) {
  const directory = mkdtempSync(join(tmpdir(), "startify-v2-")),
    file = join(directory, "demo.db");
  const store = new Store(
    app,
    file,
    readFileSync(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  store.db.exec(
    readFileSync(
      new URL(
        `../../../../apps/${app}/prisma/migrations/001_init.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const hub = new HubService(store);
  const actor = (name = "solo") => actorFrom(store, DEMO_ID(name));
  const mutate = (op: string, d: Data, name = "solo", key = randomUUID()) =>
    hub.mutate(actor(name), op, d, key);
  return {
    hub,
    store,
    file,
    actor,
    mutate,
    close() {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
export type Lab = ReturnType<typeof lab>;
export function deliver(from: Lab, to: Lab) {
  for (const row of from.store.all(
    "SELECT envelope FROM v2_event ORDER BY createdAt,sequence",
  ))
    receive(to.store, JSON.parse(row.envelope));
}
export function project(studio: Lab, extra: Data = {}) {
  return studio.mutate("project.create", {
    title: "orbit project",
    problem: "A familiar problem",
    audience: "Teachers",
    stage: "prototype",
    country: "KZ",
    ...extra,
  });
}
export function publishedProject(studio: Lab, extra: Data = {}) {
  const p = project(studio, extra);
  studio.mutate("mission.submit", {
    projectId: p.id,
    missionId: "trial",
    artifact: "A real local test material",
    source: "Personal observation",
    limitations: "Small initial sample",
  });
  studio.mutate("project.visibility", {
    projectId: p.id,
    visibility: "public",
    consent: true,
  });
  return studio.store.get(p.id);
}
export function verifiedEvidence(
  studio: Lab,
  league: Lab,
  p = publishedProject(studio),
) {
  deliver(studio, league);
  const e = league.mutate("evidence.submit", {
    projectId: p.id,
    title: "prototype check",
    description: "Human observed the main path",
    sourceType: "document_review",
    sourceRef: "local-review-material",
    url: "https://example.org/proof",
    consent: true,
    sensitive: false,
  });
  league.mutate(
    "evidence.review",
    {
      evidenceId: e.id,
      verificationStatus: "verified",
      reason: "Inspected original material",
      method: "document_review",
    },
    "reviewer",
  );
  return { project: p, evidence: league.store.get(e.id) };
}
