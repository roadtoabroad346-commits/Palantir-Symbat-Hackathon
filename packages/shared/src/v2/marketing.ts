import { randomUUID } from "node:crypto";
import { insist, type Actor, type Data } from "./types";
import { Store, hash, timestamp } from "./store";
import { own, requireRole } from "./access";
import {
  bool,
  choice,
  integer,
  iso,
  jsonObject,
  list,
  publicText,
  safeUrl,
  text,
  transition,
} from "./validation";
import { canonicalSource } from "./discovery";
import { projection } from "./events";
const CONTENT_GRAPH = {
  idea: ["draft"],
  draft: ["review"],
  review: ["approved", "draft"],
  approved: ["scheduled", "draft"],
  scheduled: ["draft", "publishing"],
  publishing: ["published", "failed"],
  published: [],
  failed: ["draft", "review"],
};
const LEAD_GRAPH = {
  prospect: ["researched", "not_fit", "opted_out", "duplicate", "archived"],
  researched: ["fit_reviewed", "not_fit", "opted_out", "duplicate", "archived"],
  fit_reviewed: ["outreach_prepared", "not_fit", "opted_out", "archived"],
  outreach_prepared: ["contacted", "opted_out", "archived"],
  contacted: ["responded", "opted_out", "archived"],
  responded: ["interested", "not_fit", "opted_out", "archived"],
  interested: ["qualified", "not_fit", "opted_out", "archived"],
  qualified: ["scheduled", "opted_out", "archived"],
  scheduled: ["completed", "opted_out", "archived"],
  completed: ["outcome", "archived"],
  outcome: ["archived"],
  not_fit: ["archived"],
  opted_out: [],
  duplicate: [],
  archived: [],
};
function campaign(store: Store, actor: Actor, id: string) {
  const c = store.get(id, "marketing_campaign");
  own(actor, c);
  return c;
}
export function marketingMutate(
  store: Store,
  actor: Actor,
  op: string,
  d: Data,
): Data | undefined {
  if (op === "campaign.create") {
    requireRole(
      actor,
      ["founder", "growth_manager", "coordinator", "platform_admin"],
      actor.id,
    );
    const projectId = text(d, "projectId", 160, true);
    if (projectId) {
      const p = projection(
        store,
        projectId,
        ["project.updated", "project.revoked"],
        actor.mode,
      );
      insist(
        p.payload.ownerFounderId === actor.id ||
          actor.roles.some((r) => r.role === "platform_admin"),
        "forbidden",
        "Project owner required",
        403,
      );
    }
    const minAge = integer(d, "minAge", 13, 100),
      spendLimit = integer(d, "spendLimitMinor", 0, 10000000);
    const audience = choice(d, "audience", [
      "founder",
      "teacher",
      "parent",
      "partner",
      "student",
    ]);
    insist(
      !(spendLimit > 0 && (minAge < 18 || audience === "student")),
      "minor_campaign_blocked",
      "Платная кампания для несовершеннолетних запрещена / Paid minor/student campaign blocked",
      403,
    );
    const c = store.create("marketing_campaign", actor, {
      title: publicText(d, "title"),
      projectId: projectId || null,
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
      goal: choice(d, "goal", [
        "interviews",
        "testers",
        "applications",
        "subscriptions",
        "meetings",
        "pilots",
        "customers",
        "cohort",
      ]),
      audience,
      minAge,
      language: choice(d, "language", ["ru", "en"]),
      description: publicText(d, "description", 2000),
      advantages: publicText(d, "advantages", 2000),
      limitations: publicText(d, "limitations", 2000),
      cta: publicText(d, "cta", 200),
      allowedTools: ["draft", "research", "manual_export"],
      allowedChannels: list(d, "channels", 10),
      recipientPolicy: "voluntary_inbound_or_reviewed_adult_recipients",
      dailyLimit: integer(d, "dailyLimit", 0, 500),
      spendLimitMinor: spendLimit,
      actualSpendMinor: 0,
      approvalVersion: 0,
      paused: false,
      attributionPolicy: "first_eligible_source_30d_v2",
      attributionDays: 30,
      funnelDefinition:
        "visit→application→qualified→meeting/test→confirmed_outcome",
      source: randomUUID().slice(0, 12),
      consent: true,
      status: "draft",
    });
    store.emit(
      "campaign.updated",
      actor,
      c,
      {
        title: c.data.title,
        projectId: c.data.projectId,
        country: c.data.country,
        goal: c.data.goal,
        paused: false,
        source: c.data.source,
        consent: true,
      },
      ["founder-studio"],
    );
    return c;
  }
  if (op === "campaign.pause") {
    const c = campaign(store, actor, text(d, "campaignId", 160));
    const paused = bool(d, "paused"),
      updated = store.update(c, { ...c.data, paused });
    store.emit(
      "campaign.updated",
      actor,
      updated,
      {
        title: c.data.title,
        projectId: c.data.projectId,
        country: c.data.country,
        goal: c.data.goal,
        paused,
        source: c.data.source,
        consent: true,
      },
      ["founder-studio"],
    );
    return updated;
  }
  if (op === "campaign.approve") {
    const c = campaign(store, actor, text(d, "campaignId", 160));
    insist(
      c.data.minAge >= 18 || c.data.spendLimitMinor === 0,
      "minor_campaign_blocked",
      "Minor paid campaign blocked",
      403,
    );
    return store.update(c, {
      ...c.data,
      status: "approved",
      approvalVersion: c.data.approvalVersion + 1,
      approvedBy: actor.id,
      approvedAt: timestamp(),
      approvedRecipients: list(d, "approvedRecipients", 200),
    });
  }
  if (op === "prospect.import") {
    const c = campaign(store, actor, text(d, "campaignId", 160));
    const source = canonicalSource(text(d, "url", 2048));
    const duplicate = store
      .list("prospect", actor.mode)
      .find((p) => p.owner === actor.id && p.data.canonicalURL === source);
    if (duplicate) {
      return store.update(duplicate, {
        ...duplicate.data,
        sources: [
          ...duplicate.data.sources,
          {
            url: source,
            capturedAt: timestamp(),
            evidence: text(d, "evidence", 8000),
          },
        ],
      });
    }
    return store.create(
      "prospect",
      actor,
      {
        campaignId: c.id,
        canonicalURL: source,
        organizationId: text(d, "organizationId", 160, true) || null,
        title: publicText(d, "title"),
        source: "reviewed_url_or_csv",
        capturedAt: timestamp(),
        extractedFields: { description: text(d, "description", 4000) },
        confidence: choice(d, "confidence", ["low", "medium", "high"]),
        evidence: text(d, "evidence", 8000),
        knownUnknowns: text(d, "knownUnknowns"),
        reviewStatus: "pending",
        status: "prospect",
        sources: [
          {
            url: source,
            capturedAt: timestamp(),
            evidence: text(d, "evidence", 8000),
          },
        ],
      },
      { scope: c.scope },
    );
  }
  if (op === "prospect.merge") {
    const primary = store.get(text(d, "primaryId", 160), "prospect"),
      duplicate = store.get(text(d, "duplicateId", 160), "prospect");
    own(actor, primary);
    own(actor, duplicate);
    insist(
      primary.id !== duplicate.id,
      "invalid_reference",
      "Cannot merge into self",
    );
    const merged = store.update(primary, {
      ...primary.data,
      sources: [...primary.data.sources, ...duplicate.data.sources],
      mergeHistory: [
        ...(primary.data.mergeHistory ?? []),
        {
          duplicateId: duplicate.id,
          reason: text(d, "reason"),
          at: timestamp(),
        },
      ],
    });
    store.update(duplicate, {
      ...duplicate.data,
      status: "duplicate",
      mergedInto: primary.id,
    });
    return merged;
  }
  if (op === "lead.from_prospect") {
    const p = store.get(text(d, "prospectId", 160), "prospect");
    own(actor, p);
    return store.create(
      "lead",
      actor,
      {
        campaignId: p.data.campaignId,
        prospectId: p.id,
        status: "prospect",
        source: p.data.canonicalURL,
        reason: null,
        consent: false,
        history: [],
      },
      { scope: p.scope },
    );
  }
  if (op === "lead.transition") {
    const lead = store.get(text(d, "leadId", 160), "lead");
    own(actor, lead);
    const c = campaign(store, actor, lead.data.campaignId),
      status = text(d, "status", 40);
    transition(lead.data.status, status, LEAD_GRAPH);
    const reason = text(d, "reason"),
      evidence = text(d, "evidence");
    if (["contacted", "scheduled"].includes(status))
      insist(
        !c.data.paused,
        "campaign_paused",
        "Кампания приостановлена / Campaign paused",
        409,
      );
    if (status === "contacted") {
      insist(
        c.data.status === "approved" && c.data.approvalVersion > 0,
        "approval_required",
        "Campaign recipient approval required",
      );
      const recipient = text(d, "recipient", 200);
      insist(
        c.data.approvedRecipients.includes(recipient),
        "recipient_not_approved",
        "Recipient not approved",
        403,
      );
    }
    if (["interested", "qualified"].includes(status))
      insist(
        evidence.length > 10,
        "evidence_required",
        "Реальный отклик обязателен / Actual response evidence required",
      );
    const updated = store.update(lead, {
      ...lead.data,
      status,
      reason,
      evidence,
      history: [
        ...lead.data.history,
        {
          from: lead.data.status,
          to: status,
          reason,
          evidence,
          at: timestamp(),
          by: actor.id,
        },
      ],
    });
    if (status === "qualified")
      store.emit(
        "lead.qualified",
        actor,
        updated,
        {
          campaignId: c.id,
          projectId: c.data.projectId,
          source: lead.data.source,
          status,
          consent: lead.data.consent,
        },
        ["founder-studio"],
      );
    return updated;
  }
  if (op === "content.plan") {
    const c = campaign(store, actor, text(d, "campaignId", 160));
    return store.create(
      "content_plan",
      actor,
      {
        campaignId: c.id,
        days: integer(d, "days", 7, 30),
        tone: text(d, "tone", 100),
        proofs: text(d, "proofs"),
        rights: text(d, "rights"),
        cta: c.data.cta,
        items: [
          "problem",
          "process",
          "prototype",
          "test",
          "mistake_and_change",
          "permitted_user_story",
          "help_request",
          "invitation",
        ],
        status: "draft",
        language: c.data.language,
      },
      { scope: c.scope },
    );
  }
  if (op === "content.create") {
    const c = campaign(store, actor, text(d, "campaignId", 160));
    const rights = text(d, "rights");
    const storyboard = jsonObject(d, "storyboard");
    for (const k of [
      "hook",
      "script",
      "shots",
      "onScreen",
      "subtitles",
      "cover",
      "caption",
      "cta",
    ])
      text(storyboard, k, 10000);
    return store.create(
      "content",
      actor,
      {
        campaignId: c.id,
        title: publicText(d, "title"),
        format: "9:16",
        width: 1080,
        height: 1920,
        storyboard,
        rights,
        status: "draft",
        approvalVersion: 0,
        approvedInputHash: null,
        trackedLink: `/api/v2/landing/${c.id}?source=${c.data.source}`,
        provider: "manual_template",
        generationStatus: "not_connected",
        snapshotId: text(d, "snapshotId", 160, true) || null,
      },
      { scope: c.scope },
    );
  }
  if (op === "content.edit") {
    const content = store.get(text(d, "contentId", 160), "content");
    own(actor, content);
    const storyboard = jsonObject(d, "storyboard");
    for (const k of [
      "hook",
      "script",
      "shots",
      "onScreen",
      "subtitles",
      "cover",
      "caption",
      "cta",
    ])
      text(storyboard, k, 10000);
    return store.update(content, {
      ...content.data,
      storyboard,
      rights: text(d, "rights"),
      status: "draft",
      approvalVersion: 0,
      approvedInputHash: null,
      generationStatus: "stale",
    });
  }
  if (op === "content.transition") {
    const content = store.get(text(d, "contentId", 160), "content");
    own(actor, content);
    const c = campaign(store, actor, content.data.campaignId),
      status = text(d, "status", 50);
    transition(content.data.status, status, CONTENT_GRAPH);
    insist(
      !["publishing", "published"].includes(status),
      "publisher_not_connected",
      "Автопубликация не подключена. Используйте ручной экспорт / Publishing not connected; use manual export",
      503,
    );
    if (status === "scheduled")
      insist(!c.data.paused, "campaign_paused", "Campaign paused", 409);
    return store.update(content, {
      ...content.data,
      status,
      approvalVersion:
        status === "approved"
          ? content.data.approvalVersion + 1
          : content.data.approvalVersion,
      approvedInputHash:
        status === "approved"
          ? hash([content.data.storyboard, content.data.rights])
          : content.data.approvedInputHash,
      scheduledAt: status === "scheduled" ? iso(d, "scheduledAt") : null,
    });
  }
  if (op === "content.export") {
    const content = store.get(text(d, "contentId", 160), "content");
    own(actor, content);
    const packageData = {
      format: "storyboard-package-v2",
      dataMode: actor.mode,
      notVideo: true,
      rights: content.data.rights,
      aspectRatio: "9:16",
      storyboard: content.data.storyboard,
      trackedLink: content.data.trackedLink,
      createdAt: timestamp(),
    };
    const artifact = store.create(
      "artifact",
      actor,
      {
        filename: `reels-${content.id}.json`,
        contentType: "application/json",
        body: JSON.stringify(packageData, null, 2),
        sha256: hash(packageData),
        contentId: content.id,
        mode: "manual_export",
      },
      { scope: content.scope },
    );
    const job = store.create(
      "job",
      actor,
      {
        type: "storyboard_export",
        owner: actor.id,
        inputVersion: content.revision,
        status: "succeeded",
        retryCount: 0,
        maxRetries: 0,
        budget: 0,
        artifactId: artifact.id,
        output: `/api/v2/artifacts/${artifact.id}`,
        createdAt: timestamp(),
        completedAt: timestamp(),
        provider: "local_template",
        notVideo: true,
      },
      { scope: content.scope },
    );
    store.update(content, {
      ...content.data,
      generationStatus: "exported_storyboard",
      artifactId: artifact.id,
    });
    return {
      id: job.id,
      artifactId: artifact.id,
      download: job.data.output,
      status: "succeeded",
      notVideo: true,
    };
  }
  if (op === "content.render") {
    const content = store.get(text(d, "contentId", 160), "content");
    own(actor, content);
    return store.create(
      "job",
      actor,
      {
        type: "video_render",
        inputVersion: content.revision,
        status: "failed",
        retryCount: 0,
        maxRetries: 0,
        budget: 0,
        errorCode: "renderer_not_connected",
        output: null,
        completedAt: timestamp(),
        provider: "not_connected",
      },
      { scope: content.scope },
    );
  }
  if (op === "job.cancel") {
    const job = store.get(text(d, "jobId", 160), "job");
    own(actor, job);
    insist(
      ["queued", "running", "awaiting_approval"].includes(job.data.status),
      "job_terminal",
      "Job already finished",
      409,
    );
    return store.update(job, {
      ...job.data,
      status: "cancelled",
      completedAt: timestamp(),
    });
  }
  if (op === "publication.manual") {
    const content = store.get(text(d, "contentId", 160), "content");
    own(actor, content);
    const c = campaign(store, actor, content.data.campaignId);
    insist(
      !c.data.paused &&
        ["approved", "scheduled", "published"].includes(content.data.status) &&
        content.data.approvedInputHash ===
          hash([content.data.storyboard, content.data.rights]),
      "approval_required",
      "Current content approval and active campaign required",
      409,
    );
    const externalPostId = text(d, "externalPostId", 300),
      url = safeUrl(d.url);
    const prior = store
      .list("publication", actor.mode)
      .find((r) => r.data.externalPostId === externalPostId);
    if (prior) {
      own(actor, prior);
      insist(
        prior.data.contentId === content.id && prior.data.url === url,
        "publication_conflict",
        "External post already linked elsewhere",
        409,
      );
      return prior;
    }
    const publication = store.create(
      "publication",
      actor,
      {
        contentId: content.id,
        campaignId: c.id,
        externalPostId,
        url,
        status: "manual_reported",
        verificationStatus: "self_reported",
        publishedAt: iso(d, "publishedAt"),
        evidence: text(d, "evidence"),
      },
      { scope: content.scope },
    );
    store.update(content, {
      ...content.data,
      status: "published",
      publicationMode: "manual_reported",
    });
    return publication;
  }
  if (op === "content.metric") {
    const p = store.get(text(d, "publicationId", 160), "publication");
    own(actor, p);
    return store.create(
      "content_metric",
      actor,
      {
        publicationId: p.id,
        metric: choice(d, "metric", [
          "reach",
          "views",
          "clicks",
          "applications",
          "activation",
        ]),
        value: integer(d, "value"),
        sourceType: "manual_report",
        verificationStatus: "self_reported",
        sourceRef: text(d, "sourceRef"),
        asOf: iso(d, "asOf"),
      },
      { scope: p.scope },
    );
  }
  return undefined;
}
export function inboundApplication(store: Store, campaignId: string, d: Data) {
  return store.transaction(() => {
    const c = store.get(campaignId, "marketing_campaign");
    insist(
      c.data.status === "approved",
      "form_closed",
      "Форма пока закрыта / Form not open",
      409,
    );
    insist(
      bool(d, "consent"),
      "consent_required",
      "Добровольное согласие обязательно / Voluntary consent required",
    );
    const token = text(d, "visitorToken", 160);
    insist(
      /^[a-zA-Z0-9-]{16,160}$/.test(token),
      "invalid_token",
      "Opaque visitor token required",
    );
    const old = store
      .list("lead", c.mode)
      .find(
        (l) =>
          l.data.campaignId === c.id && l.data.visitorDigest === hash(token),
      );
    if (old) return { id: old.id, status: "already_received" };
    const actor = { id: c.owner, label: "inbound", mode: c.mode, roles: [] };
    const source = text(d, "source", 200, true) || "direct";
    const first = store
      .list("attribution", c.mode)
      .find(
        (a) =>
          a.data.visitorDigest === hash(token) &&
          a.data.campaignId === c.id &&
          Date.parse(a.createdAt) + 30 * 86400000 > Date.now(),
      );
    const attributed =
      first?.data.source ??
      (source === "direct"
        ? "direct"
        : source === c.data.source
          ? source
          : "unverified_source");
    if (!first)
      store.create("attribution", actor, {
        campaignId: c.id,
        visitorDigest: hash(token),
        source: attributed,
        policy: c.data.attributionPolicy,
      });
    const lead = store.create(
      "lead",
      actor,
      {
        campaignId: c.id,
        status: "responded",
        source: attributed,
        visitorDigest: hash(token),
        nickname: publicText(d, "nickname", 40),
        response: publicText(d, "response", 2000),
        consent: true,
        history: [
          { to: "responded", at: timestamp(), reason: "voluntary_inbound" },
        ],
        verificationStatus: "self_reported",
      },
      { scope: c.scope },
    );
    return { id: lead.id, status: "received" };
  });
}
