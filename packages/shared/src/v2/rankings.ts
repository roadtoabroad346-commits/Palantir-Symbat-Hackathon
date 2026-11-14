import {
  insist,
  type Actor,
  type Data,
  type EventV2,
  type RecordV2,
} from "./types";
import { Store, timestamp } from "./store";
import { hasRole, own, requireRole } from "./access";
import {
  bool,
  choice,
  integer,
  iso,
  list,
  period,
  publicText,
  safeUrl,
  text,
} from "./validation";
import { projection } from "./events";

export const POLICY = {
  version: "project-v2.0",
  weights: [20, 25, 25, 20, 10],
  criteria: [
    "problem_research",
    "prototype_function",
    "user_test",
    "change_learning",
    "next_action",
  ],
  tieRule: "competition",
  institution: {
    quality: 0.6,
    completion: 0.25,
    w2: 0.15,
    minProjects: 3,
    minParticipants: 10,
  },
};
export function scoreV2(ratings: number[]) {
  insist(
    ratings.length === 5 &&
      ratings.every((v) => Number.isInteger(v) && v >= 0 && v <= 4),
    "invalid_ratings",
    "Five integer ratings 0–4 required",
  );
  return ratings.reduce((sum, r, i) => sum + (POLICY.weights[i] * r) / 4, 0);
}
export function ranked(rows: Data[]) {
  let last: number | undefined,
    rank = 0;
  return [...rows]
    .sort((a, b) => b.score - a.score || a.projectId.localeCompare(b.projectId))
    .map((r, index) => {
      if (r.score !== last) rank = index + 1;
      last = r.score;
      return { ...r, rank };
    });
}
export function retentionW2(
  people: { id: string; activatedAt: string; actions: string[] }[],
  asOf: string,
) {
  const matured = people.filter(
    (p) => Date.parse(p.activatedAt) + 14 * 86400000 <= Date.parse(asOf),
  );
  const returned = matured.filter((p) =>
    p.actions.some(
      (t) =>
        Date.parse(t) - Date.parse(p.activatedAt) >= 7 * 86400000 &&
        Date.parse(t) - Date.parse(p.activatedAt) < 14 * 86400000,
    ),
  );
  return {
    numerator: returned.length,
    denominator: matured.length,
    value: matured.length ? (100 * returned.length) / matured.length : null,
  };
}
export function currentProject(store: Store, id: string, mode: string) {
  return projection(store, id, ["project.updated", "project.revoked"], mode);
}
export function permittedProject(store: Store, id: string, mode: string) {
  const p = currentProject(store, id, mode);
  return (
    p.type === "project.updated" &&
    p.payload.consent === true &&
    p.payload.visibility === "public" &&
    !p.payload.revoked
  );
}
export function metricValidation(d: Data) {
  const p = period(d),
    key = choice(d, "metricKey", [
      "interviews",
      "tests",
      "pilots",
      "applications",
      "qualified_applications",
      "users",
      "customers",
      "revenue",
      "expenses",
      "conversion",
      "projects_created",
      "projects_checked",
      "projects_published",
      "program_completion",
    ]);
  const value = typeof d.value === "number" ? d.value : Number(d.value);
  insist(
    Number.isFinite(value) && value >= 0 && value <= 1e12,
    "invalid_metric",
    "Finite nonnegative metric required",
  );
  const unit = text(d, "unit", 30);
  let numerator: number | null = null,
    denominator: number | null = null;
  if (key === "conversion") {
    numerator = integer(d, "numerator");
    denominator = integer(d, "denominator", 1);
    insist(
      numerator <= denominator &&
        Math.abs(value - (100 * numerator) / denominator) < 0.000001,
      "invalid_ratio",
      "Ratio must match numerator/denominator",
    );
  }
  if (["revenue", "expenses"].includes(key))
    insist(
      /^[A-Z]{3}$/.test(text(d, "currency", 3)),
      "currency_required",
      "ISO currency required",
    );
  return {
    metricKey: key,
    value,
    unit,
    numerator,
    denominator,
    ...p,
    currency: d.currency ?? null,
    aggregation: choice(d, "aggregation", ["period", "cumulative"], "period"),
  };
}
function projectAccess(store: Store, actor: Actor, id: string) {
  const p = currentProject(store, id, actor.mode);
  insist(
    p.payload.ownerFounderId === actor.id ||
      hasRole(
        actor,
        ["platform_admin", "moderator", "coordinator"],
        p.payload.institutionId ?? id,
      ),
    "forbidden",
    "Project scope required",
    403,
  );
  return p;
}
function publicRows(store: Store, snapshot: RecordV2) {
  return snapshot.data.rows.filter(
    (r: Data) =>
      permittedProject(store, r.projectId, snapshot.mode) &&
      r.evidenceRefs.every((id: string) => {
        const e = store.get(id, "evidence");
        return (
          e.data.verificationStatus === "verified" &&
          e.data.consent === true &&
          !e.data.sensitive
        );
      }),
  );
}
function emitMetric(store: Store, actor: Actor, m: RecordV2) {
  const p = m.data,
    evidence = store.get(p.evidenceId, "evidence");
  store.emit(
    "metric.updated",
    actor,
    m,
    {
      projectId: p.projectId,
      institutionId: p.institutionId,
      country: p.country,
      metricKey: p.metricKey,
      value: p.value,
      unit: p.unit,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      sourceType: p.sourceType,
      sourceRef: p.sourceRef,
      evidenceId: p.evidenceId,
      verificationStatus: p.verificationStatus,
      revision: p.revision,
      supersededBy: p.supersededBy ?? null,
      consent:
        p.consent &&
        evidence.data.consent &&
        !evidence.data.sensitive &&
        evidence.data.verificationStatus === "verified",
      visibility: m.visibility,
    },
    ["global-dashboard", "founder-studio"],
    p.verificationStatus,
  );
}
export function rankingMutate(
  store: Store,
  actor: Actor,
  op: string,
  d: Data,
): Data | undefined {
  if (op === "institution.rank") {
    const institutionId = text(d, "institutionId", 160);
    requireRole(
      actor,
      ["platform_admin", "moderator", "coordinator"],
      institutionId,
    );
    const season = store.get(text(d, "seasonId", 160), "season_v2");
    insist(
      season.mode === actor.mode &&
        ["frozen", "archived"].includes(season.data.status),
      "season_not_frozen",
      "Frozen season required",
      409,
    );
    const asOf = iso(d, "asOf");
    insist(
      asOf <= timestamp(),
      "future_asof",
      "Cannot report future retention",
    );
    const snapshot = store.get(season.data.snapshotId, "ranking_snapshot"),
      rows = snapshot.data.rows.filter(
        (r: Data) => r.institutionId === institutionId,
      );
    const cohorts = store
      .projections("school-portal")
      .filter(
        (e) =>
          e.type === "cohort.updated" &&
          e.dataMode === actor.mode &&
          e.payload.institutionId === institutionId,
      );
    const participantIds = [
      ...new Set<string>(
        cohorts.flatMap((e) => e.payload.participantIds ?? []),
      ),
    ];
    const projects = store
      .projections("founder-studio")
      .filter(
        (e) =>
          e.type === "project.updated" &&
          e.dataMode === actor.mode &&
          e.payload.institutionId === institutionId,
      );
    const people = new Map<
      string,
      { id: string; activatedAt: string; actions: string[] }
    >();
    for (const p of projects) {
      const id = p.payload.ownerFounderId;
      if (!participantIds.includes(id) || !p.payload.activatedAt) continue;
      const previous = people.get(id);
      people.set(id, {
        id,
        activatedAt:
          previous && previous.activatedAt < p.payload.activatedAt
            ? previous.activatedAt
            : p.payload.activatedAt,
        actions: [
          ...(previous?.actions ?? []),
          ...(p.payload.meaningfulActionDates ?? []),
        ],
      });
    }
    const w2 = retentionW2([...people.values()], asOf),
      completed = new Set(
        store
          .list("metric", actor.mode)
          .filter(
            (m) =>
              m.data.metricKey === "program_completion" &&
              m.data.value > 0 &&
              m.data.verificationStatus === "verified" &&
              m.data.institutionId === institutionId,
          )
          .map(
            (m) =>
              projects.find((p) => p.entityRef === m.data.projectId)?.payload
                .ownerFounderId,
          )
          .filter((id) => participantIds.includes(id)),
      );
    const completion = participantIds.length
        ? (100 * completed.size) / participantIds.length
        : null,
      quality = rows.length
        ? rows.reduce((sum: number, r: Data) => sum + r.score, 0) / rows.length
        : null;
    const enough =
      rows.length >= POLICY.institution.minProjects &&
      participantIds.length >= POLICY.institution.minParticipants;
    const score =
      enough && quality !== null && completion !== null && w2.value !== null
        ? 0.6 * quality + 0.25 * completion + 0.15 * w2.value
        : null;
    return store.create(
      "institution_ranking",
      actor,
      {
        institutionId,
        seasonId: season.id,
        snapshotId: snapshot.id,
        policyVersion: POLICY.version,
        asOf,
        participantIds,
        projectIds: rows.map((r: Data) => r.projectId),
        projectCount: rows.length,
        participantCount: participantIds.length,
        averageProjectScore: quality,
        completionRate: completion,
        completionNumerator: completed.size,
        completionDenominator: participantIds.length,
        w2Retention: w2.value,
        w2Numerator: w2.numerator,
        w2Denominator: w2.denominator,
        institutionScore: score,
        status: !enough
          ? "provisional"
          : score === null
            ? "insufficient_matured_retention_data"
            : "eligible",
        reason: text(d, "reason"),
        consent: true,
        sourceRefs: [snapshot.id, ...cohorts.map((e) => e.eventId)],
      },
      { scope: institutionId, visibility: "public" },
    );
  }
  if (op === "evidence.submit") {
    const projectId = text(d, "projectId", 160);
    const p = projectAccess(store, actor, projectId);
    insist(
      d.sourceType !== "authenticated_upstream",
      "upstream_not_connected",
      "Authenticated upstream provider is not connected",
      503,
    );
    if (d.sourceType === "first_party_event") {
      const ref = text(d, "sourceRef", 2000),
        source = store.one(
          "SELECT envelope FROM v2_inbox WHERE eventId=? UNION ALL SELECT envelope FROM v2_event WHERE eventId=?",
          ref,
          ref,
        );
      insist(
        source && JSON.parse(source.envelope).entityRef === projectId,
        "invalid_source",
        "First-party event must exist and reference this project",
      );
    }
    return store.create(
      "evidence",
      actor,
      {
        projectId,
        institutionId: p.payload.institutionId ?? null,
        title: publicText(d, "title"),
        description:
          bool(d, "consent") && !bool(d, "sensitive")
            ? publicText(d, "description", 8000)
            : text(d, "description", 8000),
        sourceType: choice(d, "sourceType", [
          "first_party_event",
          "authenticated_upstream",
          "document_review",
          "reviewer_confirmation",
          "external_reference",
        ]),
        sourceRef: text(d, "sourceRef", 2000),
        url: safeUrl(d.url, true),
        verificationStatus: "pending",
        consent: bool(d, "consent"),
        sensitive: bool(d, "sensitive"),
      },
      { scope: p.payload.institutionId ?? projectId },
    );
  }
  if (op === "evidence.review") {
    const e = store.get(text(d, "evidenceId", 160), "evidence");
    requireRole(actor, ["moderator", "platform_admin"], e.scope);
    const p = currentProject(store, e.data.projectId, actor.mode);
    insist(
      actor.mode === e.mode &&
        actor.id !== e.owner &&
        actor.id !== p.payload.ownerFounderId,
      "self_verification",
      "Independent reviewer required",
      403,
    );
    insist(
      d.method !== "authenticated_upstream",
      "upstream_not_connected",
      "Authenticated upstream provider is not connected",
      503,
    );
    const updated = store.update(
      e,
      {
        ...e.data,
        verificationStatus: choice(d, "verificationStatus", [
          "verified",
          "rejected",
          "revoked",
        ]),
        reason: text(d, "reason"),
        verifiedBy: actor.id,
        verifiedAt: timestamp(),
        method: choice(d, "method", [
          "document_review",
          "reviewer_confirmation",
          "external_reference",
          "authenticated_upstream",
          "first_party_event",
        ]),
      },
      e.data.consent && !e.data.sensitive ? "public" : "private",
    );
    store.emit(
      "evidence.updated",
      actor,
      updated,
      {
        projectId: e.data.projectId,
        verificationStatus: updated.data.verificationStatus,
        consent: e.data.consent,
        sensitive: e.data.sensitive,
        sourceType: e.data.sourceType,
      },
      ["global-dashboard", "founder-studio"],
      updated.data.verificationStatus,
    );
    if (updated.data.verificationStatus !== "verified")
      for (const metric of store
        .list("metric", actor.mode)
        .filter(
          (m) =>
            m.data.evidenceId === e.id &&
            m.data.verificationStatus === "verified",
        )) {
        const revoked = store.update(metric, {
          ...metric.data,
          verificationStatus: "revoked",
          reviewReason: `Evidence ${e.id} revoked`,
          verifiedBy: actor.id,
        });
        emitMetric(store, actor, revoked);
      }
    return updated;
  }
  if (op === "evidence.visibility") {
    const e = store.get(text(d, "evidenceId", 160), "evidence");
    own(actor, e);
    const consent = bool(d, "consent");
    if (consent && !e.data.sensitive) publicText(e.data, "description", 8000);
    const updated = store.update(
      e,
      { ...e.data, consent },
      consent && !e.data.sensitive && e.data.verificationStatus === "verified"
        ? "public"
        : "private",
    );
    store.emit(
      "evidence.updated",
      actor,
      updated,
      {
        projectId: e.data.projectId,
        verificationStatus: e.data.verificationStatus,
        consent,
        sensitive: e.data.sensitive,
        sourceType: e.data.sourceType,
      },
      ["global-dashboard", "founder-studio"],
      e.data.verificationStatus,
    );
    if (!consent)
      for (const m of store
        .list("metric", actor.mode)
        .filter((m) => m.data.evidenceId === e.id)) {
        const restricted = store.update(
          m,
          { ...m.data, sourceConsentBlocked: true },
          "private",
        );
        emitMetric(store, actor, restricted);
      }
    return updated;
  }
  if (op === "metric.submit") {
    const projectId = text(d, "projectId", 160),
      p = projectAccess(store, actor, projectId),
      e = store.get(text(d, "evidenceId", 160), "evidence");
    insist(
      e.data.projectId === projectId && e.mode === actor.mode,
      "invalid_reference",
      "Evidence project mismatch",
    );
    if (d.visibility === "public")
      insist(
        e.data.consent === true && !e.data.sensitive && bool(d, "consent"),
        "consent_required",
        "Public metric requires publication permission for its evidence",
      );
    return store.create(
      "metric",
      actor,
      {
        ...metricValidation(d),
        projectId,
        institutionId: p.payload.institutionId ?? null,
        country: p.payload.country,
        sourceType: e.data.sourceType,
        sourceRef: e.data.sourceRef,
        evidenceId: e.id,
        verificationStatus: "self_reported",
        verifiedBy: null,
        consent: bool(d, "consent"),
        revision: 1,
        previousId: null,
      },
      {
        scope: p.payload.institutionId ?? projectId,
        visibility: choice(
          d,
          "visibility",
          ["private", "institution", "public"],
          "private",
        ),
      },
    );
  }
  if (op === "metric.revise") {
    const previous = store.get(text(d, "metricId", 160), "metric");
    own(actor, previous);
    const next = store.create(
      "metric",
      actor,
      {
        ...previous.data,
        ...metricValidation(d),
        verificationStatus: "pending",
        verifiedBy: null,
        revision: previous.data.revision + 1,
        previousId: previous.id,
        reason: text(d, "reason"),
      },
      { scope: previous.scope, visibility: previous.visibility },
    );
    const superseded = store.update(previous, {
      ...previous.data,
      supersededBy: next.id,
    });
    emitMetric(store, actor, superseded);
    return next;
  }
  if (op === "metric.review") {
    const m = store.get(text(d, "metricId", 160), "metric");
    requireRole(actor, ["moderator", "platform_admin"], m.scope);
    const p = currentProject(store, m.data.projectId, actor.mode);
    insist(
      actor.mode === m.mode &&
        m.owner !== actor.id &&
        p.payload.ownerFounderId !== actor.id,
      "self_verification",
      "Independent reviewer required",
      403,
    );
    const evidence = store.get(m.data.evidenceId, "evidence"),
      status = choice(d, "verificationStatus", [
        "verified",
        "rejected",
        "revoked",
      ]);
    if (status === "verified")
      insist(
        evidence.data.verificationStatus === "verified",
        "evidence_unverified",
        "Verified evidence required",
      );
    const updated = store.update(m, {
      ...m.data,
      verificationStatus: status,
      verifiedBy: actor.id,
      verifiedAt: timestamp(),
      reviewReason: text(d, "reason"),
    });
    emitMetric(store, actor, updated);
    return updated;
  }
  if (op === "season.create") {
    requireRole(
      actor,
      ["platform_admin", "coordinator"],
      text(d, "scope", 160),
    );
    const p = period(d);
    return store.create(
      "season_v2",
      actor,
      {
        title: publicText(d, "title"),
        ...p,
        policyVersion: POLICY.version,
        eligibilityPolicy: text(d, "eligibilityPolicy"),
        visibilityPolicy: "explicit_project_consent",
        status: "draft",
        roster: [],
        category: choice(d, "category", [
          "individual",
          "team",
          "delegation",
          "school",
          "college",
          "university",
        ]),
        stage: choice(d, "stage", ["idea", "mockup", "prototype", "product"]),
        country: text(d, "country", 2, true) || null,
        consent: true,
      },
      { scope: text(d, "scope", 160) },
    );
  }
  if (op === "season.transition") {
    const season = store.get(text(d, "seasonId", 160), "season_v2");
    requireRole(actor, ["platform_admin", "coordinator"], season.scope);
    const status = text(d, "status", 30),
      graph: Record<string, string> = {
        draft: "registration",
        registration: "active",
        active: "review",
        frozen: "archived",
      };
    insist(
      graph[season.data.status] === status,
      "invalid_transition",
      "Use season.freeze to freeze reviewed results",
      409,
    );
    return store.update(season, { ...season.data, status });
  }
  if (op === "season.enter") {
    const season = store.get(text(d, "seasonId", 160), "season_v2");
    insist(
      season.mode === actor.mode &&
        ["registration", "active"].includes(season.data.status),
      "season_closed",
      "Season is closed",
      409,
    );
    const projectId = text(d, "projectId", 160),
      p = projectAccess(store, actor, projectId);
    insist(
      p.payload.stage === season.data.stage &&
        (!season.data.country || p.payload.country === season.data.country),
      "ineligible",
      "Stage/country does not match season",
    );
    const enrollment = store
      .projections("school-portal")
      .find(
        (e) =>
          e.type === "cohort.updated" &&
          e.dataMode === actor.mode &&
          e.entityRef === p.payload.cohortId &&
          e.payload.institutionId === p.payload.institutionId &&
          e.payload.participantIds?.includes(p.payload.ownerFounderId),
      );
    const primaryInstitutionId = enrollment ? p.payload.institutionId : null;
    if (["individual", "team"].includes(season.data.category))
      insist(
        (p.payload.entrantType ?? "individual") === season.data.category,
        "ineligible",
        "Individual and team project categories are separate",
      );
    const old = store
      .list("season_entry", actor.mode)
      .find(
        (r) => r.data.seasonId === season.id && r.data.projectId === projectId,
      );
    if (old) return old;
    return store.create(
      "season_entry",
      actor,
      {
        seasonId: season.id,
        projectId,
        primaryInstitutionId,
        affiliations: p.payload.affiliations ?? [],
        category: season.data.category,
        stage: p.payload.stage,
        ownerFounderId: p.payload.ownerFounderId,
        country: p.payload.country,
        eligibilityPolicy: season.data.eligibilityPolicy,
      },
      { scope: season.scope },
    );
  }
  if (op === "evaluation.submit") {
    const entry = store.get(text(d, "entryId", 160), "season_entry"),
      season = store.get(entry.data.seasonId, "season_v2");
    requireRole(actor, ["moderator", "platform_admin"], season.scope);
    insist(
      actor.id !== entry.data.ownerFounderId &&
        ["active", "review"].includes(season.data.status),
      "conflict_of_interest",
      "Independent evaluation in open season required",
      403,
    );
    const ratings = Array.isArray(d.ratings)
        ? d.ratings
        : String(d.ratings ?? "")
            .split(",")
            .map(Number),
      score = scoreV2(ratings);
    const evidenceRefs = list(d, "evidenceRefs");
    insist(
      evidenceRefs.length >= 1,
      "evidence_required",
      "Evidence required for rubric",
    );
    for (const id of evidenceRefs) {
      const e = store.get(id, "evidence");
      insist(
        e.mode === actor.mode &&
          e.data.projectId === entry.data.projectId &&
          e.data.verificationStatus === "verified",
        "evidence_unverified",
        "Verified project evidence required",
      );
    }
    insist(
      bool(d, "noConflict"),
      "conflict_of_interest",
      "Conflict declaration required",
    );
    return store.create(
      "evaluation_v2",
      actor,
      {
        entryId: entry.id,
        seasonId: season.id,
        projectId: entry.data.projectId,
        ratings,
        score,
        evidenceRefs,
        policyVersion: POLICY.version,
        reason: text(d, "reason"),
        aiRecommendation: null,
        method: "human_rubric",
        noConflict: true,
      },
      { scope: season.scope },
    );
  }
  if (op === "season.freeze") {
    const season = store.get(text(d, "seasonId", 160), "season_v2");
    requireRole(actor, ["platform_admin", "coordinator"], season.scope);
    insist(
      season.mode === actor.mode && season.data.status === "review",
      "season_closed",
      "Season must be in review",
      409,
    );
    const rows = calculateRows(store, season);
    insist(
      rows.length > 0,
      "insufficient_data",
      "Недостаточно подтверждённых данных / Insufficient verified data",
    );
    const snapshot = store.create(
      "ranking_snapshot",
      actor,
      {
        seasonId: season.id,
        policyVersion: season.data.policyVersion,
        ...{
          periodStart: season.data.periodStart,
          periodEnd: season.data.periodEnd,
        },
        rows: ranked(rows),
        frozen: true,
        revision: 1,
        previousSnapshotId: null,
        consent: true,
        sources: rows.flatMap((r) => r.evidenceRefs),
        frozenAt: timestamp(),
        policy: POLICY,
      },
      { scope: season.scope, visibility: "public" },
    );
    store.update(season, {
      ...season.data,
      status: "frozen",
      snapshotId: snapshot.id,
      roster: store
        .list("season_entry", actor.mode)
        .filter((e) => e.data.seasonId === season.id)
        .map((e) => e.data),
    });
    emitRanking(store, actor, snapshot);
    return snapshot;
  }
  if (op === "appeal.create") {
    const snapshot = store.get(text(d, "snapshotId", 160), "ranking_snapshot");
    const projectId = text(d, "projectId", 160);
    projectAccess(store, actor, projectId);
    insist(
      snapshot.data.rows.some((r: Data) => r.projectId === projectId),
      "invalid_reference",
      "Project not in snapshot",
    );
    return store.create(
      "appeal",
      actor,
      {
        snapshotId: snapshot.id,
        projectId,
        reason: text(d, "reason"),
        evidence: text(d, "evidence"),
        status: "pending",
      },
      { scope: snapshot.scope },
    );
  }
  if (op === "appeal.resolve") {
    const appeal = store.get(text(d, "appealId", 160), "appeal");
    requireRole(actor, ["moderator", "platform_admin"], appeal.scope);
    insist(
      actor.id !== appeal.owner && appeal.data.status === "pending",
      "conflict_of_interest",
      "Independent appeal reviewer required",
      403,
    );
    const original = store.get(appeal.data.snapshotId, "ranking_snapshot"),
      accepted = bool(d, "accepted"),
      reason = text(d, "reason");
    let snapshotId = original.id;
    if (accepted) {
      const ratings = String(d.ratings ?? "")
          .split(",")
          .map(Number),
        score = scoreV2(ratings);
      const rows = original.data.rows.map((r: Data) =>
        r.projectId === appeal.data.projectId ? { ...r, score } : r,
      );
      const revision = store.create(
        "ranking_snapshot",
        actor,
        {
          ...original.data,
          rows: ranked(rows),
          revision: original.data.revision + 1,
          previousSnapshotId: original.id,
          appealId: appeal.id,
          reason,
          reviewerId: actor.id,
          revisedAt: timestamp(),
        },
        { scope: original.scope, visibility: "public" },
      );
      snapshotId = revision.id;
      emitRanking(store, actor, revision);
    }
    return store.update(appeal, {
      ...appeal.data,
      status: accepted ? "accepted" : "rejected",
      resolution: reason,
      reviewer: actor.id,
      resultSnapshotId: snapshotId,
      resolvedAt: timestamp(),
    });
  }
  if (op === "delegation.create") {
    const institutionId = text(d, "institutionId", 160);
    requireRole(
      actor,
      ["institution_representative", "coordinator", "platform_admin"],
      institutionId,
    );
    projection(store, institutionId, ["institution.updated"], actor.mode);
    return store.create(
      "delegation",
      actor,
      {
        institutionId,
        title: publicText(d, "title"),
        seasonId: text(d, "seasonId", 160),
        representativeId: actor.id,
        criteria: text(d, "criteria"),
        entries: [],
        consent: bool(d, "consent"),
      },
      { scope: institutionId },
    );
  }
  if (op === "delegation.add") {
    const delegation = store.get(text(d, "delegationId", 160), "delegation");
    requireRole(
      actor,
      ["institution_representative", "coordinator", "platform_admin"],
      delegation.scope,
    );
    const projectId = text(d, "projectId", 160),
      p = currentProject(store, projectId, actor.mode);
    insist(
      p.payload.institutionId === delegation.scope ||
        p.payload.affiliations?.includes(delegation.scope),
      "affiliation_required",
      "Project affiliation required",
    );
    const season = store.get(delegation.data.seasonId, "season_v2");
    insist(
      !["frozen", "archived"].includes(season.data.status),
      "season_closed",
      "Frozen delegation roster is immutable",
      409,
    );
    return store.update(delegation, {
      ...delegation.data,
      entries: [...new Set([...delegation.data.entries, projectId])],
    });
  }
  if (op === "ranking.read") {
    const snapshot = store.get(text(d, "snapshotId", 160), "ranking_snapshot");
    return {
      ...snapshot,
      data: { ...snapshot.data, rows: publicRows(store, snapshot) },
    };
  }
  return undefined;
}
export function calculateRows(store: Store, season: RecordV2) {
  const entries = store
      .list("season_entry", season.mode)
      .filter((e) => e.data.seasonId === season.id),
    evaluations = store.list("evaluation_v2", season.mode);
  return entries.flatMap((entry) => {
    const p = currentProject(store, entry.data.projectId, season.mode);
    if (!permittedProject(store, p.entityRef, season.mode)) return [];
    const latest = new Map<string, RecordV2>();
    for (const e of evaluations.filter((e) => e.data.entryId === entry.id)) {
      const prev = latest.get(e.owner);
      if (!prev || prev.createdAt <= e.createdAt) latest.set(e.owner, e);
    }
    const reviews = [...latest.values()].filter((e) =>
      e.data.evidenceRefs.every(
        (id: string) =>
          store.get(id, "evidence").data.verificationStatus === "verified",
      ),
    );
    if (!reviews.length) return [];
    const score =
      reviews.reduce((sum, e) => sum + e.data.score, 0) / reviews.length;
    return [
      {
        projectId: p.entityRef,
        title: p.payload.title,
        country: p.payload.country,
        institutionId: entry.data.primaryInstitutionId,
        score,
        evidenceRefs: [...new Set(reviews.flatMap((e) => e.data.evidenceRefs))],
        policyVersion: season.data.policyVersion,
        mode: season.mode,
        verificationStatus: "verified",
        consent: true,
        category: entry.data.category,
        stage: entry.data.stage,
        sampleSize: reviews.length,
      },
    ];
  });
}
function emitRanking(store: Store, actor: Actor, snapshot: RecordV2) {
  const d = snapshot.data;
  store.emit(
    "ranking.updated",
    actor,
    snapshot,
    {
      snapshotId: snapshot.id,
      seasonId: d.seasonId,
      policyVersion: d.policyVersion,
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      rows: d.rows,
      consent: true,
      revoked: false,
      frozen: true,
      sources: d.sources,
      visibility: "public",
    },
    ["global-dashboard", "founder-studio"],
    "verified",
  );
}
export function institutionStandings(store: Store, mode: Actor["mode"]) {
  const snapshots = store.list("ranking_snapshot", mode),
    orgs = store
      .projections("school-portal")
      .filter((e) => e.type === "institution.updated" && e.dataMode === mode),
    cohorts = store
      .projections("school-portal")
      .filter((e) => e.type === "cohort.updated" && e.dataMode === mode);
  return orgs.map((org) => {
    const frozen = store
      .list("institution_ranking", mode)
      .filter((r) => r.data.institutionId === org.entityRef)
      .at(-1);
    if (frozen)
      return {
        id: frozen.id,
        title: org.payload.title,
        type: org.payload.type,
        country: org.payload.country,
        ...frozen.data,
      };
    const relevant = cohorts.filter(
        (c) => c.payload.institutionId === org.entityRef,
      ),
      participants = new Set(
        relevant.flatMap((c) => c.payload.participantIds ?? []),
      );
    const projects = new Map<string, Data>();
    for (const snapshot of snapshots)
      for (const row of publicRows(store, snapshot))
        if (row.institutionId === org.entityRef)
          projects.set(row.projectId, row);
    const rows = [...projects.values()];
    return {
      institutionId: org.entityRef,
      title: org.payload.title,
      type: org.payload.type,
      country: org.payload.country,
      projectCount: rows.length,
      participantCount: participants.size,
      averageProjectScore: rows.length
        ? rows.reduce((n, r) => n + r.score, 0) / rows.length
        : null,
      completionRate: null,
      w2Retention: null,
      institutionScore: null,
      status:
        rows.length < POLICY.institution.minProjects ||
        participants.size < POLICY.institution.minParticipants
          ? "provisional"
          : "insufficient_matured_retention_data",
      policyVersion: POLICY.version,
    };
  });
}
export function latestRankings(events: EventV2[]) {
  const map = new Map<string, EventV2>();
  for (const e of events.filter((e) => e.type === "ranking.updated")) {
    const old = map.get(e.payload.seasonId);
    if (!old || old.occurredAt <= e.occurredAt) map.set(e.payload.seasonId, e);
  }
  return [...map.values()];
}
