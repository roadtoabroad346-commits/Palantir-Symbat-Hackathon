// Lightweight, dependency-free Chromium/CDP checks. Requires Node 24 and Chromium.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), "startify-globe-browser-"));
const downloads = join(temp, "downloads");
await mkdir(downloads);
const processes = [];
const clients = [];
const consoleErrors = [];
const remoteRequests = [];

function launch(command, args, extra = {}) {
  const child = spawn(command, args, {
    cwd: root,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...extra,
  });
  const owned = { child, logs: "" };
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (data) => {
      owned.logs = (owned.logs + data).slice(-16_000);
    });
  }
  child.on("error", (error) => {
    owned.logs += error.message;
  });
  processes.push(owned);
  return owned;
}
async function waitFor(check, description, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(
    `Timed out: ${description}${lastError ? ` (${lastError.message})` : ""}`,
  );
}
async function startApp(name, port) {
  const origin = `http://127.0.0.1:${port}`;
  let occupied = false;
  try {
    await fetch(origin, { signal: AbortSignal.timeout(500) });
    occupied = true;
  } catch {}
  assert(
    !occupied,
    `Port ${port} already has a server; stop it before this smoke test.`,
  );
  const owned = launch("pnpm", ["--filter", name, "start"]);
  await waitFor(async () => {
    if (owned.child.exitCode !== null) throw new Error(owned.logs);
    return (await fetch(origin, { signal: AbortSignal.timeout(1500) })).ok;
  }, `${name} server readiness`);
  return origin;
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
        if (packet.error) pending.reject(new Error(packet.error.message));
        else pending.resolve(packet.result);
      } else if (packet.method === "Network.requestWillBeSent") {
        const url = packet.params.request.url;
        if (
          /^https?:/.test(url) &&
          !/^http:\/\/(127\.0\.0\.1|localhost):3006(?:\/|$)/.test(url)
        )
          remoteRequests.push(url);
      } else if (packet.method === "Runtime.exceptionThrown") {
        consoleErrors.push(
          packet.params.exceptionDetails.text +
            ": " +
            (packet.params.exceptionDetails.exception?.description ?? ""),
        );
      } else if (
        packet.method === "Runtime.consoleAPICalled" &&
        packet.params.type === "error"
      ) {
        consoleErrors.push(
          packet.params.args
            .map((arg) => arg.value ?? arg.description ?? "")
            .join(" "),
        );
      }
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", reject, { once: true });
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
        reject(new Error(`CDP command timed out: ${method}`));
      }, 15_000);
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
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  }
  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Browser closed"));
    }
    this.pending.clear();
    this.socket.close();
  }
}
async function navigate(page, url, readySelector) {
  await page.send("Page.navigate", { url });
  await waitFor(
    () =>
      page.evaluate(
        `document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(readySelector)})`,
      ),
    `page ${url}`,
  );
  // Allow the initial React effects to finish before invoking event handlers.
  await delay(400);
}
async function newPage() {
  const target = await fetch("http://127.0.0.1:9223/json/new?about:blank", {
    method: "PUT",
  }).then((response) => response.json());
  const page = await Cdp.connect(target.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  return page;
}

async function clickText(page, text, selector = "button") {
  return page.evaluate(
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)}));if(!el)throw new Error('Missing button '+${JSON.stringify(text)});el.click();return true;})()`,
  );
}
async function timeline(page, month) {
  await page.evaluate(
    `(()=>{const el=document.querySelector('input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(month))});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`,
  );
  await waitFor(
    () =>
      page.evaluate(
        `document.querySelector('.timeline-heading strong')?.textContent.includes(${JSON.stringify(String(month).padStart(2, "0"))})`,
      ),
    `timeline month${month}`,
  );
}
async function key(page, key, code = key) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
}
try {
  const origin = await startApp("global-dashboard", 3006);
  launch(
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
      "--remote-debugging-port=9223",
      `--user-data-dir=${join(temp, "profile")}`,
      `--disk-cache-dir=${join(temp, "cache")}`,
      "about:blank",
    ],
    {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(temp, "config"),
        XDG_CACHE_HOME: join(temp, "cache"),
      },
    },
  );
  const version = await waitFor(
    () => fetch("http://127.0.0.1:9223/json/version").then((r) => r.json()),
    "Chromium CDP",
  );
  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  await browser.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloads,
  });
  const page = await newPage();
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(page, origin, ".kpi-row");
  await waitFor(
    () =>
      page.evaluate(
        "!!document.querySelector('.globe-viewport canvas') && document.querySelectorAll('.globe-direction-marker').length>=15",
      ),
    "WebGL globe and five marker shapes",
    60000,
  );
  const initialScreenshot = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    "/tmp/global-dashboard-overview.png",
    Buffer.from(initialScreenshot.data, "base64"),
  );
  const shapes = await page.evaluate(
    "[...document.querySelectorAll('.globe-direction-marker')].map(e=>e.className).join(' ')",
  );
  for (const shape of ["circle", "triangle", "square", "diamond", "hexagon"])
    assert(shapes.includes("globe-shape-" + shape), `Marker shape ${shape}`);
  assert.equal(
    await page.evaluate(
      "document.querySelectorAll('.globe-direction-marker').length",
    ),
    15,
  );
  await page.evaluate(
    "document.querySelector('button[aria-label=\"Switch language\"]').click()",
  );
  await waitFor(
    () => page.evaluate("document.documentElement.lang==='en'"),
    "English switch",
  );
  for (const [month, count] of [
    [4, 35],
    [8, 50],
    [12, 50],
  ]) {
    await timeline(page, month);
    await waitFor(
      () =>
        page.evaluate(
          `document.querySelectorAll('.globe-direction-marker').length===${count}`,
        ),
      `wave markers month${month}`,
    );
  }
  await waitFor(()=>page.evaluate("!!document.querySelector('button[data-country=\"IN\"]')"),'India marker ready after layer update');
  await page.evaluate(
    "document.querySelector('button[data-country=\"IN\"]').click()",
  );
  await waitFor(
    () =>
      page.evaluate(
        "document.querySelector('.country-drawer h2')?.textContent==='India'",
      ),
    "India country drawer",
  );
  assert(
    (
      await page.evaluate(
        "document.querySelector('.country-drawer').textContent",
      )
    )
      .toLowerCase()
      .includes("hindi"),
    "India localization insight mentions Hindi",
  );
  await page.evaluate(
    "document.querySelector('button[aria-label=\"Close country\"]').click()",
  );
  await page.evaluate("document.querySelector('.direction-card').click()");
  await waitFor(
    () =>
      page.evaluate(
        "!document.querySelector('.globe-direction-marker[data-direction=\"growth\"]')",
      ),
    "direction layer hides markers",
  );
  await page.evaluate("document.querySelector('.direction-card').click()");
  await clickText(page, "Table");
  await waitFor(
    () =>
      page.evaluate(
        "!!document.querySelector('.country-table') && document.querySelectorAll('.country-table tbody tr').length===10",
      ),
    "accessible table",
  );
  await clickText(page, "Table");
  await page.evaluate("document.activeElement.blur()");
  await key(page, "p", "KeyP");
  await waitFor(
    () =>
      page.evaluate(
        "document.querySelector('.impact-app').classList.contains('presenter')",
      ),
    "presenter P starts",
  );
  await key(page, "p", "KeyP");
  await waitFor(
    () =>
      page.evaluate(
        "!document.querySelector('.impact-app').classList.contains('presenter')",
      ),
    "presenter P exits",
  );
  assert.equal(
    await page.evaluate("document.querySelector('.play-button').textContent"),
    "▶",
    "P exit stops timeline",
  );
  await clickText(page, "Table");
  await clickText(page, "Add demo comment");
  await waitFor(
    () => page.evaluate("!!document.querySelector('.comment-form')"),
    "add-comment dialog",
  );
  await page.evaluate(
    "(()=>{const f=document.querySelector('.comment-form');f.elements.nickname.value='John Smith';f.elements.text.value='local lessons would help';f.requestSubmit();return true;})()",
  );
  await waitFor(
    () => page.evaluate("!!document.querySelector('.form-error')"),
    "PII form rejection",
  );
  await page.evaluate(
    "(()=>{const f=document.querySelector('.comment-form');f.elements.nickname.value='BrowserOrbit77';f.elements.iso.value='UZ';f.elements.direction.value='ambassador';f.elements.text.value='Short local lesson examples would help.';f.requestSubmit();return true;})()",
  );
  await waitFor(
    () =>
      page.evaluate(
        "!document.querySelector('.comment-form') && [...document.querySelectorAll('.feedback-meta strong')].some(e=>e.textContent==='BrowserOrbit77')",
      ),
    "safe feedback appears in inbox",
  );
  await waitFor(
    () =>
      page.evaluate(
        "[...document.querySelectorAll('.globe-remark')].some(e=>e.textContent.includes('BrowserOrbit77'))",
      ),
    "new feedback immediately becomes globe bubble",
    5000,
  );
  const remarkBefore = await page.evaluate(
    "document.querySelector('.globe-remark')?.textContent",
  );
  await page.evaluate(
    "document.querySelector('.globe-remark').dispatchEvent(new MouseEvent('mouseenter'))",
  );
  await delay(100);
  await page.evaluate(
    "document.querySelector('.globe-remark').dispatchEvent(new MouseEvent('mouseleave'))",
  );
  await delay(250);
  assert.equal(
    await page.evaluate("document.querySelector('.globe-remark')?.textContent"),
    remarkBefore,
    "Hover resume preserves the current remark",
  );
  await clickText(page, "Pause remarks");
  assert(
    await page.evaluate(
      "[...document.querySelectorAll('.bubble-actions button')].find(e=>e.textContent.includes('Resume remarks')).getAttribute('aria-pressed')==='true'",
    ),
  );
  await page.evaluate("document.querySelector('.globe-remark-close')?.click()");
  await waitFor(
    () =>
      page.evaluate("document.querySelectorAll('.globe-remark').length===0"),
    "bubble closes",
  );
  await page.evaluate("document.activeElement.blur()");
  await key(page, "p", "KeyP");
  await waitFor(
    () =>
      page.evaluate(
        "document.querySelector('.impact-app').classList.contains('presenter')",
      ),
    "presenter keyboard P",
  );
  await key(page, "Escape", "Escape");
  await waitFor(
    () =>
      page.evaluate(
        "!document.querySelector('.impact-app').classList.contains('presenter')",
      ),
    "presenter Escape",
  );
  const initialTheme = await page.evaluate(
    "document.documentElement.dataset.theme",
  );
  await page.evaluate(
    "document.querySelector('button[aria-label=\"Toggle theme\"]').click()",
  );
  await waitFor(
    () =>
      page.evaluate(
        `document.documentElement.dataset.theme!==${JSON.stringify(initialTheme)}`,
      ),
    "theme switch",
  );
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(400);
  const size = await page.evaluate(
    "({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})",
  );
  assert(
    size.document <= size.viewport + 1 && size.body <= size.viewport + 1,
    `390px horizontal overflow: ${JSON.stringify(size)}`,
  );
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(250);
  const screenshot = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    "/tmp/global-dashboard.png",
    Buffer.from(screenshot.data, "base64"),
  );
  const reduced = await newPage();
  await reduced.send("Page.bringToFront");
  await reduced.send("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await reduced.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await navigate(reduced, origin, ".kpi-row");
  await waitFor(
    () =>
      reduced.evaluate("!!document.querySelector('.globe-viewport canvas')"),
    "reduced-motion WebGL",
  );
  await reduced.evaluate("document.querySelector('.globe-viewport').scrollIntoView({block:'center'})");
  await waitFor(()=>reduced.evaluate("document.querySelectorAll('.globe-direction-marker').length===15"),'Reduced-motion initial marker layer ready');
  await delay(6300);
  assert.equal(
    await reduced.evaluate("document.querySelectorAll('.globe-remark').length"),
    0,
    "Reduced motion disables automatic bubbles",
  );
  await reduced.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await timeline(reduced, 8);
  await waitFor(
    () =>
      reduced.evaluate(
        "(()=>{const count=document.querySelectorAll('.globe-direction-marker').length;if(count===50)return true;throw new Error(JSON.stringify({count,range:document.querySelector('input[type=range]')?.value,table:!!document.querySelector('.country-table'),canvas:!!document.querySelector('.globe-viewport canvas'),body:document.body.textContent.slice(0,150)}));})()",
      ),
    "Offline timeline renders all50local markers",
  );
  const fallback = await newPage();
  await fallback.send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "const originalGetContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(String(kind).startsWith('webgl'))return null;return originalGetContext.call(this,kind,...args);};",
  });
  await navigate(fallback, origin, ".country-table");
  assert.equal(
    await fallback.evaluate(
      "document.querySelectorAll('.country-table tbody tr').length",
    ),
    10,
    "No-WebGL fallback retains all countries",
  );
  assert.deepEqual(remoteRequests, [], "No external runtime network requests");
  assert.deepEqual(consoleErrors, [], "No browser JavaScript errors");
  console.log(
    "Global Impact browser: WebGL globe/five shapes/waves, country insights, layers/table, public feedback validation+bubble, pause/close, presenter, theme/language,390px, reduced motion and offline timeline passed. Screenshot /tmp/global-dashboard.png",
  );
} catch (error) {
  console.error(error);
  for (const { logs } of processes) if (logs) console.error(logs.slice(-2500));
  process.exitCode = 1;
} finally {
  for (const client of clients) client.close();
  for (const { child } of processes.reverse())
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  await delay(300);
  await rm(temp, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 150,
  });
}
