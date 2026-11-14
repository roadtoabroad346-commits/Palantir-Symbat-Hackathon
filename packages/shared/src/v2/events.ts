import { createHmac, timingSafeEqual } from "node:crypto";
import { APPS, insist, type App, type Data, type EventV2 } from "./types";
import { Store, timestamp } from "./store";
import { demoEnabled } from "./access";
import { institutionTitle, publicText, text } from "./validation";

const producers: Record<string, App> = {
  "identity.registered": "founder-studio",
  "project.updated": "founder-studio",
  "project.revoked": "founder-studio",
  "team.updated": "founder-studio",
  "institution.updated": "school-portal",
  "cohort.updated": "school-portal",
  "representative.updated": "school-portal",
  "metric.updated": "school-league",
  "evidence.updated": "school-league",
  "ranking.updated": "school-league",
  "ranking.revoked": "school-league",
  "campaign.updated": "growth-engine",
  "lead.qualified": "growth-engine",
  "content.published": "growth-engine",
  "commitment.updated": "challenge-platform",
  "contribution.verified": "ambassador-platform",
};
export function busKey() {
  const configured = process.env.V2_BUS_SECRET;
  insist(
    (configured && configured.length >= 32) || demoEnabled(),
    "bus_not_connected",
    "V2_BUS_SECRET (32+ characters) required",
    503,
  );
  return configured && configured.length >= 32
    ? configured
    : "local-demo-transport-never-a-production-credential";
}
export function eventHeaders(body: string) {
  const time = String(Date.now());
  return {
    "Content-Type": "application/json",
    "X-Hub-Time": time,
    "X-Hub-Signature": createHmac("sha256", busKey())
      .update(time + "." + body)
      .digest("hex"),
  };
}
export function authenticateEvent(body: string, headers: Headers) {
  const time = headers.get("x-hub-time") ?? "",
    actual = headers.get("x-hub-signature") ?? "";
  insist(
    /^\d+$/.test(time) && Math.abs(Date.now() - Number(time)) < 300000,
    "unauthorized",
    "Expired event signature",
    401,
  );
  const expected = createHmac("sha256", busKey())
    .update(time + "." + body)
    .digest("hex");
  insist(
    actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected)),
    "unauthorized",
    "Invalid event signature",
    401,
  );
}
export function validateEvent(value: Data): EventV2 {
  insist(
    value.schemaVersion === 2 && producers[value.type] === value.producer,
    "invalid_event",
    "Unknown event schema/type/producer",
  );
  for (const key of ["eventId", "subjectRef", "entityRef", "correlationId"])
    text(value, key, 160);
  insist(
    Number.isSafeInteger(value.sequence) && value.sequence > 0,
    "invalid_event",
    "Invalid sequence",
  );
  insist(
    ["demo", "pilot", "production"].includes(value.dataMode) &&
      ["self_reported", "pending", "verified", "rejected", "revoked"].includes(
        value.verification,
      ),
    "invalid_event",
    "Invalid mode/verification",
  );
  insist(
    Number.isFinite(Date.parse(value.occurredAt)),
    "invalid_event",
    "Invalid event time",
  );
  const p = value.payload;
  insist(
    p && typeof p === "object" && !Array.isArray(p),
    "invalid_event",
    "Invalid payload",
  );
  const keys: Record<string, string[]> = {
    identity: ["nickname", "country", "language"],
    team: ["title", "memberIds", "ownerFounderId", "consent", "status"],
    project: [
      "title",
      "problem",
      "audience",
      "stage",
      "ownerFounderId",
      "ownerCountry",
      "entrantType",
      "teamId",
      "country",
      "institutionId",
      "cohortId",
      "affiliations",
      "consent",
      "prototypeUrl",
      "evidenceRefs",
      "localActivation",
      "activatedAt",
      "meaningfulActionDates",
      "upstreamActivation",
      "upstreamPublication",
      "revoked",
      "visibility",
    ],
    institution: [
      "title",
      "type",
      "country",
      "website",
      "language",
      "timezone",
      "status",
      "verificationStatus",
      "consent",
      "legacyId",
    ],
    cohort: [
      "title",
      "institutionId",
      "program",
      "startAt",
      "endAt",
      "status",
      "consent",
      "participantIds",
      "projectIds",
    ],
    representative: [
      "institutionId",
      "subjectId",
      "status",
      "expiresAt",
      "confirmedBy",
    ],
    metric: [
      "supersededBy",
      "projectId",
      "institutionId",
      "country",
      "metricKey",
      "value",
      "unit",
      "periodStart",
      "periodEnd",
      "sourceType",
      "sourceRef",
      "evidenceId",
      "verificationStatus",
      "revision",
      "consent",
      "visibility",
    ],
    evidence: [
      "projectId",
      "verificationStatus",
      "consent",
      "sensitive",
      "sourceType",
    ],
    ranking: [
      "snapshotId",
      "seasonId",
      "policyVersion",
      "periodStart",
      "periodEnd",
      "rows",
      "consent",
      "revoked",
      "frozen",
      "sources",
      "visibility",
    ],
    campaign: [
      "title",
      "projectId",
      "country",
      "goal",
      "paused",
      "source",
      "consent",
    ],
    lead: ["campaignId", "projectId", "source", "status", "consent"],
    content: ["campaignId", "externalPostId", "status", "source", "consent"],
    commitment: ["projectId", "resource", "status", "dueAt", "consent"],
    contribution: [
      "subjectId",
      "institutionId",
      "cohortId",
      "evidenceId",
      "points",
      "consent",
    ],
  };
  const group = value.type.split(".")[0];
  const allowed = keys[group];
  insist(allowed, "invalid_event", "No payload schema");
  insist(
    Object.keys(p).every((k) => allowed.includes(k)),
    "invalid_event",
    "Unexpected projection fields",
  );
  if (p.title) {
    if (group === "institution") institutionTitle(p);
    else publicText(p, "title");
  }
  if (p.nickname) publicText(p, "nickname", 40);
  if (group === "ranking") {
    insist(
      Array.isArray(p.rows) && p.rows.length <= 1000,
      "invalid_event",
      "Invalid ranking rows",
    );
    for (const row of p.rows) {
      insist(
        Object.keys(row).every((k) =>
          [
            "projectId",
            "title",
            "country",
            "institutionId",
            "score",
            "rank",
            "evidenceRefs",
            "policyVersion",
            "mode",
            "verificationStatus",
            "consent",
            "category",
            "stage",
            "sampleSize",
          ].includes(k),
        ),
        "invalid_event",
        "Unexpected ranking fields",
      );
      publicText(row, "title");
      insist(
        Number.isFinite(row.score) && row.score >= 0 && row.score <= 100,
        "invalid_event",
        "Invalid score",
      );
    }
  }
  if (!demoEnabled())
    insist(value.dataMode !== "demo", "forbidden", "Demo events disabled", 403);
  return value as EventV2;
}
export function receive(store: Store, value: Data) {
  const event = validateEvent(value);
  return store.transaction(() => {
    const existing = store.one(
      "SELECT envelope FROM v2_inbox WHERE producer=? AND eventId=?",
      event.producer,
      event.eventId,
    );
    if (existing) {
      insist(
        existing.envelope === JSON.stringify(event),
        "event_conflict",
        "Event ID reused with different payload",
        409,
      );
      return { duplicate: true };
    }
    const receivedAt = timestamp();
    store.run(
      "INSERT INTO v2_inbox VALUES (?,?,?,?,?,?)",
      event.producer,
      event.eventId,
      event.entityRef,
      event.sequence,
      receivedAt,
      JSON.stringify(event),
    );
    const changed = store.run(
      "INSERT INTO v2_projection VALUES (?,?,?,?,?) ON CONFLICT(producer,entityRef) DO UPDATE SET sequence=excluded.sequence,receivedAt=excluded.receivedAt,envelope=excluded.envelope WHERE excluded.sequence>v2_projection.sequence",
      event.producer,
      event.entityRef,
      event.sequence,
      receivedAt,
      JSON.stringify(event),
    );
    if (changed.changes && event.type === "representative.updated") {
      const p = event.payload;
      for (const role of store
        .list("role_assignment", event.dataMode)
        .filter(
          (r) =>
            r.scope === p.institutionId &&
            r.data.subjectId === p.subjectId &&
            r.data.role === "institution_representative",
        ))
        store.update(role, { ...role.data, status: "revoked" });
      if (p.status === "verified" && p.expiresAt > timestamp()) {
        const actor = {
          id: event.subjectRef,
          label: "institution appointment",
          mode: event.dataMode,
          roles: [],
        };
        store.create(
          "role_assignment",
          actor,
          {
            subjectId: p.subjectId,
            role: "institution_representative",
            status: "active",
            expiresAt: p.expiresAt,
            appointmentId: event.entityRef,
          },
          { scope: p.institutionId },
        );
      }
    }
    // Identity copies are read replicas. Never import privileged role assignments.
    if (
      event.type === "identity.registered" &&
      !store.one("SELECT id FROM v2_record WHERE id=?", event.entityRef)
    ) {
      const actor = {
        id: event.entityRef,
        label: event.payload.nickname,
        mode: event.dataMode,
        roles: [],
      };
      store.create("identity", actor, event.payload, { id: event.entityRef });
      store.create("role_assignment", actor, {
        subjectId: actor.id,
        role: "founder",
        status: "active",
      });
    }
    return { duplicate: false, watermark: receivedAt };
  });
}
export async function flush(store: Store, transport: typeof fetch = fetch) {
  const rows = store.all(
    "SELECT d.*,e.envelope FROM v2_delivery d JOIN v2_event e ON e.eventId=d.eventId WHERE deliveredAt IS NULL ORDER BY e.createdAt LIMIT 60",
  );
  const results: { eventId: string; target: string; status: string }[] = [];
  const deliver = async (row: Data) => {
    insist(row.target in APPS, "invalid_target", "Unknown event target");
    try {
      const response = await transport(
        `http://127.0.0.1:${APPS[row.target as App]}/api/v2/events`,
        {
          method: "POST",
          headers: eventHeaders(row.envelope),
          body: row.envelope,
          signal: AbortSignal.timeout(4000),
          redirect: "error",
        },
      );
      insist(
        response.ok,
        "delivery_failed",
        `Target ${row.target}: HTTP ${response.status}`,
        503,
      );
      const receipt = await response.json();
      insist(
        typeof receipt.duplicate === "boolean",
        "delivery_failed",
        "Invalid receipt",
        503,
      );
      store.run(
        "UPDATE v2_delivery SET attempts=attempts+1,deliveredAt=?,lastError=NULL WHERE eventId=? AND target=?",
        timestamp(),
        row.eventId,
        row.target,
      );
      results.push({
        eventId: row.eventId,
        target: row.target,
        status: "delivered",
      });
    } catch (error) {
      store.run(
        "UPDATE v2_delivery SET attempts=attempts+1,lastError=? WHERE eventId=? AND target=?",
        (error instanceof Error ? error.message : "Delivery failed").slice(
          0,
          300,
        ),
        row.eventId,
        row.target,
      );
      results.push({
        eventId: row.eventId,
        target: row.target,
        status: "pending",
      });
    }
  };
  for (let index = 0; index < rows.length; index += 10)
    await Promise.all(rows.slice(index, index + 10).map(deliver));
  return {
    results,
    pending: Number(
      store.one("SELECT COUNT(*) n FROM v2_delivery WHERE deliveredAt IS NULL")
        ?.n ?? 0,
    ),
  };
}
export function rebuild(store: Store) {
  return store.transaction(() => {
    store.run("DELETE FROM v2_projection");
    const rows = store.all(
      "SELECT envelope,receivedAt FROM v2_inbox ORDER BY sequence",
    );
    for (const row of rows) {
      const e = JSON.parse(row.envelope) as EventV2;
      store.run(
        "INSERT INTO v2_projection VALUES (?,?,?,?,?) ON CONFLICT(producer,entityRef) DO UPDATE SET sequence=excluded.sequence,receivedAt=excluded.receivedAt,envelope=excluded.envelope WHERE excluded.sequence>v2_projection.sequence",
        e.producer,
        e.entityRef,
        e.sequence,
        row.receivedAt,
        row.envelope,
      );
    }
    return { events: rows.length, updatedAt: timestamp() };
  });
}
export function projection(
  store: Store,
  id: string,
  types: string[],
  mode: string,
) {
  const event = store
    .projections()
    .find(
      (e) =>
        e.entityRef === id && e.dataMode === mode && types.includes(e.type),
    );
  insist(
    event,
    "source_unavailable",
    "Сначала синхронизируйте источник / Sync source first",
    409,
  );
  return event;
}
