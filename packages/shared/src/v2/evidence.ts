import { insist, type Actor, type Data, type EventV2 } from "./types";
import { Store, hash, timestamp } from "./store";
import { own, requireRole } from "./access";
import { bool, choice, period, text } from "./validation";
import { latestRankings } from "./rankings";

export function projectionHealth(store: Store) {
  const sources = ["school-portal", "founder-studio", "school-league"];
  return sources.map((source) => {
    const row = store.one(
      "SELECT MAX(receivedAt) updatedAt FROM v2_projection WHERE producer=?",
      source,
    );
    const updatedAt = row?.updatedAt ?? null;
    return {
      source,
      updatedAt,
      missing: !updatedAt,
      stale: !updatedAt || Date.now() - Date.parse(updatedAt) > 24 * 3600000,
    };
  });
}
function visibleProjects(events: EventV2[], mode: string) {
  return events.filter(
    (e) =>
      e.producer === "founder-studio" &&
      e.type === "project.updated" &&
      e.dataMode === mode &&
      e.payload.consent === true &&
      e.payload.visibility === "public" &&
      !e.payload.revoked,
  );
}
export function countryProjection(store: Store, mode: Actor["mode"]) {
  const events = store.projections(),
    projects = visibleProjects(events, mode),
    orgs = events.filter(
      (e) =>
        e.type === "institution.updated" &&
        e.dataMode === mode &&
        e.payload.verificationStatus === "verified" &&
        e.payload.consent,
    ),
    cohorts = events.filter(
      (e) =>
        e.type === "cohort.updated" &&
        e.dataMode === mode &&
        ["started", "completed"].includes(e.payload.status),
    );
  const countries = [
    ...new Set([
      ...projects.map((e) => e.payload.country),
      ...projects.map((e) => e.payload.ownerCountry ?? e.payload.country),
      ...orgs.map((e) => e.payload.country),
    ]),
  ].sort();
  const countriesData = countries.map((country) => {
    const ps = new Map(
      projects
        .filter((p) => p.payload.country === country)
        .map((p) => [p.entityRef, p]),
    );
    const os = orgs.filter((o) => o.payload.country === country);
    const cs = cohorts.filter((c) =>
      os.some((o) => o.entityRef === c.payload.institutionId),
    );
    const localPeople = new Set(
      projects
        .filter(
          (p) => (p.payload.ownerCountry ?? p.payload.country) === country,
        )
        .filter((p) => p.payload.localActivation)
        .map((p) => p.payload.ownerFounderId),
    );
    const upstreamPeople = new Set(
      projects
        .filter(
          (p) => (p.payload.ownerCountry ?? p.payload.country) === country,
        )
        .filter(
          (p) => p.verification === "verified" && p.payload.upstreamActivation,
        )
        .map((p) => p.payload.ownerFounderId),
    );
    return {
      country,
      activeInstitutions: new Set(
        os
          .filter((o) =>
            ["started", "completed", "repeat"].includes(o.payload.status),
          )
          .map((o) => o.entityRef),
      ).size,
      cohorts: new Set(cs.map((c) => c.entityRef)).size,
      localParticipants: localPeople.size,
      upstreamVerifiedParticipants: upstreamPeople.size,
      projects: ps.size,
      upstreamVerifiedPublications: [...ps.values()].filter(
        (p) => p.verification === "verified" && p.payload.upstreamPublication,
      ).length,
      projectIds: [...ps.keys()],
      participantIds: [...localPeople],
      dataMode: mode,
      verificationStatus: "mixed_see_definitions",
    };
  });
  const global = {
    projects: new Set(countriesData.flatMap((c) => c.projectIds)).size,
    localParticipants: new Set(countriesData.flatMap((c) => c.participantIds))
      .size,
    upstreamVerifiedParticipants: countriesData.reduce(
      (s, c) => s + c.upstreamVerifiedParticipants,
      0,
    ),
    upstreamVerifiedPublications: countriesData.reduce(
      (s, c) => s + c.upstreamVerifiedPublications,
      0,
    ),
    activeInstitutions: countriesData.reduce(
      (s, c) => s + c.activeInstitutions,
      0,
    ),
    cohorts: countriesData.reduce((s, c) => s + c.cohorts, 0),
  };
  return {
    schemaVersion: 2,
    dataMode: mode,
    generatedAt: timestamp(),
    countries: countriesData,
    global,
    health: projectionHealth(store),
    definitions: {
      projects:
        "Unique global project IDs; primary country only; public consent required",
      localParticipants:
        "Unique ownerFounderId with meaningful local action; multiple roles/affiliations do not duplicate people",
      upstreamVerifiedParticipants:
        "Authenticated upstream verified activation; local activation excluded",
      upstreamVerifiedPublications:
        "Authenticated upstream verified publication; local card publication excluded",
      targetParticipants: 100000,
      targetProjects: 10000,
      targetIsFact: false,
    },
    limitations: [
      "Upstream AI Startify is not connected",
      "Missing sources mean incomplete coverage, not zero performance",
      "Current projection is not reconstructed historical monthly activity",
      "Demo never enters real KPIs",
    ],
  };
}
export function evidenceMutate(
  store: Store,
  actor: Actor,
  op: string,
  d: Data,
): Data | undefined {
  if (op === "evidence_pack.create") {
    requireRole(actor, ["coordinator", "platform_admin", "partner"], actor.id);
    const p = period(d),
      country = text(d, "country", 2);
    const mode = choice(d, "dataMode", [actor.mode]);
    insist(
      mode !== "demo" || bool(d, "acknowledgeDemo"),
      "demo_export_label",
      "Для demo нужен явный demo export / Explicit demo export acknowledgment required",
    );
    const projection = countryProjection(store, actor.mode),
      countryData = projection.countries.find((c) => c.country === country);
    insist(
      countryData,
      "insufficient_data",
      "Нет разрешённых данных страны / No permitted country data",
    );
    const events = store.projections(),
      allowed = new Set(countryData.projectIds);
    const snapshots = latestRankings(
      events.filter((e) => e.dataMode === actor.mode),
    )
      .map((e) => ({
        snapshotId: e.payload.snapshotId,
        seasonId: e.payload.seasonId,
        policyVersion: e.payload.policyVersion,
        rows: e.payload.rows.filter(
          (r: Data) => allowed.has(r.projectId) && r.consent,
        ),
        periodStart: e.payload.periodStart,
        periodEnd: e.payload.periodEnd,
      }))
      .filter((s) => s.rows.length);
    const metrics = events
      .filter(
        (e) =>
          e.type === "metric.updated" &&
          e.dataMode === actor.mode &&
          e.verification === "verified" &&
          e.payload.verificationStatus === "verified" &&
          e.payload.visibility === "public" &&
          e.payload.consent &&
          !e.payload.supersededBy &&
          allowed.has(e.payload.projectId) &&
          e.payload.periodStart >= p.periodStart &&
          e.payload.periodEnd <= p.periodEnd,
      )
      .map((e) => ({ id: e.entityRef, ...e.payload }));
    const payload = {
      title: `${mode.toUpperCase()} · AI Startify Evidence Room · ${country}`,
      generatedAt: timestamp(),
      ...p,
      dataMode: mode,
      country,
      policyVersion: "evidence-v2.0",
      snapshotIds: snapshots.map((s) => s.snapshotId),
      countryData,
      metricDefinitions: projection.definitions,
      metrics,
      snapshots,
      sourceWatermarks: projection.health,
      sources: events
        .filter((e) => allowed.has(e.entityRef) || e.type === "ranking.updated")
        .map((e) => ({
          producer: e.producer,
          eventId: e.eventId,
          entityRef: e.entityRef,
          sequence: e.sequence,
          asOf: e.occurredAt,
        })),
      program:
        "4-week residency; 2×45 minutes/week; pilot scope must be agreed",
      teacherWorkload: text(d, "teacherWorkload"),
      resources: text(d, "resources"),
      pilotPlan: text(d, "pilotPlan"),
      limitations: [...projection.limitations, text(d, "limitations")],
      terms:
        "Permitted materials only. Hash proves integrity, not truth. Pilot findings do not establish effectiveness in other countries.",
      translation: "original_ru_en_manual; no automatic translation asserted",
    };
    return store.create(
      "evidence_pack",
      actor,
      {
        ...payload,
        sha256: hash(payload),
        status: "active",
        consent: bool(d, "consent"),
        projectIds: [...allowed],
      },
      { visibility: bool(d, "consent") ? "public" : "private" },
    );
  }
  if (op === "evidence_pack.revoke") {
    const pack = store.get(text(d, "packId", 160), "evidence_pack");
    own(actor, pack);
    return store.update(
      pack,
      {
        ...pack.data,
        status: "revoked",
        reason: text(d, "reason"),
        revokedAt: timestamp(),
      },
      "private",
    );
  }
  return undefined;
}
function escapeHtml(value: unknown) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function csvCell(value: unknown) {
  let s =
    typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function exportPack(
  store: Store,
  actor: Actor | null,
  id: string,
  format: string,
) {
  const pack = store.get(id, "evidence_pack");
  insist(
    pack.data.status === "active",
    "export_revoked",
    "Экспорт отозван / Export revoked",
    410,
  );
  insist(
    (pack.visibility === "public" && pack.data.consent) ||
      (actor && pack.owner === actor.id && pack.mode === actor.mode),
    "not_found",
    "Pack not found",
    404,
  );
  const allowed = new Set(
    visibleProjects(store.projections(), pack.mode).map((e) => e.entityRef),
  );
  insist(
    pack.data.projectIds.every((p: string) => allowed.has(p)),
    "export_revoked",
    "Публичное разрешение изменилось. Сформируйте новый пакет / Public permission changed; regenerate pack",
    410,
  );
  for (const metric of pack.data.metrics) {
    const event = store
      .projections("school-league")
      .find((e) => e.entityRef === metric.id);
    insist(
      event?.verification === "verified" &&
        event.payload.consent &&
        !event.payload.supersededBy,
      "export_revoked",
      "Evidence verification or permission changed",
      410,
    );
  }
  const revoked = new Set(
    store
      .projections("school-league")
      .filter(
        (e) =>
          e.type === "evidence.updated" &&
          e.payload.verificationStatus !== "verified",
      )
      .map((e) => e.entityRef),
  );
  insist(
    !pack.data.snapshots.some((snapshot: Data) =>
      snapshot.rows.some((row: Data) =>
        row.evidenceRefs.some((id: string) => revoked.has(id)),
      ),
    ),
    "export_revoked",
    "A snapshot evidence source has been revoked",
    410,
  );
  const {
    sha256: _sha,
    status: _status,
    consent: _consent,
    projectIds: _projectIds,
    ...original
  } = pack.data;
  insist(
    hash(original) === pack.data.sha256,
    "integrity_error",
    "Pack integrity check failed",
    409,
  );
  const payload: Data = {
    id: pack.id,
    ...pack.data,
    verificationURL: `/api/v2/evidence-packs/${pack.id}`,
    staleSources: projectionHealth(store)
      .filter((s) => s.stale)
      .map((s) => s.source),
  };
  if (format === "csv") {
    const columns = [
      "id",
      "title",
      "country",
      "periodStart",
      "periodEnd",
      "dataMode",
      "policyVersion",
      "snapshotIds",
      "generatedAt",
      "sha256",
      "sources",
      "limitations",
    ];
    return {
      body:
        columns.map(csvCell).join(",") +
        "\n" +
        columns
          .map((c) => csvCell(payload[c as keyof typeof payload]))
          .join(",") +
        "\n",
      contentType: "text/csv; charset=utf-8",
      filename: `evidence-${pack.mode}-${pack.id}.csv`,
    };
  }
  if (format === "html")
    return {
      body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(payload.title)}</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:auto;padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{button{display:none}}</style><h1>${escapeHtml(payload.title)}</h1><p>${escapeHtml(pack.mode)} · ${escapeHtml(payload.periodStart)} — ${escapeHtml(payload.periodEnd)}</p><p>Print this page to PDF using your browser. Hash confirms integrity, not source truth.</p><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></html>`,
      contentType: "text/html; charset=utf-8",
      filename: `evidence-${pack.mode}-${pack.id}.html`,
    };
  return {
    body: JSON.stringify(payload, null, 2),
    contentType: "application/json; charset=utf-8",
    filename: `evidence-${pack.mode}-${pack.id}.json`,
  };
}
