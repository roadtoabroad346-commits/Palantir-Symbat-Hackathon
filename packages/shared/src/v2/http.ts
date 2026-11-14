import { randomUUID } from "node:crypto";
import type { App, Data } from "./types";
import { HubError, insist } from "./types";
import { HubService } from "./service";
import { authenticateEvent, flush } from "./events";
import { Store } from "./store";
import { join, basename } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
const services = new Map<App, HubService>();
export function getHub(app: App) {
  let service = services.get(app);
  if (service) return service;
  const root =
    basename(process.cwd()) === app
      ? process.cwd()
      : join(process.cwd(), "apps", app);
  const path = process.env.V2_DATABASE_PATH ?? join(root, "prisma/demo.db");
  insist(
    existsSync(path),
    "database_not_prepared",
    "Запустите pnpm db:prepare / Run pnpm db:prepare",
    503,
  );
  mkdirSync(join(root, "prisma"), { recursive: true });
  service = new HubService(new Store(app, path));
  services.set(app, service);
  return service;
}
export async function limitedBody(req: Request, max = 65536) {
  const reader = req.body?.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  if (reader)
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
          await reader.cancel();
          insist(false, "body_too_large", "Request exceeds 64 KiB", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  return Buffer.concat(chunks).toString("utf8");
}
function cookie(req: Request, name: string) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
function htmlEscape(value: unknown) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function assertSameOrigin(req: Request) {
  const value = req.headers.get("origin");
  insist(
    value &&
      new URL(value).host ===
        (req.headers.get("host") ?? new URL(req.url).host) &&
      new URL(value).protocol === new URL(req.url).protocol,
    "invalid_origin",
    "Нужен тот же origin / Same origin required",
    403,
  );
}
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
export function hubHandler(app: App) {
  return async (
    req: Request,
    { params }: { params: Promise<{ path: string[] }> },
  ) => {
    const requestId = randomUUID(),
      cookieName = `hub-v2-${app}`;
    const json = (
      body: Data,
      status = 200,
      extra: Record<string, string> = {},
    ) =>
      Response.json(
        { ...body, requestId },
        { status, headers: { ...headers, ...extra } },
      );
    try {
      const service = getHub(app),
        url = new URL(req.url),
        { path } = await params,
        operation = path.join("/");
      if (req.method === "GET" && operation === "health")
        return json({
          app,
          schemaVersion: 2,
          dataModes: ["demo", "pilot", "production"],
          authentication: "local_demo_only",
          upstream: "not_connected",
        });
      if (req.method === "POST" && operation === "events") {
        const body = await limitedBody(req, 262144);
        service.store.rate("event_ingestion", 300);
        return json(service.receive(body, req.headers));
      }
      if (req.method === "POST" && operation === "relay") {
        const body = await limitedBody(req);
        authenticateEvent(body, req.headers);
        service.store.rate("relay", 30);
        return json(await flush(service.store));
      }
      if (
        req.method === "POST" &&
        ["consent-check", "verification-check"].includes(operation)
      ) {
        const body = await limitedBody(req);
        authenticateEvent(body, req.headers);
        const query = JSON.parse(body);
        return json(
          service.proofCheck(
            query,
            operation === "consent-check"
              ? "project"
              : query.kind === "metric"
                ? "metric"
                : "evidence",
          ),
        );
      }
      const actor = service.actor(cookie(req, cookieName));
      if (req.method === "GET") {
        if (operation === "state")
          return json(
            service.workspace(
              actor,
              url.searchParams.get("section") ?? "",
              url.searchParams.get("selected") ?? undefined,
            ),
          );
        if (path[0] === "records") {
          insist(actor, "unauthorized", "Выберите профиль / Sign in", 401);
          if (path[2]) return json({ record: service.read(actor, path[2]) });
          const limit = Number(url.searchParams.get("limit") ?? 50),
            offset = Number(url.searchParams.get("offset") ?? 0);
          insist(
            Number.isInteger(limit) &&
              limit >= 1 &&
              limit <= 100 &&
              Number.isInteger(offset) &&
              offset >= 0,
            "invalid_pagination",
            "Invalid pagination",
          );
          return json({
            items: service.records(actor, path[1], limit, offset),
            limit,
            offset,
          });
        }
        if (operation === "countries") return json(service.countries(actor));
        if (path[0] === "artifacts" && path[1]) {
          const a = service.artifact(actor, path[1]);
          return new Response(a.body, {
            headers: {
              ...headers,
              "Content-Type": a.contentType,
              "Content-Disposition": `attachment; filename="${a.filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
            },
          });
        }
        if (path[0] === "evidence-packs" && path[1]) {
          const format = url.searchParams.get("format") ?? "json";
          insist(
            ["json", "csv", "html"].includes(format),
            "invalid_format",
            "Supported: JSON, CSV, printable HTML",
          );
          await service.validatePublicExport(path[1], actor);
          const result = service.export(actor, path[1], format);
          return new Response(result.body, {
            headers: {
              ...headers,
              "Content-Type": result.contentType,
              "Content-Security-Policy":
                "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
              "Content-Disposition": `${format === "html" ? "inline" : "attachment"}; filename="${result.filename}"`,
            },
          });
        }
        if (path[0] === "landing" && path[1] && app === "growth-engine") {
          const c = service.store.get(path[1], "marketing_campaign");
          insist(
            c.data.status === "approved",
            "form_closed",
            "Campaign not approved",
            404,
          );
          const requestedSource =
            url.searchParams.get("source") === c.data.source
              ? c.data.source
              : "direct";
          const visitorCookie = `hub-visitor-${c.id}`,
            previous = cookie(req, visitorCookie)?.split(".");
          const visitorToken =
            previous && /^[a-f0-9-]{36}$/.test(previous[0])
              ? previous[0]
              : randomUUID();
          const source =
            previous?.[1] === c.data.source ? c.data.source : requestedSource;
          return new Response(
            `<!doctype html><html lang="${c.data.language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(c.data.title)}</title><style>body{font:18px/1.6 system-ui;max-width:640px;margin:auto;padding:24px;background:#f6f8f3;color:#17241d}label{display:block;margin:20px 0}input,textarea,button{display:block;font:inherit;padding:12px;width:100%;box-sizing:border-box}input[type=checkbox]{display:inline;width:auto}button{background:#204c35;color:white;border:0;border-radius:8px}</style><p>${htmlEscape(c.mode.toUpperCase())} · AI Startify Growth Hub</p><h1>${htmlEscape(c.data.title)}</h1><p>${htmlEscape(c.data.description)}</p><p>${htmlEscape(c.data.advantages)}</p><p>${htmlEscape(c.data.limitations)}</p><form method="post" action="/api/v2/landing/${c.id}"><input type="hidden" name="source" value="${htmlEscape(source)}"><input type="hidden" name="visitorToken" value="${visitorToken}"><label>Никнейм / Nickname<input name="nickname" required maxlength="40" autocomplete="off"></label><label>Ваш добровольный отклик / Your voluntary response<textarea name="response" required maxlength="2000"></textarea></label><label><input type="checkbox" name="consent" value="true" required> Разрешаю обработку заявки / I consent to processing this application</label><button>${htmlEscape(c.data.cta)}</button></form><p>Не указывайте личные контакты учащихся. / Do not enter students' personal contacts.</p></html>`,
            {
              headers: {
                ...headers,
                "Set-Cookie": `${visitorCookie}=${visitorToken}.${source}; Path=/api/v2/landing/${c.id}; HttpOnly; SameSite=Strict; Max-Age=2592000`,
                "Content-Type": "text/html; charset=utf-8",
                "Content-Security-Policy":
                  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'",
              },
            },
          );
        }
        insist(false, "not_found", "Endpoint not found", 404);
      }
      insist(req.method === "POST", "method_not_allowed", "POST required", 405);
      assertSameOrigin(req);
      const body = await limitedBody(req);
      let d: Data;
      if (
        req.headers
          .get("content-type")
          ?.startsWith("application/x-www-form-urlencoded")
      )
        d = Object.fromEntries(new URLSearchParams(body));
      else {
        try {
          d = JSON.parse(body);
        } catch {
          throw new HubError("invalid_json", "Invalid JSON");
        }
      }
      insist(
        d && typeof d === "object" && !Array.isArray(d),
        "invalid_input",
        "JSON object required",
      );
      service.store.rate(actor?.id ?? "public_mutation", actor ? 120 : 30);
      if (operation === "session") {
        const session = service.session(String(d.subjectId ?? ""));
        return json({ actor: session.actor }, 200, {
          "Set-Cookie": `${cookieName}=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
        });
      }
      if (operation === "logout")
        return json({ ok: true }, 200, {
          "Set-Cookie": `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
        });
      if (operation === "identity") {
        const result = service.register(
          d,
          req.headers.get("idempotency-key") ?? "",
        );
        return json({ actor: result.actor }, 201, {
          "Set-Cookie": `${cookieName}=${result.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
        });
      }
      if (path[0] === "landing" && path[1]) {
        const result = service.inbound(path[1], d);
        if (
          req.headers
            .get("content-type")
            ?.startsWith("application/x-www-form-urlencoded")
        )
          return new Response(
            `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Заявка сохранена / Application saved</title><main style="font:18px/1.6 system-ui;max-width:640px;margin:48px auto;padding:24px"><p>DEMO · AI Startify</p><h1>Заявка сохранена</h1><p>Application saved. Повторная отправка этой формы не создаст вторую заявку.</p><p>Это добровольная заявка на участие. Она не подтверждает покупку или активацию AI Startify.</p><a href="/api/v2/landing/${path[1]}">Вернуться / Back</a></main></html>`,
            {
              status: 201,
              headers: {
                ...headers,
                "Content-Type": "text/html; charset=utf-8",
                "Content-Security-Policy":
                  "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
              },
            },
          );
        return json(result, 201);
      }
      insist(actor, "unauthorized", "Нужен вход / Sign in required", 401);
      if (operation === "sync") return json(await service.sync(actor));
      if (operation === "rebuild") return json(service.rebuild(actor));
      if (path[0] === "actions" && path.length === 2) {
        const key = req.headers.get("idempotency-key") ?? "";
        const result =
          path[1] === "discovery.fetch"
            ? await service.discover(actor, d, key)
            : service.mutate(actor, path[1], d, key);
        return json({ result }, 201);
      }
      insist(false, "not_found", "Endpoint not found", 404);
    } catch (error) {
      const known = error instanceof HubError;
      return json(
        {
          error: {
            code: known ? error.code : "request_failed",
            message: known
              ? error.message
              : error instanceof Error &&
                  /Email|phone|name|Public|public/.test(error.message)
                ? error.message
                : "Не удалось выполнить запрос / Request failed",
          },
        },
        known ? error.status : 400,
      );
    }
  };
}
