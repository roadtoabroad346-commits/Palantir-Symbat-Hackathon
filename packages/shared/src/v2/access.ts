import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Store, timestamp } from "./store";
import { insist, type Actor, type RecordV2 } from "./types";

export function hasRole(actor: Actor, roles: string[], scope: string) {
  return actor.roles.some(
    (r) => roles.includes(r.role) && (r.scope === scope || r.scope === "*"),
  );
}
export function requireRole(actor: Actor, roles: string[], scope: string) {
  insist(
    hasRole(actor, roles, scope),
    "forbidden",
    "Нет прав в этой области / Permission denied in this scope",
    403,
  );
}
export function mayRead(actor: Actor | null, record: RecordV2) {
  return (
    (record.visibility === "public" && record.data.consent === true) ||
    (!!actor &&
      actor.mode === record.mode &&
      (actor.id === record.owner ||
        (record.kind === "team_v2" &&
          record.data.memberIds?.includes(actor.id)) ||
        (["booking", "action_plan"].includes(record.kind) &&
          record.data.expertId === actor.id) ||
        (record.kind === "commitment" && record.data.partnerId === actor.id) ||
        (record.kind === "response" &&
          record.data.permission === true &&
          actor.id === record.data.founderId) ||
        actor.roles.some(
          (r) =>
            (r.scope === record.scope || r.scope === "*") &&
            [
              "platform_admin",
              "moderator",
              "coordinator",
              "institution_admin",
              "teacher",
              "institution_representative",
            ].includes(r.role),
        )))
  );
}
export function own(actor: Actor, record: RecordV2) {
  insist(
    actor.mode === record.mode &&
      (actor.id === record.owner ||
        hasRole(
          actor,
          ["platform_admin", "coordinator", "institution_admin"],
          record.scope,
        )),
    "forbidden",
    "Нет доступа к записи / Record access denied",
    403,
  );
}
export function readable(actor: Actor | null, record: RecordV2) {
  insist(
    mayRead(actor, record),
    "not_found",
    "Запись не найдена / Record not found",
    404,
  );
  return record;
}
export function actorFrom(store: Store, id: string): Actor {
  const profile = store.get(id, "identity");
  const roles = store
    .list("role_assignment", profile.mode)
    .filter(
      (r) =>
        r.data.subjectId === id &&
        r.data.status === "active" &&
        (!r.data.expiresAt || r.data.expiresAt > timestamp()),
    )
    .map((r) => ({ role: r.data.role, scope: r.scope }));
  return {
    id,
    label: profile.data.nickname,
    mode: profile.mode,
    timezone: profile.data.timezone ?? "Asia/Qyzylorda",
    roles,
  };
}
function signingKey(store: Store): string {
  const found = store.one(
    "SELECT value FROM v2_setting WHERE key='demo_session_key'",
  );
  if (found) return found.value;
  const key = randomBytes(32).toString("hex");
  store.run(
    "INSERT OR IGNORE INTO v2_setting VALUES ('demo_session_key',?)",
    key,
  );
  return store.one("SELECT value FROM v2_setting WHERE key='demo_session_key'")!
    .value;
}
export function demoEnabled() {
  return (
    process.env.NODE_ENV !== "production" || process.env.DEMO_PRODUCTION === "1"
  );
}
// DEMO_PRODUCTION only enables explicitly local production-build demonstrations.
// It is not an authentication option for pilot/production data.
export function signSession(store: Store, id: string) {
  insist(
    demoEnabled(),
    "auth_not_connected",
    "Реальная аутентификация не подключена / Production identity not connected",
    503,
  );
  const actor = actorFrom(store, id);
  insist(
    actor.mode === "demo",
    "forbidden",
    "Demo sessions are demo-only",
    403,
  );
  const payload = Buffer.from(
    JSON.stringify({ id, app: store.app, exp: Date.now() + 86400000 }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", signingKey(store)).update(payload).digest("hex")
  );
}
export function sessionActor(store: Store, token?: string): Actor | null {
  if (!token) return null;
  insist(
    demoEnabled(),
    "auth_not_connected",
    "Production identity not connected",
    503,
  );
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", signingKey(store))
    .update(payload ?? "")
    .digest("hex");
  insist(
    !!signature &&
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected)),
    "unauthorized",
    "Недействительная сессия / Invalid session",
    401,
  );
  let claim;
  try {
    claim = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    insist(false, "unauthorized", "Invalid session", 401);
  }
  insist(
    claim.app === store.app && claim.exp > Date.now(),
    "unauthorized",
    "Сессия истекла / Session expired",
    401,
  );
  const actor = actorFrom(store, claim.id);
  insist(
    actor.mode === "demo",
    "unauthorized",
    "Demo session cannot access real data",
    401,
  );
  return actor;
}
