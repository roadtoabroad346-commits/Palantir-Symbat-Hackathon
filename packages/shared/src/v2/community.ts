import { randomUUID } from "node:crypto";
import { insist, type Actor, type Data } from "./types";
import { Store, timestamp } from "./store";
import { hasRole, own, requireRole } from "./access";
import {
  bool,
  choice,
  integer,
  iso,
  list,
  publicText,
  text,
  transition,
} from "./validation";
import { projection } from "./events";

export function communityMutate(
  store: Store,
  actor: Actor,
  op: string,
  d: Data,
): Data | undefined {
  if (op === "ambassador.link") {
    const ambassadorId = text(d, "ambassadorId", 160);
    const ambassador = store.one(
      'SELECT * FROM "Ambassador" WHERE id=?',
      ambassadorId,
    );
    insist(
      ambassador && ambassador.age18Confirmed,
      "adult_required",
      "Confirmed 18+ legacy ambassador required",
    );
    requireRole(actor, ["platform_admin", "coordinator"], actor.id);
    const existing = store
      .list("ambassador_identity", actor.mode)
      .find(
        (r) =>
          r.data.ambassadorId === ambassadorId ||
          r.data.subjectId === d.subjectId,
      );
    insist(!existing, "already_linked", "Identity already linked", 409);
    const subjectId = text(d, "subjectId", 160);
    store.get(subjectId, "identity");
    return store.create(
      "ambassador_identity",
      actor,
      {
        ambassadorId,
        subjectId,
        age18Confirmed: true,
        verifiedBy: actor.id,
        source: text(d, "source"),
      },
      { owner: subjectId },
    );
  }
  if (op === "ambassador.claim") {
    const mapping = store
      .list("ambassador_identity", actor.mode)
      .find((r) => r.data.subjectId === actor.id);
    insist(
      mapping,
      "identity_mapping_required",
      "Ambassador identity mapping required",
      403,
    );
    const cohortId = text(d, "cohortId", 160),
      event = projection(store, cohortId, ["cohort.updated"], actor.mode);
    insist(
      event.verification === "verified" &&
        ["started", "completed"].includes(event.payload.status),
      "unverified_result",
      "Actual confirmed cohort required",
    );
    const previous = store
      .list("contribution", actor.mode)
      .find((c) => c.data.cohortId === cohortId);
    insist(
      !previous,
      "already_claimed",
      "This cohort already has an attribution claim",
      409,
    );
    return store.create(
      "contribution",
      actor,
      {
        cohortId,
        institutionId: event.payload.institutionId,
        ambassadorId: mapping.data.ambassadorId,
        sourceEventId: event.eventId,
        evidence: text(d, "evidence"),
        points: 20,
        status: "pending",
        consent: bool(d, "consent"),
      },
      { scope: event.payload.institutionId },
    );
  }
  if (op === "ambassador.review") {
    const claim = store.get(text(d, "claimId", 160), "contribution");
    requireRole(actor, ["coordinator", "platform_admin"], claim.scope);
    insist(
      actor.id !== claim.owner && claim.mode === actor.mode,
      "self_verification",
      "Independent review required",
      403,
    );
    insist(
      claim.data.status === "pending",
      "already_reviewed",
      "Claim already reviewed",
      409,
    );
    const approved = bool(d, "approved"),
      reason = text(d, "reason");
    if (approved) {
      const event = projection(
        store,
        claim.data.cohortId,
        ["cohort.updated"],
        actor.mode,
      );
      insist(
        event.verification === "verified",
        "unverified_result",
        "Cohort no longer verified",
      );
      const fraud = store.one(
        'SELECT id FROM "FraudFlag" WHERE ambassadorId=? AND resolved=0',
        claim.data.ambassadorId,
      );
      insist(!fraud, "fraud_review", "Resolve legacy fraud review first", 409);
      store.run(
        'INSERT INTO "PointsLedger" (id,ambassadorId,delta,reason,refType,refId,ts) VALUES (?,?,?,?,?,?,?)',
        randomUUID(),
        claim.data.ambassadorId,
        claim.data.points,
        "Confirmed V2 cohort contribution",
        "v2_cohort",
        `v2-cohort:${claim.data.cohortId}`,
        timestamp(),
      );
    }
    const updated = store.update(claim, {
      ...claim.data,
      status: approved ? "verified" : "rejected",
      reviewerId: actor.id,
      reason,
      reviewedAt: timestamp(),
    });
    if (approved)
      store.emit(
        "contribution.verified",
        actor,
        updated,
        {
          subjectId: claim.owner,
          institutionId: claim.data.institutionId,
          cohortId: claim.data.cohortId,
          evidenceId: claim.data.sourceEventId,
          points: claim.data.points,
          consent: claim.data.consent,
        },
        ["founder-studio", "global-dashboard"],
        "verified",
      );
    return updated;
  }
  if (op === "intern.assign") {
    const scope = text(d, "scope", 160);
    requireRole(actor, ["coordinator", "platform_admin"], scope);
    const subjectId = text(d, "subjectId", 160);
    store.get(subjectId, "identity");
    return store.create(
      "intern_task",
      actor,
      {
        subjectId,
        supervisorId: actor.id,
        direction: choice(d, "direction", [
          "marketing",
          "support",
          "research",
          "partnerships",
          "events",
          "prototypes",
        ]),
        task: text(d, "task"),
        deliverable: text(d, "deliverable"),
        dueAt: iso(d, "dueAt"),
        hours: integer(d, "hours", 1, 40),
        criteria: text(d, "criteria"),
        status: "assigned",
        access: "assigned_task_only",
        expertStatus: false,
        unsupervisedMinorAccess: false,
      },
      { scope, owner: subjectId },
    );
  }
  if (op === "intern.submit") {
    const task = store.get(text(d, "taskId", 160), "intern_task");
    insist(
      task.owner === actor.id && task.mode === actor.mode,
      "forbidden",
      "Assigned intern only",
      403,
    );
    return store.update(task, {
      ...task.data,
      status: "submitted",
      artifact: text(d, "artifact", 8000),
      limitations: text(d, "limitations"),
    });
  }
  if (op === "intern.review") {
    const task = store.get(text(d, "taskId", 160), "intern_task");
    insist(
      actor.id === task.data.supervisorId && task.mode === actor.mode,
      "forbidden",
      "Assigned supervisor only",
      403,
    );
    return store.update(task, {
      ...task.data,
      status: choice(d, "status", ["accepted", "changes_requested"]),
      feedback: text(d, "feedback"),
      nextTask: text(d, "nextTask"),
    });
  }
  if (op === "event.create") {
    requireRole(
      actor,
      ["coordinator", "platform_admin"],
      text(d, "scope", 160),
    );
    return store.create(
      "event_v2",
      actor,
      {
        title: publicText(d, "title"),
        format: choice(d, "format", [
          "problem_battle",
          "prototype_battle",
          "experiment_battle",
          "progress_battle",
          "school_challenge",
          "international_test_exchange",
          "prototype_lab",
          "clinic",
          "reverse_pitch",
          "first_yes",
        ]),
        audience: publicText(d, "audience"),
        stage: choice(d, "stage", ["idea", "mockup", "prototype", "product"]),
        rules: text(d, "rules"),
        rubric: text(d, "rubric"),
        policyVersion: "event-v2",
        startAt: iso(d, "startAt"),
        endAt: iso(d, "endAt"),
        entrantTypes: list(d, "entrantTypes", 3),
        resources: text(d, "resources"),
        status: "registration",
        consent: true,
      },
      { scope: text(d, "scope", 160), visibility: "public" },
    );
  }
  if (op === "event.enter") {
    const event = store.get(text(d, "eventId", 160), "event_v2");
    insist(
      event.mode === actor.mode && event.data.status === "registration",
      "event_closed",
      "Event closed",
      409,
    );
    const entrantType = choice(d, "entrantType", [
      "individual",
      "project",
      "team",
    ]);
    insist(
      event.data.entrantTypes.includes(entrantType),
      "entrant_ineligible",
      "Entrant format not allowed",
    );
    let entityRef = actor.id,
      projectId: string | null = null;
    if (entrantType === "project") {
      projectId = text(d, "projectId", 160);
      const p = projection(
        store,
        projectId,
        ["project.updated", "project.revoked"],
        actor.mode,
      );
      insist(
        p.payload.ownerFounderId === actor.id &&
          p.payload.stage === event.data.stage,
        "entrant_ineligible",
        "Project owner/stage required",
      );
      entityRef = projectId;
    }
    if (entrantType === "team") {
      entityRef = text(d, "teamId", 160);
      const canonical = store
        .projections("founder-studio")
        .find(
          (e) =>
            e.type === "team.updated" &&
            e.entityRef === entityRef &&
            e.dataMode === actor.mode,
        );
      if (canonical)
        insist(
          canonical.payload.status === "active" &&
            canonical.payload.memberIds.length >= 2 &&
            canonical.payload.memberIds.length <= 5 &&
            canonical.payload.memberIds.includes(actor.id),
          "team_ineligible",
          "Active membership in a 2–5 team required",
          403,
        );
      else {
        const team = store.one('SELECT * FROM "Team" WHERE id=?', entityRef);
        insist(team, "not_found", "Legacy team not found", 404);
        const members = store.all(
          'SELECT studentRef FROM "TeamMember" WHERE teamId=?',
          entityRef,
        );
        insist(
          members.length >= 2 && members.length <= 5,
          "invalid_team",
          "Legacy teams still require 2–5 members",
        );
        requireRole(
          actor,
          ["teacher", "coordinator", "platform_admin"],
          event.scope,
        );
      }
    }
    const old = store
      .list("entrant", actor.mode)
      .find(
        (e) =>
          e.data.eventId === event.id &&
          e.data.type === entrantType &&
          e.data.entityRef === entityRef,
      );
    if (old) return old;
    return store.create(
      "entrant",
      actor,
      {
        eventId: event.id,
        type: entrantType,
        entityRef,
        projectId,
        status: "entered",
        nextAction: text(d, "nextAction"),
      },
      { scope: event.scope },
    );
  }
  if (op === "opportunity.create") {
    requireRole(actor, ["partner", "coordinator", "platform_admin"], actor.id);
    return store.create(
      "opportunity",
      actor,
      {
        title: publicText(d, "title"),
        problem: publicText(d, "problem", 2000),
        resource: publicText(d, "resource", 1000),
        constraints: publicText(d, "constraints", 1000),
        places: integer(d, "places", 1, 100),
        deadline: iso(d, "deadline"),
        responsibleId: actor.id,
        status: "open",
        consent: true,
      },
      { visibility: "public" },
    );
  }
  if (op === "commitment.request") {
    const opportunity = store.get(text(d, "opportunityId", 160), "opportunity");
    insist(
      opportunity.mode === actor.mode &&
        opportunity.data.status === "open" &&
        opportunity.data.deadline > timestamp(),
      "opportunity_closed",
      "Opportunity closed",
    );
    const projectId = text(d, "projectId", 160);
    const p = projection(
      store,
      projectId,
      ["project.updated", "project.revoked"],
      actor.mode,
    );
    insist(
      p.payload.ownerFounderId === actor.id,
      "forbidden",
      "Project owner required",
      403,
    );
    return store.create("commitment", actor, {
      opportunityId: opportunity.id,
      projectId,
      partnerId: opportunity.owner,
      resource: text(d, "resource"),
      dueAt: iso(d, "dueAt"),
      confirmationMethod: text(d, "confirmationMethod"),
      status: "proposed",
      followUpAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      consent: bool(d, "consent"),
    });
  }
  if (op === "commitment.transition") {
    const c = store.get(text(d, "commitmentId", 160), "commitment");
    insist(
      c.mode === actor.mode &&
        (actor.id === c.owner ||
          actor.id === c.data.partnerId ||
          hasRole(actor, ["coordinator", "platform_admin"], c.scope)),
      "forbidden",
      "Commitment party required",
      403,
    );
    const status = text(d, "status", 30);
    transition(c.data.status, status, {
      proposed: ["accepted", "declined"],
      accepted: ["scheduled"],
      scheduled: ["delivered"],
      delivered: ["reviewed"],
      reviewed: [],
      declined: [],
    });
    if (status === "accepted") {
      insist(
        actor.id === c.data.partnerId,
        "forbidden",
        "Partner must accept",
        403,
      );
      const opportunity = store.get(c.data.opportunityId, "opportunity");
      const used = store
        .list("commitment", actor.mode)
        .filter(
          (r) =>
            r.data.opportunityId === opportunity.id &&
            ["accepted", "scheduled", "delivered", "reviewed"].includes(
              r.data.status,
            ),
        ).length;
      insist(
        used < opportunity.data.places,
        "resource_exhausted",
        "No available resource",
        409,
      );
    }
    const updated = store.update(c, {
      ...c.data,
      status,
      latestEvidence: text(d, "evidence"),
      updatedBy: actor.id,
    });
    store.emit(
      "commitment.updated",
      actor,
      updated,
      {
        projectId: c.data.projectId,
        resource: c.data.resource,
        status,
        dueAt: c.data.dueAt,
        consent: c.data.consent,
      },
      ["founder-studio"],
    );
    return updated;
  }
  if (op === "participation.continue")
    return store.create("continuation", actor, {
      choice: choice(d, "choice", [
        "continue",
        "change_hypothesis",
        "pilot",
        "test_others",
        "help_institution",
        "pause",
        "complete",
      ]),
      reason: text(d, "reason"),
      nextStep: text(d, "nextStep"),
      remindAt: iso(d, "remindAt"),
      frequency: choice(d, "frequency", ["off", "weekly", "monthly"]),
    });
  if (op === "abuse.report")
    return store.create("abuse_report", actor, {
      entityRef: text(d, "entityRef", 160),
      reason: text(d, "reason"),
      status: "pending",
    });
  if (op === "privacy.request")
    return store.create("privacy_request", actor, {
      type: choice(d, "type", ["export", "delete"]),
      reason: text(d, "reason"),
      status: "pending",
      policy:
        "Coordinator review; financial/legal audit retention considered separately; revoke public consent immediately in project settings",
    });
  if (op === "task.read") {
    const r = store.get(text(d, "id", 160));
    own(actor, r);
    return r;
  }
  return undefined;
}
