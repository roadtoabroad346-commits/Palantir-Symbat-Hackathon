// Lightweight, dependency-free Chromium/CDP checks. Requires Node 24 and Chromium.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'startify-browser-'));
const downloads = join(temp, 'downloads');
await mkdir(downloads);
const processes = [];
const clients = [];
const consoleErrors = [];

function launch(command, args, extra = {}) {
  const child = spawn(command, args, {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], ...extra,
  });
  const owned = {child, logs: ''};
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', data => {owned.logs = (owned.logs + data).slice(-16_000);});
  }
  child.on('error', error => {owned.logs += error.message;});
  processes.push(owned);
  return owned;
}
async function waitFor(check, description, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {const result = await check(); if (result) return result;} catch (error) {lastError = error;}
    await delay(150);
  }
  throw new Error(`Timed out: ${description}${lastError ? ` (${lastError.message})` : ''}`);
}
async function startApp(name, port) {
  const origin = `http://127.0.0.1:${port}`;
  let occupied = false;
  try {await fetch(origin, {signal: AbortSignal.timeout(500)}); occupied = true;} catch {}
  assert(!occupied, `Port ${port} already has a server; stop it before this smoke test.`);
  const owned = launch('pnpm', ['--filter', name, 'start']);
  await waitFor(async () => {
    if (owned.child.exitCode !== null) throw new Error(owned.logs);
    return (await fetch(origin, {signal: AbortSignal.timeout(1500)})).ok;
  }, `${name} server readiness`);
  return origin;
}
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const packet = JSON.parse(event.data);
      if (packet.id) {
        const pending = this.pending.get(packet.id);
        if (!pending) return;
        this.pending.delete(packet.id);
        clearTimeout(pending.timer);
        if (packet.error) pending.reject(new Error(packet.error.message));
        else pending.resolve(packet.result);
      } else if (packet.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(packet.params.exceptionDetails.text + ': ' + (packet.params.exceptionDetails.exception?.description ?? ''));
      } else if (packet.method === 'Runtime.consoleAPICalled' && packet.params.type === 'error') {
        consoleErrors.push(packet.params.args.map(arg => arg.value ?? arg.description ?? '').join(' '));
      }
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, {once: true});
      socket.addEventListener('error', reject, {once: true});
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
      this.pending.set(id, {resolve: resolvePacket, reject, timer});
      this.socket.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  close() {
    for (const pending of this.pending.values()) {clearTimeout(pending.timer); pending.reject(new Error('Browser closed'));}
    this.pending.clear();
    this.socket.close();
  }
}
async function navigate(page, url, readySelector) {
  await page.send('Page.navigate', {url});
  await waitFor(() => page.evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(readySelector)})`), `page ${url}`);
  // Allow the initial React effects to finish before invoking event handlers.
  await delay(400);
}
async function newPage() {
  const target = await fetch('http://127.0.0.1:9222/json/new?about:blank', {method: 'PUT'}).then(response => response.json());
  const page = await Cdp.connect(target.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  return page;
}

try {
  const growthOrigin = await startApp('growth-engine', 3001);
  const leagueOrigin = await startApp('school-league', 3005);
  launch(process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-breakpad',
    '--disable-crash-reporter', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9222',
    `--user-data-dir=${join(temp, 'profile')}`, `--disk-cache-dir=${join(temp, 'cache')}`, 'about:blank',
  ], {env: {...process.env, XDG_CONFIG_HOME: join(temp, 'config'), XDG_CACHE_HOME: join(temp, 'cache')}});
  const version = await waitFor(() => fetch('http://127.0.0.1:9222/json/version').then(response => response.json()), 'Chromium CDP');
  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  await browser.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: downloads});

  const growth = await newPage();
  await navigate(growth, growthOrigin + '/campaigns/new', 'input[name="name"]');
  const session = await growth.evaluate(`fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'growth-manager'})}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(session.status, 200, JSON.stringify(session));
  await navigate(growth, growthOrigin + '/campaigns/new', 'input[name="name"]');
  assert.equal(await growth.evaluate("document.querySelector('.role select').value"), 'growth-manager');
  const input = {name: 'browser-orbit-smoke', country: 'UZ', audience: 'parent', channel: 'instagram', language: 'ru', tone: 'friendly', budgetUsd: '100', minAge: '18'};
  await growth.evaluate(`(() => {const values=${JSON.stringify(input)};for(const [key,value] of Object.entries(values)){const el=document.querySelector('[name="'+key+'"]');if(!el)throw new Error('Missing form field '+key);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}const form=document.querySelector('form');if(!form.checkValidity())throw new Error('Campaign form is invalid');form.requestSubmit();return true;})()`);
  await waitFor(() => growth.evaluate("/^\\/campaigns\\/[^/]+$/.test(location.pathname) && location.pathname !== '/campaigns/new' && document.querySelectorAll('.story-index').length >= 3"), 'campaign creation redirect and variants');
  const campaign = await growth.evaluate("({path:location.pathname,title:document.querySelector('h1').textContent,variants:[...document.querySelectorAll('.story')].filter(card=>['A','B','C'].includes(card.querySelector('.story-index')?.textContent)).map(card=>card.querySelector('p').textContent)})");
  assert.equal(campaign.title, input.name);
  assert.equal(campaign.variants.length, 3);
  assert(campaign.variants.every(text => text.includes('Родители') && text.includes('instagram')));
  console.log('Growth browser: campaign form submitted, redirected, and rendered three parent/Instagram variants.');

  const league = await newPage();
  await league.send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  await navigate(league, leagueOrigin + '/card', '.founder-card');
  assert.equal(await league.evaluate('document.documentElement.lang'), 'ru');
  await league.evaluate("document.querySelector('button[aria-label=\"Switch language\"]').click()");
  await waitFor(() => league.evaluate("document.documentElement.lang === 'en' && document.body.textContent.includes('Download PNG')"), 'English language toggle');
  const initialTheme = await league.evaluate('document.documentElement.dataset.theme');
  await league.evaluate("document.querySelector('button[aria-label=\"Toggle theme\"]').click()");
  await waitFor(() => league.evaluate(`document.documentElement.dataset.theme !== ${JSON.stringify(initialTheme)}`), 'theme toggle');
  const dimensions = await league.evaluate('({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})');
  assert(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, `Horizontal overflow at 390px: ${JSON.stringify(dimensions)}`);
  await league.evaluate("(() => {const button=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Download PNG'));if(!button)throw new Error('PNG action missing');button.click();return true;})()");
  const pngName = await waitFor(async () => (await readdir(downloads)).find(name => name.endsWith('.png')), 'Founder Card PNG download');
  const png = await readFile(join(downloads, pngName));
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(png.readUInt32BE(16), 1200, 'PNG width');
  assert.equal(png.readUInt32BE(20), 760, 'PNG height');
  console.log(`League browser: English/theme toggles, 390px viewport without overflow, PNG ${png.readUInt32BE(16)}×${png.readUInt32BE(20)} (${png.length} bytes).`);
  assert.deepEqual(consoleErrors, [], 'Browser JavaScript errors');
  console.log('Browser smoke passed with no JavaScript console errors.');
} catch (error) {
  console.error(error);
  for (const {child, logs} of processes) {
    if (child.exitCode !== null && child.exitCode !== 0) console.error(logs);
  }
  process.exitCode = 1;
} finally {
  for (const client of clients) client.close();
  for (const {child} of processes.reverse()) {
    try {process.kill(-child.pid, 'SIGTERM');} catch {}
  }
  await delay(300);
  await rm(temp, {recursive: true, force: true, maxRetries: 3, retryDelay: 150});
}
