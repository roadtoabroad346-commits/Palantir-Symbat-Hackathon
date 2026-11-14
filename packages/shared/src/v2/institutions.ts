import { APPS, insist, type Actor, type Data, type RecordV2 } from "./types";
import { Store, timestamp } from "./store";
import { hasRole, own, requireRole } from "./access";
import {
  bool,
  choice,
  integer,
  institutionTitle,
  iso,
  publicText,
  safeUrl,
  text,
  timezone,
  transition,
} from "./validation";
const ALL_APPS = Object.keys(APPS) as (keyof typeof APPS)[];
const DOCUMENT_GRAPH = {
  draft: ["internal_review"],
  internal_review: ["institution_review", "draft"],
  institution_review: ["agreed", "draft"],
  agreed: ["signed", "draft"],
  signed: ["active", "terminated"],
  active: ["completed", "terminated"],
  completed: [],
  terminated: [],
};
const ORG_GRAPH = {
  found: ["interested", "archived"],
  interested: ["discussion", "archived"],
  discussion: ["pilot_agreed", "archived"],
  pilot_agreed: ["scheduled", "archived"],
  scheduled: ["started", "archived"],
  started: ["completed", "archived"],
  completed: ["repeat", "archived"],
  repeat: ["discussion", "scheduled"],
  archived: [],
};
export function institutionEvent(store: Store, actor: Actor, record: RecordV2) {
  const p = record.data;
  store.emit(
    "institution.updated",
    actor,
    record,
    {
      title: p.title,
      type: p.type,
      country: p.country,
      website: p.website,
      language: p.language,
      timezone: p.timezone,
      status: p.status,
      verificationStatus: p.verificationStatus,
      consent: p.consent,
      legacyId: p.legacyId ?? null,
    },
    ALL_APPS,
    p.verificationStatus,
  );
}
function orgAccess(store: Store, actor: Actor, id: string) {
  const org = store.get(id, "institution");
  insist(org.mode === actor.mode, "forbidden", "Wrong data mode", 403);
  insist(
    org.owner === actor.id ||
      hasRole(
        actor,
        [
          "platform_admin",
          "institution_admin",
          "institution_representative",
          "coordinator",
        ],
        org.id,
      ),
    "forbidden",
    "Нет полномочий организации / Institution permission required",
    403,
  );
  return org;
}
function cohortEvent(store: Store, actor: Actor, record: RecordV2) {
  const p = record.data;
  store.emit(
    "cohort.updated",
    actor,
    record,
    {
      title: p.title,
      institutionId: p.institutionId,
      program: p.program,
      startAt: p.startAt,
      endAt: p.endAt,
      status: p.status,
      consent: p.consent,
      participantIds: p.participantIds,
      projectIds: p.projectIds ?? [],
    },
    ALL_APPS,
    p.status === "started" ? "verified" : "self_reported",
  );
}
export function institutionMutate(
  store: Store,
  actor: Actor,
  op: string,
  d: Data,
): Data | undefined {
  if (op === "institution.create") {
    requireRole(
      actor,
      ["teacher", "institution_admin", "coordinator", "platform_admin"],
      d.scope ?? actor.id,
    );
    const record = store.create("institution", actor, {
      title: institutionTitle(d),
      type: choice(d, "type", ["school", "college", "university"]),
      country: choice(d, "country", [
        "KZ",
        "UZ",
        "KG",
        "IN",
        "NG",
        "PH",
        "KE",
        "TR",
        "VN",
        "ID",
      ]),
      website: safeUrl(d.website, true),
      language: choice(d, "language", ["ru", "en"]),
      timezone: timezone(d.timezone),
      status: "found",
      verificationStatus: "self_reported",
      consent: bool(d, "consent"),
      resources: text(d, "resources"),
      coordinatorId: actor.id,
    });
    store.run("UPDATE v2_record SET scope=? WHERE id=?", record.id, record.id);
    record.scope = record.id;
    // Creator can prepare a pilot; cannot verify the institution or grant representation.
    institutionEvent(store, actor, record);
    return record;
  }
  if (
    [
      "institution.status",
      "institution.verify",
      "representative.nominate",
      "partnership.create",
      "document.create",
      "cohort.create",
      "club.create",
    ].includes(op)
  ) {
    const org =
      op === "institution.verify"
        ? store.get(text(d, "institutionId", 160), "institution")
        : orgAccess(store, actor, text(d, "institutionId", 160));
    insist(org.mode === actor.mode, "forbidden", "Wrong data mode", 403);
    if (op === "institution.status") {
      const status = text(d, "status", 50);
      transition(org.data.status, status, ORG_GRAPH);
      if (status === "started")
        insist(
          store
            .list("cohort", actor.mode)
            .some((c) => c.scope === org.id && c.data.status === "started"),
          "cohort_required",
          "Нужен фактически начатый поток / Actually started cohort required",
        );
      const updated = store.update(org, {
        ...org.data,
        status,
        refusalReason: text(d, "reason", 2000, true),
      });
      institutionEvent(store, actor, updated);
      return updated;
    }
    if (op === "institution.verify") {
      requireRole(actor, ["platform_admin", "moderator"], org.id);
      insist(
        actor.id !== org.owner,
        "self_verification",
        "Нельзя подтвердить собственную организацию / Cannot verify own institution",
        403,
      );
      const updated = store.update(org, {
        ...org.data,
        verificationStatus: choice(d, "verificationStatus", [
          "verified",
          "rejected",
          "revoked",
        ]),
        verificationSource: text(d, "source"),
        verifiedBy: actor.id,
        verifiedAt: timestamp(),
      });
      institutionEvent(store, actor, updated);
      return updated;
    }
    if (op === "representative.nominate") {
      const subjectId = text(d, "subjectId", 160);
      store.get(subjectId, "identity");
      return store.create(
        "representative",
        actor,
        {
          institutionId: org.id,
          subjectId,
          status: "pending",
          authoritySource: text(d, "authoritySource"),
          expiresAt: iso(d, "expiresAt"),
          consent: bool(d, "consent"),
        },
        { scope: org.id },
      );
    }
    if (op === "partnership.create")
      return store.create(
        "partnership",
        actor,
        {
          institutionId: org.id,
          format: choice(d, "format", [
            "trial",
            "bootcamp",
            "residency",
            "workshop",
            "club",
          ]),
          audience: text(d, "audience"),
          resources: text(d, "resources"),
          budgetMinor: integer(d, "budgetMinor"),
          currency: text(d, "currency", 12),
          criteria: text(d, "criteria"),
          status: "draft",
        },
        { scope: org.id },
      );
    if (op === "document.create") {
      const fields: Data = {};
      for (const key of [
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
      ])
        fields[key] = text(d, key, 4000);
      return store.create(
        "document",
        actor,
        {
          institutionId: org.id,
          type: choice(d, "type", [
            "proposal",
            "program",
            "responsibilities",
            "memorandum",
            "contract",
            "pilot_appendix",
            "report",
          ]),
          fields,
          status: "draft",
          templateVersion: "local-draft-v2",
          legalApproval: false,
          revision: 1,
          previousRevisionId: null,
        },
        { scope: org.id },
      );
    }
    if (op === "cohort.create") {
      const doc = store.get(text(d, "documentId", 160), "document");
      insist(
        doc.scope === org.id && ["signed", "active"].includes(doc.data.status),
        "agreement_required",
        "Нужен подтверждённый документ / Confirmed agreement required",
      );
      const startAt = iso(d, "startAt"),
        endAt = iso(d, "endAt");
      insist(startAt < endAt, "invalid_period", "Invalid cohort dates");
      const record = store.create(
        "cohort",
        actor,
        {
          institutionId: org.id,
          title: publicText(d, "title"),
          program: choice(d, "program", [
            "trial-45",
            "bootcamp-2x45",
            "residency-4w",
            "club",
          ]),
          startAt,
          endAt,
          documentId: doc.id,
          documentRevision: doc.data.revision,
          coordinatorId: text(d, "coordinatorId", 160),
          teacherId: text(d, "teacherId", 160),
          loadMinutes: integer(d, "loadMinutes", 1, 10000),
          budgetMinor: integer(d, "budgetMinor"),
          currency: text(d, "currency", 12),
          criteria: text(d, "criteria"),
          consent: bool(d, "consent"),
          participantIds: [],
          projectIds: [],
          status: "scheduled",
          actualStartAt: null,
        },
        { scope: org.id },
      );
      cohortEvent(store, actor, record);
      return record;
    }
    if (op === "club.create")
      return store.create(
        "club",
        actor,
        {
          institutionId: org.id,
          title: publicText(d, "title"),
          responsibleId: text(d, "responsibleId", 160),
          resources: text(d, "resources"),
          rhythm: text(d, "rhythm"),
          nextMeeting: iso(d, "nextMeeting"),
          continuation: "opt_in",
        },
        { scope: org.id },
      );
  }
  if (op === "representative.review") {
    const record = store.get(
      text(d, "representativeId", 160),
      "representative",
    );
    requireRole(actor, ["platform_admin", "institution_admin"], record.scope);
    insist(
      record.mode === actor.mode &&
        record.data.subjectId !== actor.id &&
        record.owner !== actor.id,
      "self_verification",
      "Нужен независимый уполномоченный проверяющий / Independent authorized reviewer required",
      403,
    );
    const status = choice(d, "status", ["verified", "rejected", "revoked"]);
    const updated = store.update(record, {
      ...record.data,
      status,
      confirmedBy: actor.id,
      confirmation: text(d, "confirmation"),
      confirmedAt: timestamp(),
    });
    const previous = store
      .list("role_assignment", actor.mode)
      .filter(
        (r) =>
          r.scope === record.scope &&
          r.data.subjectId === record.data.subjectId &&
          r.data.role === "institution_representative",
      );
    for (const r of previous) store.update(r, { ...r.data, status: "revoked" });
    if (status === "verified") {
      insist(
        record.data.expiresAt > timestamp(),
        "expired",
        "Appointment expired",
      );
      store.create(
        "role_assignment",
        actor,
        {
          subjectId: record.data.subjectId,
          role: "institution_representative",
          status: "active",
          expiresAt: record.data.expiresAt,
          appointmentId: record.id,
        },
        { scope: record.scope },
      );
    }
    store.emit(
      "representative.updated",
      actor,
      updated,
      {
        institutionId: record.scope,
        subjectId: record.data.subjectId,
        status,
        expiresAt: record.data.expiresAt,
        confirmedBy: actor.id,
      },
      ALL_APPS,
      status === "verified" ? "verified" : "revoked",
    );
    return updated;
  }
  if (op === "document.revise") {
    const old = store.get(text(d, "documentId", 160), "document");
    orgAccess(store, actor, old.scope);
    insist(
      old.data.status !== "completed" && old.data.status !== "terminated",
      "closed_document",
      "Closed document",
      409,
    );
    const fields = { ...old.data.fields };
    for (const key of Object.keys(fields))
      if (d[key] !== undefined) fields[key] = text(d, key, 4000);
    const revision = store.create(
      "document_revision",
      actor,
      {
        documentId: old.id,
        previousRevision: old.data.revision,
        fields: old.data.fields,
        status: old.data.status,
        reason: text(d, "reason"),
        signedEvidence: old.data.signedEvidence ?? null,
      },
      { scope: old.scope },
    );
    return store.update(old, {
      ...old.data,
      fields,
      status: "draft",
      revision: old.data.revision + 1,
      previousRevisionId: revision.id,
      signedEvidence: null,
      signedBy: null,
      legalApproval: false,
    });
  }
  if (op === "document.transition") {
    const doc = store.get(text(d, "documentId", 160), "document");
    orgAccess(store, actor, doc.scope);
    const status = text(d, "status", 50);
    transition(doc.data.status, status, DOCUMENT_GRAPH);
    const data: Data = { ...doc.data, status };
    if (status === "signed") {
      requireRole(
        actor,
        ["institution_representative", "institution_admin"],
        doc.scope,
      );
      insist(
        actor.id !== doc.owner,
        "independent_signer",
        "Подтвердить должна уполномоченная сторона / Authorized counterparty must confirm",
        403,
      );
      data.signedEvidence = text(d, "signedEvidence", 4000);
      data.signedBy = actor.id;
      data.signedAt = timestamp();
      data.verificationMethod = "reviewer_confirmation";
    }
    return store.update(doc, data);
  }
  if (
    [
      "cohort.enroll",
      "cohort.start",
      "cohort.complete",
      "cohort.project",
    ].includes(op)
  ) {
    const cohort = store.get(text(d, "cohortId", 160), "cohort");
    orgAccess(store, actor, cohort.scope);
    if (op === "cohort.enroll") {
      const subjectId = text(d, "subjectId", 160);
      store.get(subjectId, "identity");
      insist(
        cohort.data.consent &&
          bool(d, "consent") &&
          ["scheduled", "started"].includes(cohort.data.status),
        "consent_required",
        "Consent and open cohort required",
      );
      const updated = store.update(cohort, {
        ...cohort.data,
        participantIds: [
          ...new Set([...cohort.data.participantIds, subjectId]),
        ],
      });
      store.create(
        "enrollment",
        actor,
        {
          cohortId: cohort.id,
          subjectId,
          consent: true,
          responsibleId: cohort.data.coordinatorId,
        },
        { scope: cohort.scope },
      );
      cohortEvent(store, actor, updated);
      return updated;
    }
    if (op === "cohort.start") {
      insist(
        cohort.data.status === "scheduled" &&
          cohort.data.participantIds.length > 0,
        "invalid_transition",
        "Нужен запланированный поток с участниками / Scheduled cohort with participants required",
      );
      const doc = store.get(cohort.data.documentId, "document");
      insist(
        ["signed", "active"].includes(doc.data.status) &&
          doc.data.revision === cohort.data.documentRevision,
        "agreement_changed",
        "Agreement changed; revise cohort before launch",
      );
      const updated = store.update(cohort, {
        ...cohort.data,
        status: "started",
        actualStartAt: timestamp(),
        confirmation: text(d, "confirmation"),
      });
      cohortEvent(store, actor, updated);
      return updated;
    }
    if (op === "cohort.complete") {
      insist(
        cohort.data.status === "started",
        "invalid_transition",
        "Cohort not started",
      );
      const updated = store.update(cohort, {
        ...cohort.data,
        status: "completed",
        actualEndAt: timestamp(),
        report: text(d, "report"),
        teacherMinutes: integer(d, "teacherMinutes"),
        nextStep: text(d, "nextStep"),
      });
      cohortEvent(store, actor, updated);
      return updated;
    }
    if (op === "cohort.project") {
      const projectId = text(d, "projectId", 160);
      const p = store
        .projections("founder-studio")
        .find(
          (e) =>
            e.entityRef === projectId &&
            e.dataMode === actor.mode &&
            ["project.updated", "project.revoked"].includes(e.type),
        );
      insist(
        p &&
          p.payload.cohortId === cohort.id &&
          p.payload.institutionId === cohort.scope,
        "invalid_reference",
        "Project must belong to this cohort",
      );
      const updated = store.update(cohort, {
        ...cohort.data,
        projectIds: [...new Set([...cohort.data.projectIds, projectId])],
      });
      cohortEvent(store, actor, updated);
      return updated;
    }
  }
  if (op === "institution.report") {
    const org = orgAccess(store, actor, text(d, "institutionId", 160));
    const cohorts = store
      .list("cohort", actor.mode)
      .filter((c) => c.scope === org.id);
    return store.create(
      "institution_report",
      actor,
      {
        institutionId: org.id,
        asOf: timestamp(),
        type: "current_snapshot",
        cohorts: cohorts.map((c) => ({ id: c.id, ...c.data })),
        participants: [
          ...new Set(cohorts.flatMap((c) => c.data.participantIds)),
        ].length,
        projects: [...new Set(cohorts.flatMap((c) => c.data.projectIds ?? []))]
          .length,
        limitations: "Current snapshot, not reconstructed monthly history",
        nextStep: text(d, "nextStep"),
      },
      { scope: org.id },
    );
  }
  if (op === "record.read") {
    const record = store.get(text(d, "id", 160));
    own(actor, record);
    return record;
  }
  return undefined;
}
