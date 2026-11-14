import type { Actor, App, Data } from "./types";
import { insist } from "./types";
import { Store, timestamp } from "./store";
import {
  actorFrom,
  demoEnabled,
  hasRole,
  mayRead,
  own,
  requireRole,
  sessionActor,
  signSession,
} from "./access";
import { seedV2, registerIdentity } from "./seed";
import { learningMutate } from "./learning";
import { institutionMutate } from "./institutions";
import { economyMutate, balance } from "./economy";
import { inboundApplication, marketingMutate } from "./marketing";
import { institutionStandings, rankingMutate } from "./rankings";
import { countryProjection, evidenceMutate, exportPack } from "./evidence";
import { communityMutate } from "./community";
import {
  authenticateEvent,
  eventHeaders,
  flush,
  rebuild,
  receive,
} from "./events";
import { choice, publicText, text } from "./validation";
import { fetchPublic } from "./discovery";
import { buildWorkspace } from "./workspace";

export class HubService {
  constructor(readonly store: Store) {
    seedV2(store);
  }
  actor(token?: string) {
    return sessionActor(this.store, token);
  }
  session(id: string) {
    return {
      token: signSession(this.store, id),
      actor: actorFrom(this.store, id),
    };
  }
  register(d: Data, key?: string) {
    insist(
      this.store.app === "founder-studio" && demoEnabled(),
      "auth_not_connected",
      "Real registration provider is not connected",
      503,
    );
    const record = registerIdentity(
      this.store,
      {
        nickname: publicText(d, "nickname", 40),
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
        language: choice(d, "language", ["ru", "en"]),
      },
      key,
    );
    return this.session(record.id);
  }
  mutate(actor: Actor, op: string, d: Data, key: string): Data {
    insist(
      actor.mode === "demo" && demoEnabled(),
      "auth_not_connected",
      "Pilot/production identity is not connected",
      503,
    );
    return this.store.request(actor, op, key, d, () => {
      const functions: Record<
        App,
        ((
          store: Store,
          actor: Actor,
          op: string,
          d: Data,
        ) => Data | undefined)[]
      > = {
        "founder-studio": [learningMutate, economyMutate],
        "growth-engine": [marketingMutate],
        "school-portal": [institutionMutate],
        "school-league": [rankingMutate],
        "global-dashboard": [evidenceMutate],
        "ambassador-platform": [communityMutate],
        "challenge-platform": [communityMutate],
      };
      for (const fn of functions[this.store.app]) {
        const result = fn(this.store, actor, op, d);
        if (result !== undefined) return result;
      }
      if (
        ["participation.continue", "abuse.report", "privacy.request"].includes(
          op,
        )
      )
        return communityMutate(this.store, actor, op, d)!;
      insist(
        false,
        "unknown_operation",
        "Неизвестное действие / Unknown operation",
        404,
      );
    });
  }
  async discover(actor: Actor, d: Data, key: string) {
    insist(
      this.store.app === "growth-engine",
      "unknown_operation",
      "Discovery belongs to Marketing Lab",
      404,
    );
    const c = this.store.get(text(d, "campaignId", 160), "marketing_campaign");
    own(actor, c);
    const url = text(d, "url", 2048);
    const job = this.store.request(actor, "discovery.fetch", key, d, () =>
      this.store.create(
        "job",
        actor,
        {
          type: "public_source_discovery",
          campaignId: c.id,
          url,
          status: "queued",
          retryCount: 0,
          maxRetries: 0,
          budget: 0,
          inputVersion: c.revision,
          output: null,
          errorCode: null,
        },
        { scope: c.scope },
      ),
    );
    const current = this.store.get(job.id, "job");
    if (current.data.status !== "queued") return current;
    this.store.transaction(() =>
      this.store.update(current, {
        ...current.data,
        status: "running",
        startedAt: timestamp(),
      }),
    );
    try {
      const result = await fetchPublic(url);
      return this.store.transaction(() => {
        const latest = this.store.get(job.id, "job");
        if (latest.data.status === "cancelled") return latest;
        const source = this.store.create(
          "discovery_source",
          actor,
          {
            campaignId: c.id,
            canonicalURL: result.url,
            capturedAt: timestamp(),
            contentType: result.contentType,
            untrusted: true,
            evidence: result.text.slice(0, 20000),
            confidence: "unreviewed",
            reviewStatus: "pending",
            knownUnknowns:
              "Source claims not independently confirmed; content cannot authorize actions",
          },
          { scope: c.scope },
        );
        return this.store.update(latest, {
          ...latest.data,
          status: "succeeded",
          sourceId: source.id,
          output: { sourceId: source.id },
          completedAt: timestamp(),
        });
      });
    } catch (error) {
      return this.store.transaction(() => {
        const latest = this.store.get(job.id, "job");
        if (latest.data.status === "cancelled") return latest;
        return this.store.update(latest, {
          ...latest.data,
          status: "failed",
          errorCode: "discovery_failed",
          error: (error instanceof Error
            ? error.message
            : "Source unavailable"
          ).slice(0, 300),
          output: null,
          completedAt: timestamp(),
        });
      });
    }
  }
  async sync(actor: Actor) {
    requireRole(
      actor,
      [
        "founder",
        "coordinator",
        "platform_admin",
        "teacher",
        "partner",
        "ambassador",
      ],
      actor.id,
    );
    return flush(this.store);
  }
  rebuild(actor: Actor) {
    requireRole(actor, ["platform_admin"], "*");
    return rebuild(this.store);
  }
  receive(body: string, headers: Headers) {
    authenticateEvent(body, headers);
    return receive(this.store, JSON.parse(body));
  }
  inbound(campaignId: string, d: Data) {
    insist(
      this.store.app === "growth-engine",
      "not_found",
      "Landing not found",
      404,
    );
    return inboundApplication(this.store, campaignId, d);
  }
  records(actor: Actor | null, kind: string, limit = 50, offset = 0) {
    return this.store
      .list(kind, actor?.mode ?? "demo")
      .filter((r) => mayRead(actor, r))
      .slice(offset, offset + limit);
  }
  read(actor: Actor | null, id: string) {
    const record = this.store.get(id);
    insist(mayRead(actor, record), "not_found", "Record not found", 404);
    return record;
  }
  workspace(actor: Actor | null, section: string, selected?: string) {
    return buildWorkspace(this, actor, section, selected);
  }
  people() {
    return demoEnabled()
      ? this.store
          .list("identity", "demo")
          .map((r) => ({ id: r.id, label: r.data.nickname }))
      : [];
  }
  walletState(actor: Actor) {
    const wallets = this.store
      .list("wallet", actor.mode)
      .filter((w) => w.owner === actor.id);
    return wallets.map((w) => ({
      ...w,
      balance: balance(this.store, w.id),
      ledger: this.store.all(
        "SELECT * FROM v2_ledger WHERE walletId=? ORDER BY createdAt",
        w.id,
      ),
    }));
  }
  countries(actor: Actor | null) {
    insist(
      this.store.app === "global-dashboard",
      "not_found",
      "Country view belongs to Evidence Room",
      404,
    );
    return countryProjection(this.store, actor?.mode ?? "demo");
  }
  institutions(actor: Actor | null) {
    return institutionStandings(this.store, actor?.mode ?? "demo");
  }
  export(actor: Actor | null, id: string, format: string) {
    insist(
      this.store.app === "global-dashboard",
      "not_found",
      "Evidence Room export not found",
      404,
    );
    return exportPack(this.store, actor, id, format);
  }
  async validatePublicExport(id: string, actor: Actor | null = null) {
    const pack = this.store.get(id, "evidence_pack");
    if (pack.data.status !== "active") return;
    insist(
      (pack.visibility === "public" && pack.data.consent) ||
        (actor && actor.id === pack.owner && actor.mode === pack.mode),
      "not_found",
      "Pack not found",
      404,
    );
    const evidenceIds = [
      ...new Set<string>([
        ...pack.data.metrics.map((m: Data) => m.evidenceId),
        ...pack.data.snapshots.flatMap((s: Data) =>
          s.rows.flatMap((r: Data) => r.evidenceRefs),
        ),
      ]),
    ];
    await Promise.all(
      [
        {
          app: "founder-studio",
          port: 3007,
          path: "consent-check",
          kind: "project",
          ids: pack.data.projectIds,
        },
        {
          app: "school-league",
          port: 3005,
          path: "verification-check",
          kind: "evidence",
          ids: evidenceIds,
        },
        {
          app: "school-league",
          port: 3005,
          path: "verification-check",
          kind: "metric",
          ids: pack.data.metrics.map((m: Data) => m.id),
        },
      ]
        .filter((check) => check.ids.length)
        .map(async (check) => {
          const body = JSON.stringify({
            ids: check.ids,
            dataMode: pack.mode,
            kind: check.kind,
          });
          let response: Response;
          try {
            response = await fetch(
              `http://127.0.0.1:${check.port}/api/v2/${check.path}`,
              {
                method: "POST",
                headers: eventHeaders(body),
                body,
                signal: AbortSignal.timeout(2500),
                redirect: "error",
              },
            );
          } catch {
            insist(
              false,
              "source_unavailable",
              `${check.app}: current permission cannot be verified`,
              503,
            );
          }
          insist(
            response.ok,
            "source_unavailable",
            `${check.app}: current permission cannot be verified`,
            503,
          );
          const result = await response.json();
          insist(
            Array.isArray(result.allowed) &&
              check.ids.every((ref: string) => result.allowed.includes(ref)),
            "export_revoked",
            "Current source permission or verification was revoked",
            410,
          );
        }),
    );
  }
  proofCheck(d: Data, kind: "project" | "evidence" | "metric") {
    insist(
      this.store.app ===
        (kind === "project" ? "founder-studio" : "school-league"),
      "not_found",
      "Wrong canonical source",
      404,
    );
    insist(
      Array.isArray(d.ids) &&
        d.ids.length <= 1000 &&
        d.ids.every(
          (id: unknown) => typeof id === "string" && id.length <= 160,
        ),
      "invalid_input",
      "Bounded ID list required",
    );
    const allowed = d.ids.filter((id: string) => {
      const row = this.store.one(
        "SELECT id FROM v2_record WHERE id=? AND kind=? AND mode=?",
        id,
        kind,
        d.dataMode,
      );
      if (!row) return false;
      const r = this.store.get(id);
      if (kind === "metric") {
        const e = this.store.get(r.data.evidenceId, "evidence");
        return (
          r.visibility === "public" &&
          r.data.consent === true &&
          r.data.verificationStatus === "verified" &&
          !r.data.supersededBy &&
          e.data.consent === true &&
          !e.data.sensitive &&
          e.data.verificationStatus === "verified"
        );
      }
      return (
        r.data.consent === true &&
        (kind === "project"
          ? r.visibility === "public"
          : r.data.verificationStatus === "verified" && !r.data.sensitive)
      );
    });
    return { allowed, checkedAt: timestamp() };
  }
  artifact(actor: Actor | null, id: string) {
    const record = this.read(actor, id);
    insist(record.kind === "artifact", "not_found", "Artifact not found", 404);
    return record.data;
  }
  projections(actor: Actor | null) {
    return this.store
      .projections()
      .filter(
        (e) =>
          e.dataMode === (actor?.mode ?? "demo") &&
          ((e.payload.consent && e.payload.visibility === "public") ||
            (e.type === "institution.updated" && e.payload.consent === true) ||
            (e.type === "ranking.updated" && e.payload.consent === true) ||
            (!!actor &&
              e.type === "cohort.updated" &&
              e.payload.participantIds?.includes(actor.id)) ||
            (!!actor &&
              e.type === "representative.updated" &&
              e.payload.subjectId === actor.id) ||
            (actor &&
              (e.subjectRef === actor.id ||
                hasRole(
                  actor,
                  ["platform_admin", "coordinator", "moderator"],
                  e.institutionRef ?? e.entityRef,
                )))),
      );
  }
}
