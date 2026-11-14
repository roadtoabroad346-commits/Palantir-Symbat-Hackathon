// Repeatable native-CDP checks; uses an isolated SQLite file and its own Chromium.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  temp = await mkdtemp(join(tmpdir(), "startify-v2-browser-")),
  file = join(temp, "studio.db"),
  origin = "http://127.0.0.1:3007",
  debug = "http://127.0.0.1:9223",
  processes = [],
  clients = [],
  consoleErrors = [];
const screenshots =
  process.env.V2_SCREENSHOT_DIR ?? join(root, "work/browser-evidence");
await mkdir(screenshots, { recursive: true });
const sqlite = new DatabaseSync(file);
for (const migration of ["001_init.sql", "002_growth_hub_v2.sql"])
  sqlite.exec(
    await readFile(
      join(root, "apps/founder-studio/prisma/migrations", migration),
      "utf8",
    ),
  );
sqlite.close();
function launch(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const owned = { child, logs: "" };
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (b) => (owned.logs = (owned.logs + b).slice(-16000)));
  processes.push(owned);
  return owned;
}
async function waitFor(check, label, timeout = 45000) {
  const end = Date.now() + timeout;
  let error;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (e) {
      error = e;
    }
    await delay(150);
  }
  throw Error(`${label}: ${error?.message ?? "timeout"}`);
}
async function start() {
  let occupied = false;
  try {
    await fetch(origin, { signal: AbortSignal.timeout(500) });
    occupied = true;
  } catch {}
  assert(!occupied, "Stop the service on 3007 before this suite");
  const owned = launch("pnpm", ["--filter", "founder-studio", "start"], {
    DEMO_PRODUCTION: "1",
    V2_DATABASE_PATH: file,
  });
  await waitFor(async () => {
    if (owned.child.exitCode !== null || owned.child.signalCode !== null)
      throw Error(owned.logs);
    return (await fetch(origin + "/api/v2/health")).ok;
  }, "Founder startup");
  return owned;
}
async function stop(owned) {
  if (owned.child.exitCode !== null || owned.child.signalCode !== null) return;
  try {
    process.kill(-owned.child.pid, "SIGTERM");
  } catch {}
  await waitFor(
    () => owned.child.exitCode !== null || owned.child.signalCode !== null,
    "Process shutdown",
    10000,
  );
}
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const packet = JSON.parse(event.data);
      if (packet.id) {
        const pending = this.pending.get(packet.id);
        if (!pending) return;
        this.pending.delete(packet.id);
        clearTimeout(pending.timer);
        if (packet.error) pending.reject(Error(packet.error.message));
        else pending.resolve(packet.result);
      } else if (packet.method === "Runtime.exceptionThrown")
        consoleErrors.push(
          packet.params.exceptionDetails.exception?.description ??
            packet.params.exceptionDetails.text,
        );
      else if (
        packet.method === "Runtime.consoleAPICalled" &&
        packet.params.type === "error"
      )
        consoleErrors.push(
          packet.params.args.map((a) => a.value ?? a.description).join(" "),
        );
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((yes, no) => {
      socket.addEventListener("open", yes, { once: true });
      socket.addEventListener("error", no, { once: true });
    });
    const client = new Cdp(socket);
    clients.push(client);
    return client;
  }
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolvePacket, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error("CDP timeout: " + method));
      }, 15000);
      this.pending.set(id, { resolve: resolvePacket, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  }
  close() {
    this.socket.close();
  }
}
async function navigate(page, path) {
  await page.send("Page.navigate", { url: origin + path });
  await waitFor(
    () =>
      page.evaluate(
        "document.readyState==='complete' && document.querySelector('.hub-profile select')?.options.length>1",
      ),
    "Workspace rendered",
  );
  await delay(250);
}
async function route(page, label) {
  await page.evaluate(
    `(()=>{const button=[...document.querySelectorAll('.hub-sidebar nav button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing navigation');button.click();return true;})()`,
  );
  await waitFor(
    () =>
      page.evaluate(
        `document.querySelector('h1')?.textContent.trim()===${JSON.stringify(label)}`,
      ),
    "Route " + label,
  );
}
async function submit(page, op, values) {
  await page.evaluate(
    `(()=>{const form=[...document.querySelectorAll('form')].find(f=>f.closest('.hub-action')?.querySelector('summary')?.textContent.includes(${JSON.stringify(op)}));if(!form)throw Error('Form not found: '+${JSON.stringify(op)});form.closest('.hub-action').open=true;for(const[name,value]of Object.entries(${JSON.stringify(values)})){const field=form.elements.namedItem(name);if(!field)throw Error('Missing '+name);field.value=String(value);field.dispatchEvent(new Event('change',{bubbles:true}));}if(!form.checkValidity())throw Error('Invalid form '+[...form.elements].filter(x=>x.validity&&!x.validity.valid).map(x=>x.name).join(','));form.requestSubmit();return true;})()`,
  );
}
async function state(page, section) {
  return page.evaluate(
    `fetch('/api/v2/state?section='+${JSON.stringify(section)}).then(r=>r.json())`,
  );
}
try {
  let server = await start();
  launch(
    process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-breakpad",
      "--remote-debugging-port=9223",
      `--user-data-dir=${join(temp, "profile")}`,
      "about:blank",
    ],
    {
      XDG_CONFIG_HOME: join(temp, "config"),
      XDG_CACHE_HOME: join(temp, "cache"),
    },
  );
  await waitFor(
    () => fetch(debug + "/json/version").then((r) => r.json()),
    "Chromium",
  );
  const target = await fetch(debug + "/json/new?about:blank", {
      method: "PUT",
    }).then((r) => r.json()),
    page = await Cdp.connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(page, "/v2?section=project");
  await page.evaluate(
    "(()=>{const select=document.querySelector('.hub-profile select');select.value=[...select.options].find(o=>o.textContent==='NovaSolo').value;select.dispatchEvent(new Event('change',{bubbles:true}));return true;})()",
  );
  await waitFor(
    () =>
      page.evaluate(
        "document.querySelector('.hub-context')?.textContent.includes('founder')&&!!document.querySelector('input[name=title]')",
      ),
    "Demo profile selection",
  );
  const input = {
    title: "browser orbit",
    problem: "Save useful observations",
    audience: "Teachers",
    stage: "prototype",
    country: "KZ",
  };
  await page.evaluate(
    `(()=>{const form=document.querySelector('.hub-action[open] form');for(const[name,value]of Object.entries(${JSON.stringify(input)})){const field=form.elements.namedItem(name);field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()`,
  );
  await navigate(page, "/v2?section=project");
  assert.equal(
    await page.evaluate(
      "document.querySelector('.hub-action[open] form input[name=title]').value",
    ),
    input.title,
    "Local draft restored after refresh",
  );
  await submit(page, "Начать индивидуальный", input);
  await waitFor(async () => {
    const s = await state(page, "project");
    return s.records
      .find((r) => r.title.includes("Мои проекты"))
      ?.items.some((p) => p.title === input.title);
  }, "Project persisted");
  const ps = (await state(page, "project")).records.find((r) =>
    r.title.includes("Мои проекты"),
  ).items;
  assert.equal(ps.length, 1);
  assert.equal(ps[0].institutionId, null, "No implicit institution");
  assert(!ps[0].teamId, "No mandatory team");
  await route(page, "Учёба");
  await submit(page, "Сохранить действие", {
    missionId: "trial",
    artifact: "A saved browser observation",
    source: "A human-recorded local fixture",
    limitations: "One preliminary observation",
  });
  await waitFor(async () => {
    const s = await state(page, "learning");
    return s.records.some((r) =>
      r.items.some((i) => i.artifact === "A saved browser observation"),
    );
  }, "Mission persistence");
  await stop(server);
  server = await start();
  await navigate(page, "/v2?section=learning");
  assert(
    (await state(page, "learning")).records.some((r) =>
      r.items.some((i) => i.artifact === "A saved browser observation"),
    ),
    "Progress survives server restart and new request session",
  );
  await route(page, "Прототип");
  await submit(page, "Сохранить мини-ТЗ", {
    "brief.user": "Teacher",
    "brief.task": "Save one entry",
    "brief.actions": "Enter, save, reopen",
    "brief.data": "An observation",
    "brief.constraints": "No contacts",
    "brief.errors": "Explain empty input",
    "brief.acceptance": "Same value after reload",
    route: "existing",
    url: "https://example.org/prototype",
    change: "Human-connected prototype",
  });
  await waitFor(async () => {
    const s = await state(page, "prototype");
    return s.records.some((r) =>
      r.items.some((i) => i.kind === "prototype_version"),
    );
  }, "Prototype version persisted");
  await waitFor(
    () =>
      page.evaluate(
        "document.querySelector('select[name=prototypeId]')?.options.length > 1",
      ),
    "Prototype version choices loaded",
  );
  const prototypeState = await state(page, "prototype");
  const savedVersion = prototypeState.records
    .flatMap((group) => group.items)
    .find((item) => item.kind === "prototype_version");
  const checks = { prototypeId: savedVersion.id };
  for (const check of [
    "main_path",
    "empty_input",
    "invalid_input",
    "save",
    "reopen",
    "unavailable",
    "recovery",
  ]) {
    checks[`checks.${check}.status`] = "passed";
    checks[`checks.${check}.expected`] = "Specified behavior";
    checks[`checks.${check}.observed`] = "Human observed the behavior";
    checks[`checks.${check}.reproduce`] = "Repeat the documented action";
  }
  await submit(page, "Записать проверку", checks);
  await waitFor(async () => {
    const s = await state(page, "prototype");
    return s.records.some((r) =>
      r.items.some((i) => i.kind === "prototype_check" && i.passed),
    );
  }, "Human functional checks persisted");
  for (const width of [320, 375, 390, 844]) {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: width === 844 ? 390 : 844,
      deviceScaleFactor: 1,
      mobile: width < 720,
    });
    await delay(150);
    const sizes = await page.evaluate(
      "({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})",
    );
    assert(
      sizes.document <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1,
      `Overflow at ${width}: ${JSON.stringify(sizes)}`,
    );
    if (width === 390) {
      await page.evaluate("window.scrollTo(0,0)");
      const shot = await page.send("Page.captureScreenshot", { format: "png" });
      await writeFile(
        join(screenshots, "founder-mobile-390.png"),
        Buffer.from(shot.data, "base64"),
      );
    }
  }
  await page.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  assert(
    await page.evaluate(
      "matchMedia('(prefers-reduced-motion:reduce)').matches",
    ),
  );
  await page.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await page.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  assert(await page.evaluate("document.activeElement!==document.body"));
  await page.evaluate(
    "document.querySelector('button[aria-label=\"Switch language\"]').click()",
  );
  await waitFor(
    () =>
      page.evaluate(
        "document.documentElement.lang==='en' && document.querySelector('h1').textContent==='Prototype'",
      ),
    "English interface",
  );
  await page.evaluate(
    "document.querySelector('button[aria-label=\"Toggle theme\"]').click()",
  );
  await waitFor(
    () => page.evaluate("document.documentElement.dataset.hubTheme==='dark'"),
    "Dark theme",
  );
  const contrast = await page.evaluate(
    `(()=>{const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});const luminance=s=>{const[a,b,c]=rgb(s);return .2126*a+.7152*b+.0722*c;};const style=getComputedStyle(document.querySelector('.hub-workspace')),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);})()`,
  );
  assert(contrast >= 4.5, `Dark body contrast: ${contrast}`);
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.evaluate("window.scrollTo(0,0)");
  await delay(150);
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    join(screenshots, "founder-desktop-dark.png"),
    Buffer.from(shot.data, "base64"),
  );
  assert.deepEqual(consoleErrors, [], "Browser console errors");
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        story:
          "UI profile → optional-school solo project → local draft restore → persisted mission → server restart → prototype brief → seven human checks",
        viewports: [320, 375, 390, 844],
        languages: ["ru", "en"],
        reducedMotion: true,
        keyboard: true,
        darkContrast: contrast,
        consoleErrors,
        screenshots,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  for (const p of processes) console.error(p.logs);
  throw error;
} finally {
  clients.forEach((c) => c.close());
  for (const p of processes.reverse()) await stop(p).catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
