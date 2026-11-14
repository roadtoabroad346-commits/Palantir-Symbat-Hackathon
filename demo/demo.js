import { appUrl } from "/demo-apps.mjs";
let lang = localStorage.getItem("startify-demo-lang") === "en" ? "en" : "ru";
let apps = [];
let current = null;
let opening = false;
const $ = (id) => document.getElementById(id);
const tr = (ru, en) => (lang === "ru" ? ru : en);
function setCopy() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-ru]"))
    el.textContent = el.dataset[lang];
  $("language").textContent = lang === "ru" ? "EN" : "RU";
  localStorage.setItem("startify-demo-lang", lang);
  renderCards();
  if (current) showDetails(current);
}
function url(app) {
  return appUrl(location.href, app.port, app.route);
}

function showDetails(app) {
  $("viewer-title").textContent = app.title[lang === "ru" ? 0 : 1];
  $("viewer-steps").textContent = app.steps[lang === "ru" ? 0 : 1];
  $("external").href = url(app);
  $("app-frame").title = app.title[lang === "ru" ? 0 : 1];
}
function renderCards() {
  const container = $("cards");
  container.replaceChildren();
  for (const app of apps) {
    const card = document.createElement("article");
    card.className = "card";
    card.style.setProperty("--accent", app.color);
    const top = document.createElement("div");
    top.className = "card-top";
    const icon = document.createElement("span");
    icon.className = "card-icon";
    icon.textContent = app.icon;
    const status = document.createElement("span");
    status.className = "status " + app.status;
    status.textContent =
      app.status === "ready"
        ? tr("Готово", "Ready")
        : app.status === "starting"
          ? tr("Запускается…", "Starting…")
          : app.status === "conflict"
            ? tr("Порт занят", "Port in use")
            : tr("Нужен перезапуск", "Restart needed");
    top.append(icon, status);
    const title = document.createElement("h3");
    title.textContent = app.title[lang === "ru" ? 0 : 1];
    const desc = document.createElement("p");
    desc.textContent = app.summary[lang === "ru" ? 0 : 1];
    const steps = document.createElement("div");
    steps.className = "steps";
    const label = document.createElement("strong");
    label.textContent = tr("За 60 секунд", "Try in 60 seconds");
    const text = document.createElement("span");
    text.textContent = app.steps[lang === "ru" ? 0 : 1];
    steps.append(label, text);
    const button = document.createElement("button");
    button.dataset.app = app.key;
    button.className = "open-app";
    button.textContent =
      app.status === "ready"
        ? tr("Открыть демо ↗", "Open demo ↗")
        : app.status === "starting"
          ? tr("Подготавливаем…", "Getting ready…")
          : tr("Повторить запуск", "Retry startup");
    button.disabled = opening || app.status === "starting";
    button.addEventListener("click", () =>
      app.status === "ready" ? open(app.key) : retry(app.key),
    );
    card.append(top, title, desc, steps, button);
    container.append(card);
  }
  const n = apps.filter((a) => a.status === "ready").length;
  $("ready-summary").textContent = tr(
    `Готово ${n} из ${apps.length} приложений`,
    `Ready: ${n} of ${apps.length} apps`,
  );
  const globe = apps.find((a) => a.key === "globe");
  $("open-globe").disabled = opening || globe?.status !== "ready";
}
async function load() {
  try {
    const r = await fetch("/api/status");
    if (!r.ok) throw new Error();
    apps = (await r.json()).apps;
    renderCards();
    const requested = location.hash.slice(1);
    if (
      requested &&
      !current &&
      !opening &&
      apps.some((a) => a.key === requested && a.status === "ready")
    )
      await open(requested);
  } catch {
    showError(
      tr(
        "Демоцентр недоступен. Обновите страницу или повторите pnpm demo.",
        "Demo hub is unavailable. Refresh the page or restart pnpm demo.",
      ),
    );
  }
}
function showError(message) {
  $("notice").textContent = message;
  $("notice").hidden = false;
}
async function retry(key) {
  try {
    const r = await fetch("/api/retry/" + key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) throw new Error((await r.json()).error);
    await load();
  } catch (e) {
    showError(e.message);
  }
}
async function open(key) {
  if (opening) return;
  const app = apps.find((a) => a.key === key);
  if (!app) return;
  opening = true;
  renderCards();
  try {
    const response = await fetch("/api/launch/" + key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    current = app;
    showDetails(app);
    $("home").hidden = true;
    $("viewer").hidden = false;
    document.body.classList.add("viewing");
    $("frame-loading").hidden = false;
    $("app-frame").src = url(app);
    history.replaceState(null, "", "#" + key);
    $("back").focus();
  } catch (e) {
    showError(e.message);
  } finally {
    opening = false;
    renderCards();
  }
}
$("app-frame").addEventListener("load", () => {
  $("frame-loading").hidden = true;
});
$("back").addEventListener("click", () => {
  current = null;
  $("viewer").hidden = true;
  $("home").hidden = false;
  document.body.classList.remove("viewing");
  $("app-frame").src = "about:blank";
  history.replaceState(null, "", location.pathname);
  $("open-globe").focus();
});
$("hide-hint").addEventListener("click", () => {
  document.querySelector(".viewer-hint").hidden = true;
});
$("language").addEventListener("click", () => {
  lang = lang === "ru" ? "en" : "ru";
  setCopy();
});
$("open-globe").addEventListener("click", () => open("globe"));
setCopy();
load();
setInterval(load, 5000);
