// Checks the already-running demo hub and its apps; owns only its temporary Chromium.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DEMO_APPS } from "./demo-apps.mjs";

const origin = process.env.DEMO_TEST_ORIGIN ?? "http://127.0.0.1:3000";
const temp = await mkdtemp(join(tmpdir(), "startify-demo-browser-"));
const profile = join(temp, "profile");
const clients = [];
const errors = [];
let chromium;
let logs = "";
async function waitFor(check, description, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await delay(150);
  }
  throw new Error(
    `Timed out: ${description}${last ? ": " + last.message : ""}`,
  );
}
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const packet = JSON.parse(event.data);
      if (packet.id) {
        const p = this.pending.get(packet.id);
        if (!p) return;
        this.pending.delete(packet.id);
        clearTimeout(p.timer);
        packet.error
          ? p.reject(new Error(packet.error.message))
          : p.resolve(packet.result);
      } else if (
        packet.method === "Runtime.consoleAPICalled" &&
        packet.params.type === "error"
      )
        errors.push(
          packet.params.args
            .map((x) => x.value ?? x.description ?? "")
            .join(" "),
        );
      else if (packet.method === "Runtime.exceptionThrown")
        errors.push(
          packet.params.exceptionDetails.exception?.description ??
            packet.params.exceptionDetails.text,
        );
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const c = new Cdp(socket);
    clients.push(c);
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, contextId) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      contextId,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
      );
    return r.result.value;
  }
  close() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Closing browser"));
    }
    this.pending.clear();
    this.socket.close();
  }
}
function childFrame(tree, port) {
  if (
    tree.frame.url.startsWith(
      new URL(origin).protocol +
        "//" +
        new URL(origin).hostname +
        ":" +
        port +
        "/",
    )
  )
    return tree.frame;
  for (const c of tree.childFrames ?? []) {
    const match = childFrame(c, port);
    if (match) return match;
  }
  return null;
}
async function frameEvaluate(page, app, expression) {
  const tree = await page.send("Page.getFrameTree");
  const frame = childFrame(tree.frameTree, app.port);
  if (!frame) throw new Error(`Iframe ${app.key} not loaded`);
  const world = await page.send("Page.createIsolatedWorld", {
    frameId: frame.id,
    worldName: "startify-demo-smoke",
  });
  return page.evaluate(expression, world.executionContextId);
}
async function click(page, selector) {
  return page.evaluate(
    `(()=>{const button=document.querySelector(${JSON.stringify(selector)});if(!button)throw new Error('Missing control: '+${JSON.stringify(selector)});button.click();return true;})()`,
  );
}
async function openApp(page, app, hero = false) {
  await click(page, hero ? "#open-globe" : `button[data-app="${app.key}"]`);
  await waitFor(
    () =>
      page.evaluate(
        `!document.querySelector('#viewer').hidden&&location.hash===${JSON.stringify("#" + app.key)}&&new URL(document.querySelector('#app-frame').src).port===${JSON.stringify(String(app.port))}`,
      ),
    `${app.key} iframe and hub hash`,
  );
  await waitFor(
    () =>
      frameEvaluate(
        page,
        app,
        "document.readyState==='complete'&&!!document.querySelector('h1')",
      ),
    `${app.key} page loaded`,
    60000,
  );
  const session = await frameEvaluate(
    page,
    app,
    app.key === "globe"
      ? "fetch('/api/session').then(r=>r.json())"
      : "fetch('/api/state').then(r=>r.json())",
  );
  if (app.key === "globe")
    assert.equal(
      session.admin,
      true,
      "Globe enters demo admin without sign-up",
    );
  else {
    assert.equal(session.app, app.name);
    assert.equal(session.role, app.role, `${app.key} demo role`);
    assert.equal(
      await frameEvaluate(
        page,
        app,
        "document.querySelector('.role select')?.value",
      ),
      app.role,
    );
  }
  if (app.key !== "globe") {
    const previous = await frameEvaluate(
      page,
      app,
      "document.documentElement.lang",
    );
    await frameEvaluate(
      page,
      app,
      "document.querySelector('button[aria-label=\"Switch language\"]').click()",
    );
    await waitFor(
      () =>
        frameEvaluate(
          page,
          app,
          `document.documentElement.lang!==${JSON.stringify(previous)}`,
        ),
      `${app.key} hydrated language control`,
    );
  }
  assert.equal(await page.evaluate("location.hash"), "#" + app.key);
  console.log(`Demo hub: ${app.key} opens correct iframe with demo access.`);
}
async function home(page) {
  await click(page, "#back");
  await waitFor(
    () =>
      page.evaluate(
        "!document.querySelector('#home').hidden&&document.querySelector('#viewer').hidden&&location.hash===''",
      ),
    "back to hub",
  );
}
try {
  const ready = await waitFor(
    async () => {
      const r = await fetch(origin + "/api/status", {
        signal: AbortSignal.timeout(7000),
      });
      if (!r.ok) return false;
      const s = await r.json();
      return s.apps?.length === 6 && s.apps.every((a) => a.status === "ready")
        ? s
        : null;
    },
    "all six demo apps ready",
    90000,
  );
  assert.deepEqual(
    ready.apps.map((a) => a.key).sort(),
    DEMO_APPS.map((a) => a.key).sort(),
  );
  chromium = spawn(
    process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      `--disk-cache-dir=${join(temp, "cache")}`,
      "about:blank",
    ],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(temp, "config"),
        XDG_CACHE_HOME: join(temp, "cache"),
      },
    },
  );
  chromium.stdout.on("data", (b) => (logs = (logs + b).slice(-10000)));
  chromium.stderr.on("data", (b) => (logs = (logs + b).slice(-10000)));
  const debugPort = await waitFor(
    async () =>
      Number(
        (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
          "\n",
        )[0],
      ),
    "Chromium debugger",
  );
  const target = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?about:blank`,
    { method: "PUT" },
  ).then((r) => r.json());
  const page = await Cdp.connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send("Page.navigate", { url: origin });
  await waitFor(
    () =>
      page.evaluate(
        "document.querySelectorAll('.card').length===6&&document.querySelectorAll('.card .status.ready').length===6&&document.querySelector('#open-globe')?.disabled===false",
      ),
    "six ready hub cards",
  );
  const hub = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    "/tmp/startify-demo-hub.png",
    Buffer.from(hub.data, "base64"),
  );
  const globe = DEMO_APPS.find((a) => a.key === "globe");
  await openApp(page, globe, true);
  await waitFor(
    () =>
      frameEvaluate(page, globe, "!!document.querySelector('.globe-viewport')"),
    "embedded globe viewport",
    60000,
  );
  await frameEvaluate(
    page,
    globe,
    "document.querySelector('.globe-viewport').scrollIntoView({block:'center'})",
  );
  await waitFor(
    () =>
      frameEvaluate(
        page,
        globe,
        "(()=>{const canvas=!!document.querySelector('.globe-viewport canvas');const markers=document.querySelectorAll('.globe-direction-marker').length;if(canvas&&markers>=15)return true;throw new Error(JSON.stringify({canvas,markers,stage:document.querySelector('.atlas-stage')?.textContent.slice(0,300),initial:document.querySelector('.initial-state')?.textContent,head:document.querySelector('h1')?.textContent}));})()",
      ),
    "embedded real WebGL globe",
    60000,
  );
  await frameEvaluate(
    page,
    globe,
    "document.querySelector('.globe-viewport').scrollIntoView({block:'center'})",
  );
  await delay(350);
  const globeShot = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    "/tmp/startify-demo-globe.png",
    Buffer.from(globeShot.data, "base64"),
  );
  await home(page);
  const innerRoutes = {
    growth: "/analytics",
    ambassador: "/tasks",
    challenge: "/showcase",
    portal: "/lesson-kit",
    league: "/card",
  };
  for (const app of DEMO_APPS.filter((a) => a.key !== "globe")) {
    await openApp(page, app);
    const route = innerRoutes[app.key];
    await frameEvaluate(
      page,
      app,
      `(()=>{const a=[...document.querySelectorAll('a[href]')].find(a=>new URL(a.href,location.href).pathname===${JSON.stringify(route)});if(!a)throw new Error('Missing inner navigation');a.click();return true;})()`,
    );
    await waitFor(
      () =>
        frameEvaluate(
          page,
          app,
          `location.pathname===${JSON.stringify(route)}&&document.readyState==='complete'&&!!document.querySelector('h1')`,
        ),
      `${app.key} internal navigation`,
      60000,
    );
    assert.equal(
      await page.evaluate("location.hash"),
      "#" + app.key,
      "Hub remains on chosen product during internal navigation",
    );
    await home(page);
  }
  await click(page, "#language");
  await waitFor(
    () =>
      page.evaluate(
        "document.documentElement.lang==='en'&&document.querySelector('#open-globe').textContent.includes('Open the 3D globe')",
      ),
    "English copy",
  );
  assert(
    await page.evaluate(
      "document.querySelector('#ready-summary').textContent.includes('6 of 6')",
    ),
  );
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(350);
  const size = await page.evaluate(
    "({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})",
  );
  assert(
    size.document <= size.viewport + 1 && size.body <= size.viewport + 1,
    `Hub390px overflow: ${JSON.stringify(size)}`,
  );
  await openApp(page, globe, true);
  const mobile = await page.evaluate(
    "({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})",
  );
  assert(
    mobile.document <= mobile.viewport + 1 &&
      mobile.body <= mobile.viewport + 1,
    `Viewer390px overflow: ${JSON.stringify(mobile)}`,
  );
  await home(page);
  assert.deepEqual(errors, [], "No uncaught browser JavaScript errors");
  console.log(
    "Demo hub browser PASS: six ready cards, real embedded 3D globe, automatic demo roles, all five internal app navigations, hub hash, English and390px layout.",
  );
  console.log(
    "Screenshots: /tmp/startify-demo-hub.png and /tmp/startify-demo-globe.png",
  );
} catch (error) {
  console.error(error);
  if (logs) console.error(logs.slice(-1800));
  process.exitCode = 1;
} finally {
  for (const c of clients) c.close();
  if (chromium)
    try {
      process.kill(-chromium.pid, "SIGTERM");
    } catch {}
  await delay(250);
  await rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 150,
  });
}
