import { createHash } from "node:crypto";
import { Store } from "./store";
import { APPS, type Actor } from "./types";
import { institutionEvent } from "./institutions";
export const DEMO_ID = (key: string) =>
  `demo-${createHash("sha256")
    .update("startify-v2:" + key)
    .digest("hex")
    .slice(0, 24)}`;
export function seedV2(store: Store) {
  if (store.one("SELECT value FROM v2_setting WHERE key='seed_v2'")) return;
  store.transaction(() => {
    const profiles = [
      { key: "solo", nickname: "NovaSolo", roles: ["founder"], scope: "self" },
      {
        key: "school-founder",
        nickname: "OrbitSchool",
        roles: ["founder"],
        scope: "self",
      },
      {
        key: "tester",
        nickname: "SignalTester",
        roles: ["tester"],
        scope: "self",
      },
      {
        key: "teacher",
        nickname: "GuideTeacher",
        roles: ["teacher"],
        scope: "self",
      },
      {
        key: "representative",
        nickname: "SchoolDelegate",
        roles: [],
        scope: "self",
      },
      {
        key: "expert-research",
        nickname: "ResearchGuide",
        roles: [],
        scope: "self",
      },
      {
        key: "expert-marketing",
        nickname: "MarketingGuide",
        roles: [],
        scope: "self",
      },
      {
        key: "expert-code",
        nickname: "PrototypeGuide",
        roles: [],
        scope: "self",
      },
      {
        key: "partner",
        nickname: "PilotPartner",
        roles: ["partner"],
        scope: "self",
      },
      {
        key: "ambassador",
        nickname: "AdultAmbassador",
        roles: ["ambassador"],
        scope: "self",
      },
      {
        key: "intern",
        nickname: "SupervisedIntern",
        roles: ["intern"],
        scope: "self",
      },
      {
        key: "coordinator",
        nickname: "FlowCoordinator",
        roles: ["coordinator", "growth_manager"],
        scope: "*",
      },
      {
        key: "reviewer",
        nickname: "EvidenceReviewer",
        roles: ["moderator"],
        scope: "*",
      },
      {
        key: "admin",
        nickname: "LocalDemoAdmin",
        roles: ["platform_admin", "institution_admin"],
        scope: "*",
      },
    ];
    for (const p of profiles) {
      const id = DEMO_ID(p.key),
        actor: Actor = { id, label: p.nickname, mode: "demo", roles: [] };
      store.create(
        "identity",
        actor,
        {
          nickname: p.nickname,
          country: "KZ",
          language: "ru",
          timezone: "Asia/Qyzylorda",
          ageBand:
            p.key === "solo" || p.key === "school-founder" ? "13-17" : "18+",
          demo: true,
        },
        { id },
      );
      for (const role of p.roles)
        store.create(
          "role_assignment",
          actor,
          { subjectId: id, role, status: "active" },
          { scope: p.scope === "self" ? id : "*" },
        );
    }
    const admin: Actor = {
      id: DEMO_ID("admin"),
      label: "LocalDemoAdmin",
      mode: "demo",
      roles: [{ role: "platform_admin", scope: "*" }],
    };
    if (store.app === "school-portal") {
      const schools = store.one(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='School'",
      )
        ? store.all('SELECT * FROM "School"')
        : [];
      for (const school of schools) {
        const globalId = store.map("school-portal", "institution", school.id);
        const record = store.create(
          "institution",
          admin,
          {
            title: school.name,
            type: "school",
            country: school.country,
            website: "",
            language: "ru",
            timezone: "Asia/Qyzylorda",
            status: "found",
            verificationStatus: "self_reported",
            consent: false,
            resources: "Legacy demo school; not verified",
            coordinatorId: admin.id,
            legacyId: school.id,
          },
          { id: globalId, scope: globalId },
        );
        institutionEvent(store, admin, record);
      }
      for (const [key, type] of [
        ["college", "college"],
        ["university", "university"],
      ]) {
        const id = DEMO_ID(key);
        const org = store.create(
          "institution",
          admin,
          {
            title: type === "college" ? "demo college" : "demo university",
            type,
            country: "KZ",
            website: "",
            language: "en",
            timezone: "Asia/Qyzylorda",
            status: "found",
            verificationStatus: "self_reported",
            consent: false,
            resources: "Demo pilot resources pending confirmation",
            coordinatorId: admin.id,
          },
          { id, scope: id },
        );
        institutionEvent(store, admin, org);
      }
    }
    if (store.app === "founder-studio") {
      for (const [key, skill] of [
        ["expert-research", "research"],
        ["expert-marketing", "marketing"],
        ["expert-code", "vibecoding"],
      ]) {
        const id = DEMO_ID(key),
          actor: Actor = { id, label: key, mode: "demo", roles: [] };
        store.create(
          "expert",
          actor,
          {
            nickname: profiles.find((p) => p.key === key)!.nickname,
            skills: [skill],
            stages: ["idea", "prototype"],
            languages: ["ru", "en"],
            timezone: "Asia/Qyzylorda",
            experience:
              "Fictional demo application, requires independent review",
            sources: "demo fixture",
            cases: "demo",
            beginnerExperience: "demo",
            limitations: "Not a verified real specialist",
            status: "submitted",
            verificationStatus: "self_reported",
            consent: true,
          },
          { id: DEMO_ID(key + "-profile") },
        );
      }
    }
    store.run("INSERT INTO v2_setting VALUES ('seed_v2','1')");
  });
}
export function registerIdentity(
  store: Store,
  data: { nickname: string; country: string; language: string },
  key = crypto.randomUUID(),
) {
  return store.request(
    {
      id: "public-registration",
      label: "registration",
      mode: "demo",
      roles: [],
    },
    "identity.register",
    key,
    data,
    () => {
      const actor: Actor = {
        id: crypto.randomUUID(),
        label: data.nickname,
        mode: "demo",
        roles: [],
      };
      const record = store.create(
        "identity",
        actor,
        { ...data, timezone: "UTC", ageBand: "not_collected", demo: true },
        { id: actor.id },
      );
      store.create("role_assignment", actor, {
        subjectId: actor.id,
        role: "founder",
        status: "active",
      });
      store.emit(
        "identity.registered",
        actor,
        record,
        data,
        Object.keys(APPS) as (keyof typeof APPS)[],
      );
      return record;
    },
  );
}
