import { createServer } from "node:http";
import { connect } from "node:net";
import { spawn } from "node:child_process";
import {
  readFileSync,
  existsSync,
  openSync,
  closeSync,
  mkdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { DEMO_APPS, identifyApp } from "./demo-apps.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.DEMO_PORT ?? 3000);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  DEMO_APPS.some((a) => a.port === port)
)
  throw new Error(
    "DEMO_PORT must be a free port1024–65535, excluding3001–3006",
  );
const childEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
// The managed workspace has a read-only home. Local machines keep their own cache defaults.
if (root.startsWith("/workspace/"))
  Object.assign(childEnv, {
    XDG_DATA_HOME: "/workspace/.local/share",
    XDG_CACHE_HOME: "/workspace/.cache",
    npm_config_cache: "/workspace/.npm",
  });
const logs = join(tmpdir(), "startify-demo");
mkdirSync(logs, { recursive: true });
const records = new Map(
  DEMO_APPS.map((a) => [
    a.key,
    { status: "starting", owned: false, log: join(logs, a.key + ".log") },
  ]),
);
const owned = new Map();
const starting = new Map();
let closing = false;
let statusPromise;
function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}
async function probe(app) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${app.port}${app.key === "globe" ? "/api/data" : "/api/state"}`,
      { signal: AbortSignal.timeout(2500) },
    );
    return response.ok && identifyApp(app, await response.json());
  } catch {
    return false;
  }
}
async function listening(app) {
  return new Promise((resolveDone) => {
    const socket = connect({ host: "127.0.0.1", port: app.port });
    const finish = (value) => {
      socket.destroy();
      resolveDone(value);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
async function ensureApp(app) {
  if (starting.has(app.key)) return starting.get(app.key);
  const promise = (async () => {
    const record = records.get(app.key);
    if (await probe(app)) {
      record.status = "ready";
      return;
    }
    if (owned.has(app.key) && owned.get(app.key).exitCode === null) {
      record.status = "starting";
      return;
    }
    if (await listening(app)) {
      record.status = "conflict";
      return;
    }
    const built = existsSync(join(root, "apps", app.name, ".next", "BUILD_ID"));
    const mode = built && process.env.DEMO_PRODUCTION === "1" ? "start" : "dev";
    const fd = openSync(record.log, "a");
    try {
      const processChild = spawn(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["--filter", app.name, mode],
        {
          cwd: root,
          env: childEnv,
          detached: process.platform !== "win32",
          stdio: ["ignore", fd, fd],
          shell: process.platform === "win32",
        },
      );
      owned.set(app.key, processChild);
      Object.assign(record, { status: "starting", owned: true, mode });
      processChild.once("error", () => {
        record.status = "error";
      });
      processChild.once("exit", () => {
        if (!closing) record.status = "error";
      });
    } finally {
      closeSync(fd);
    }
  })().finally(() => starting.delete(app.key));
  starting.set(app.key, promise);
  return promise;
}
async function statuses() {
  if (statusPromise) return statusPromise;
  statusPromise = Promise.all(
    DEMO_APPS.map(async (app) => {
      const record = records.get(app.key);
      if (await probe(app)) record.status = "ready";
      else if (record.status === "ready")
        record.status = record.owned ? "starting" : "conflict";
      return { ...app, status: record.status };
    }),
  ).finally(() => {
    statusPromise = undefined;
  });
  return statusPromise;
}
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 4096) throw new Error("Request too large");
  }
  return text ? JSON.parse(text) : {};
}
const files = new Map([
  ["/demo-apps.mjs", ["../scripts/demo-apps.mjs", "text/javascript"]],
  ["/", ["index.html", "text/html"]],
  ["/demo.js", ["demo.js", "text/javascript"]],
  ["/demo.css", ["demo.css", "text/css"]],
]);
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://demo.local").pathname;
    if (req.method === "GET" && path === "/api/status") {
      json(res, 200, { apps: await statuses() });
      return;
    }
    if (req.method === "POST") {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) {
        json(res, 403, {
          error: "Недопустимый источник запроса / Invalid origin",
        });
        return;
      }
      const match = path.match(/^\/api\/(launch|retry)\/([a-z]+)$/);
      const app = match && DEMO_APPS.find((a) => a.key === match[2]);
      if (!app) {
        json(res, 404, { error: "Unknown demo" });
        return;
      }
      await body(req);
      if (match[1] === "retry") {
        await ensureApp(app);
        json(res, 200, { ok: true });
        return;
      }
      if (!(await probe(app))) {
        json(res, 503, {
          error:
            "Приложение ещё запускается. Подождите немного и попробуйте снова. / App is starting. Please try again shortly.",
        });
        return;
      }
      const upstream = `http://127.0.0.1:${app.port}`;
      const session = await fetch(upstream + "/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: upstream },
        body: JSON.stringify(
          app.key === "globe" ? { admin: true } : { role: app.role },
        ),
        signal: AbortSignal.timeout(10000),
      });
      if (!session.ok)
        throw new Error(
          "Не удалось включить демороль / Demo role could not be set",
        );
      json(
        res,
        200,
        { ok: true, port: app.port, route: app.route },
        { "Set-Cookie": session.headers.getSetCookie() },
      );
      return;
    }
    if (req.method === "GET" && path === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    const file = files.get(path);
    if (req.method !== "GET" || !file) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": file[1] + "; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(readFileSync(join(root, "demo", file[0])));
  } catch (error) {
    json(res, 400, {
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
});
async function cleanup() {
  if (closing) return;
  closing = true;
  for (const child of owned.values()) {
    if (child.exitCode !== null) continue;
    try {
      if (process.platform === "win32")
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  server.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 700).unref();
}
process.once("SIGINT", cleanup);
process.once("SIGTERM", cleanup);
server.once("error", (error) => {
  console.error(`Demo hub could not start on port${port}: ${error.message}`);
  process.exitCode = 1;
  cleanup();
});
server.listen(port, "0.0.0.0", () => {
  console.log(
    `\nAI Startify demo hub: http://localhost:${port}\nOne page for six demos. Logs: ${logs}\nCtrl-C stops only services started by this launcher.\n`,
  );
  // On a local computer, open the single entry page automatically.
  // Cloud sessions without a desktop display keep the URL available in the terminal.
  if (
    process.env.DEMO_NO_OPEN !== "1" &&
    (process.platform === "win32" ||
      process.platform === "darwin" ||
      process.env.DISPLAY ||
      process.env.WAYLAND_DISPLAY)
  ) {
    const url = `http://localhost:${port}`;
    const command =
      process.platform === "win32"
        ? "cmd"
        : process.platform === "darwin"
          ? "open"
          : "xdg-open";
    const args =
      process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const browser = spawn(command, args, { stdio: "ignore", detached: true });
    browser.on("error", () => console.log(`Open ${url} in your browser.`));
    browser.unref();
  }
  Promise.all(DEMO_APPS.map(ensureApp)).catch((error) =>
    console.error(error.message),
  );
});
