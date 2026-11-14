"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { App, Data, FormV2, Workspace } from "./types";
import { APPS } from "./types";
import { enumCopy, labelCopy } from "./copy";
import "./workspace.css";
const t = (value: string, language: string) =>
  value.split("|")[language === "ru" ? 0 : 1] ?? value.split("|")[0];
async function api(path: string, data?: Data, key?: string) {
  const response = await fetch(
    "/api/v2/" + path,
    data
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          body: JSON.stringify(data),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Request failed");
  return result;
}
export function HubWorkspace({ app }: { app: App }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [language, setLanguage] = useState("ru"),
    [theme, setTheme] = useState("light"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const loadSequence = useRef(0),
    headingRef = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const load = async () => {
    const sequence = ++loadSequence.current;
    try {
      const search = new URLSearchParams(location.search);
      const result = await api("state?" + search.toString());
      if (sequence !== loadSequence.current) return;
      setWorkspace(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };
  useEffect(() => {
    const saved = localStorage.getItem("startify-v2-language") ?? "ru",
      savedTheme = localStorage.getItem("startify-v2-theme") ?? "light";
    setLanguage(saved);
    setTheme(savedTheme);
    void load();
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.hubTheme = theme;
    localStorage.setItem("startify-v2-language", language);
    localStorage.setItem("startify-v2-theme", theme);
  }, [language, theme]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const action = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const go = (section: string) => {
    setQuery("");
    history.pushState(null, "", "/v2?section=" + encodeURIComponent(section));
    void load().then(() =>
      requestAnimationFrame(() => headingRef.current?.focus()),
    );
  };
  useEffect(() => {
    const handler = () => {
      void load();
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return (
    <div className="hub-workspace">
      <a className="hub-skip" href="#hub-content">
        {t("К содержимому|Skip to content", language)}
      </a>
      <header className="hub-header">
        <a className="hub-brand" href="/v2">
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28">
            <path
              d="M3 22 14 3l11 19H3Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path d="m8 18 6-9 6 9H8Z" fill="currentColor" />
          </svg>
          <span>
            AI STARTIFY <small>GROWTH HUB</small>
          </span>
        </a>
        <div className="hub-tools">
          <span className="hub-tag">
            {t("Локальное демо|Local demo", language)}
          </span>
          <button
            aria-label="Switch language"
            onClick={() => setLanguage(language === "ru" ? "en" : "ru")}
          >
            {language === "ru" ? "EN" : "RU"}
          </button>
          <button
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {t(
              theme === "light"
                ? "Тёмная тема|Dark theme"
                : "Светлая тема|Light theme",
              language,
            )}
          </button>
          <a href="/">{t("Исходное приложение|Original app", language)}</a>
        </div>
      </header>
      <div className="hub-mode">
        {t(
          "Все локальные профили и результаты — demo. Реальная AI Startify, платежи и автопубликация не подключены.|All local profiles and results are demo. Real AI Startify, payments and automatic publishing are not connected.",
          language,
        )}
      </div>
      <div className="hub-shell">
        <aside className="hub-sidebar">
          <p className="hub-eyebrow">
            {t("Рабочее пространство|Workspace", language)}
          </p>
          <h2>{t(workspace?.title ?? "Загрузка|Loading", language)}</h2>
          <label className="hub-profile">
            {t("Демопрофиль|Demo profile", language)}
            <select
              value={workspace?.actor?.id ?? ""}
              disabled={busy}
              onChange={(e) =>
                void action(
                  () => api("session", { subjectId: e.target.value }),
                  "Профиль выбран|Profile selected",
                )
              }
            >
              <option value="" disabled>
                {t("Выберите профиль|Choose a profile", language)}
              </option>
              {workspace?.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {workspace?.actor && (
            <>
              <p className="hub-context">
                {workspace.actor.roles.map((r) => r.role).join(" · ") ||
                  t(
                    "Назначение ожидает проверки|Appointment awaiting review",
                    language,
                  )}
              </p>
              <button
                className="hub-link-button"
                onClick={() =>
                  void action(
                    () => api("logout", {}),
                    "Сессия завершена|Signed out",
                  )
                }
              >
                {t("Завершить сессию|Sign out", language)}
              </button>
            </>
          )}
          <nav
            aria-label={t("Основная навигация|Primary navigation", language)}
          >
            {workspace?.nav.slice(0, 4).map((n) => (
              <button
                key={n.key}
                aria-current={workspace.section === n.key ? "page" : undefined}
                onClick={() => go(n.key)}
              >
                {t(n.label, language)}
              </button>
            ))}
          </nav>
          {!!workspace && workspace.nav.length > 4 && (
            <details
              className="hub-more"
              open={workspace.nav
                .slice(4)
                .some((n) => n.key === workspace.section)}
            >
              <summary>{t("Другие инструменты|More tools", language)}</summary>
              <nav aria-label={t("Другие инструменты|More tools", language)}>
                {workspace.nav.slice(4).map((n) => (
                  <button
                    key={n.key}
                    aria-current={
                      workspace.section === n.key ? "page" : undefined
                    }
                    onClick={() => go(n.key)}
                  >
                    {t(n.label, language)}
                  </button>
                ))}
              </nav>
            </details>
          )}
          <details className="hub-products">
            <summary>{t("Все модули|All modules", language)}</summary>
            {Object.entries(APPS).map(([name, port]) => (
              <a
                key={name}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  const url = new URL(location.href);
                  url.port = String(port);
                  url.pathname = "/v2";
                  url.search = "";
                  location.href = url.toString();
                }}
              >
                {name === app ? "● " : ""}
                {name}
              </a>
            ))}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const url = new URL(location.href);
                url.port = "3000";
                url.pathname = "/";
                url.search = "";
                location.href = url.toString();
              }}
            >
              {t("Демоцентр|Demo hub", language)}
            </a>
          </details>
        </aside>
        <main id="hub-content" className="hub-main">
          <div className="hub-heading">
            <div>
              <p className="hub-eyebrow">
                {t(
                  "От действия к проверяемому результату|From action to verifiable progress",
                  language,
                )}
              </p>
              <h1 ref={headingRef} tabIndex={-1}>
                {t(
                  workspace?.nav.find((n) => n.key === workspace.section)
                    ?.label ?? "Начало|Start",
                  language,
                )}
              </h1>
              <p>
                {t(
                  workspace?.summary ??
                    "Загрузка сохранённых данных…|Loading saved data…",
                  language,
                )}
              </p>
            </div>
            {workspace?.actor && (
              <button
                className="hub-secondary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const r = await api("sync", {});
                    if (r.pending)
                      setNotice(
                        `${r.pending} ${t("событий ожидают источники|events awaiting sources", language)}`,
                      );
                  }, "Синхронизация выполнена; недоступные источники остаются в очереди|Sync attempted; unavailable sources remain queued")
                }
              >
                {t("Синхронизировать модули|Sync modules", language)}
              </button>
            )}
          </div>
          {error && (
            <p className="hub-alert" role="alert" tabIndex={-1} ref={errorRef}>
              {error}
              <button onClick={() => void load()}>
                {t("Повторить загрузку|Retry loading", language)}
              </button>
            </p>
          )}
          {notice && (
            <p className="hub-notice" role="status">
              {t(notice, language)}
            </p>
          )}
          {!workspace && !error && (
            <p role="status">{t("Загружаем…|Loading…", language)}</p>
          )}
          <div className="hub-cards">
            {workspace?.cards.map((card, i) => (
              <article className="hub-card" key={i}>
                <span className="hub-step">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2>{t(card.title, language)}</h2>
                <p>{t(card.text, language)}</p>
                {card.href && (
                  <a
                    className="hub-text-action"
                    href={card.href}
                    target={
                      card.href.startsWith("/api/v2/") ? "_blank" : undefined
                    }
                    rel={
                      card.href.startsWith("/api/v2/") ? "noopener" : undefined
                    }
                  >
                    {t(
                      card.href.startsWith("/api/v2/")
                        ? "Открыть в новой вкладке|Open in a new tab"
                        : "Открыть|Open",
                      language,
                    )}{" "}
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M3 13 13 3M3 3h10v10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </a>
                )}
              </article>
            ))}
          </div>
          <div className="hub-forms">
            {workspace?.forms.map((form, i) => (
              <details
                className="hub-action"
                open={i === 0}
                key={`${workspace.actor?.id ?? "guest"}:${workspace.section}:${form.op}:${JSON.stringify(form.hidden ?? {})}:${i}`}
              >
                <summary>{t(form.title, language)}</summary>
                <WorkForm
                  key={`${workspace.actor?.id ?? "guest"}:${workspace.section}:${form.op}:${i}`}
                  form={form}
                  app={app}
                  subject={workspace.actor?.id ?? "guest"}
                  language={language}
                  onSuccess={async (result) => {
                    if (result.result?.download)
                      setNotice(
                        "Пакет создан. Ссылка на скачивание ниже.|Package created. Download link below.",
                      );
                    else setNotice("Сохранено|Saved");
                    await load();
                  }}
                />
              </details>
            ))}
          </div>
          {!!workspace?.records.length && (
            <label className="hub-search">
              {t(
                "Найти в результатах: страна, стадия, тема или сезон|Find in results: country, stage, topic or season",
                language,
              )}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Поиск…|Search…", language)}
              />
            </label>
          )}
          {workspace?.records.map((group, i) => (
            <section className="hub-record-section" key={i}>
              <h2>
                {t(group.title, language)}{" "}
                <span className="hub-count">{group.items.length}</span>
              </h2>
              {!group.items.length ? (
                <p className="hub-empty">
                  {t(
                    "Пока нет записей. Сохраните первое действие или синхронизируйте модуль-источник.|No records yet. Save your first action or sync the source module.",
                    language,
                  )}
                </p>
              ) : (
                <div className="hub-records">
                  {group.items
                    .filter(
                      (item) =>
                        !query ||
                        JSON.stringify(item)
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase()),
                    )
                    .map((item, j) => (
                      <RecordCard
                        key={item.id ?? j}
                        item={item}
                        language={language}
                        timezone={workspace.actor?.timezone ?? "Asia/Qyzylorda"}
                      />
                    ))}
                </div>
              )}
            </section>
          ))}
          <details className="hub-integrations">
            <summary>
              {t(
                "Режимы интеграций и актуальность|Integration modes & freshness",
                language,
              )}
            </summary>
            <dl>
              {workspace &&
                Object.entries(workspace.providers).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </dd>
                  </div>
                ))}
            </dl>
            <p>{workspace?.updatedAt}</p>
          </details>
        </main>
      </div>
    </div>
  );
}
function WorkForm({
  form,
  app,
  subject,
  language,
  onSuccess,
}: {
  form: FormV2;
  app: App;
  subject: string;
  language: string;
  onSuccess: (result: Data) => Promise<void>;
}) {
  const id = useId(),
    ref = useRef<HTMLFormElement>(null),
    errorRef = useRef<HTMLParagraphElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [download, setDownload] = useState("");
  const request = useRef({ key: "", payload: "" }),
    storageKey = `startify-v2-draft:${app}:${subject}:${form.op}:${JSON.stringify(form.hidden ?? {})}`;
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (draft && ref.current)
        for (const field of form.fields) {
          const el = ref.current.elements.namedItem(
            field.name,
          ) as HTMLInputElement | null;
          if (el && draft[field.name] !== undefined)
            el.value = draft[field.name];
        }
    } catch {
      /* Invalid local drafts are ignored; server data remains authoritative. */
    }
  }, [storageKey, form.fields]);
  function autosave() {
    if (!ref.current) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify(Object.fromEntries(new FormData(ref.current))),
    );
    setSaved(true);
  }
  return (
    <section className="hub-form-panel">
      <h2>{t(form.title, language)}</h2>
      <form
        ref={ref}
        onChange={autosave}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const data: Data = { ...form.hidden };
          const values = new FormData(event.currentTarget);
          for (const field of form.fields) {
            const path = field.name.split(".");
            let target = data;
            for (const part of path.slice(0, -1)) {
              target[part] ??= {};
              target = target[part];
            }
            target[path.at(-1)!] = values.get(field.name) ?? "";
          }
          const payload = JSON.stringify(data);
          if (request.current.payload !== payload)
            request.current = { payload, key: crypto.randomUUID() };
          setBusy(true);
          setError("");
          try {
            const result = await api(
              form.op === "identity.register"
                ? "identity"
                : "actions/" + form.op,
              data,
              request.current.key,
            );
            localStorage.removeItem(storageKey);
            setSaved(false);
            request.current = { key: "", payload: "" };
            if (result.result?.download) setDownload(result.result.download);
            await onSuccess(result);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Request failed");
            requestAnimationFrame(() => errorRef.current?.focus());
          } finally {
            setBusy(false);
          }
        }}
      >
        {form.fields.map((field) => (
          <label key={field.name} htmlFor={id + field.name}>
            {t(field.label, language)}
            {!field.required && (
              <small> {t("необязательно|optional", language)}</small>
            )}
            {field.type === "select" ? (
              <select
                id={id + field.name}
                name={field.name}
                required={field.required}
                defaultValue={field.value ?? ""}
              >
                <option value="">{t("Выберите|Select", language)}</option>
                {field.options?.filter(Boolean).map((value) => (
                  <option key={value} value={value}>
                    {t(
                      field.optionLabels?.[value] ?? enumCopy[value] ?? value,
                      language,
                    )}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                id={id + field.name}
                name={field.name}
                required={field.required}
                defaultValue={field.value}
                rows={String(field.value ?? "").includes("\n") ? 8 : 3}
                maxLength={16000}
              />
            ) : (
              <input
                id={id + field.name}
                name={field.name}
                type={field.type ?? "text"}
                required={field.required}
                defaultValue={field.value}
                maxLength={4000}
                step={field.type === "number" ? "any" : undefined}
              />
            )}{" "}
            {field.hint && <small>{t(field.hint, language)}</small>}
          </label>
        ))}
        {error && (
          <p
            className="hub-field-error"
            role="alert"
            tabIndex={-1}
            ref={errorRef}
          >
            {error}
          </p>
        )}
        <div className="hub-form-footer">
          <button className="hub-primary" disabled={busy}>
            {t(
              busy ? "Сохраняем…|Saving…" : (form.button ?? "Сохранить|Save"),
              language,
            )}
          </button>
          <span className="hub-draft" aria-live="polite">
            {saved
              ? t(
                  "Черновик сохранён на устройстве|Draft saved on this device",
                  language,
                )
              : ""}
          </span>
        </div>
        {download && (
          <a className="hub-text-action" href={download}>
            {t("Скачать созданный пакет|Download created package", language)}
          </a>
        )}
      </form>
    </section>
  );
}
function RecordCard({
  item,
  language,
  timezone,
}: {
  item: Data;
  language: string;
  timezone: string;
}) {
  const important = [
    "status",
    "verificationStatus",
    "dataMode",
    "stage",
    "score",
    "rank",
    "projectCount",
    "participantCount",
    "sampleSize",
    "source",
    "periodStart",
    "periodEnd",
    "startAt",
    "endAt",
    "priceMinor",
    "code",
    "scale",
    "available",
    "policyVersion",
    "generationStatus",
  ];
  return (
    <article className="hub-record">
      <div className="hub-record-title">
        <h3>
          {String(
            item.title ??
              item.nickname ??
              item.country ??
              item.type ??
              item.metricKey ??
              item.id ??
              t("Результат|Result", language),
          )}
        </h3>
        {item.dataMode && <span className="hub-tag">{item.dataMode}</span>}
      </div>
      {item.id && (
        <p className="hub-id">
          ID: <code>{item.id}</code>
        </p>
      )}
      <dl>
        {important
          .filter((k) => item[k] !== undefined)
          .map((k) => (
            <div key={k}>
              <dt>{t(labelCopy[k] ?? k, language)}</dt>
              <dd>
                {item[k] === null
                  ? t("Недостаточно данных|Insufficient data", language)
                  : ["periodStart", "periodEnd", "startAt", "endAt"].includes(
                        k,
                      ) && Number.isFinite(Date.parse(item[k]))
                    ? `${new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(item[k]))} (${timezone})`
                    : t(enumCopy[String(item[k])] ?? String(item[k]), language)}
              </dd>
            </div>
          ))}
      </dl>
      {item.artifactId && (
        <a href={`/api/v2/artifacts/${item.artifactId}`}>
          {t("Скачать файл|Download artifact", language)}
        </a>
      )}
      {item.kind === "project" && (
        <a href={`/v2?section=project&selected=${item.id}`}>
          {t("Выбрать проект|Select project", language)}
        </a>
      )}
      <details>
        <summary>
          {t(
            "Материалы, источники и история|Artifacts, sources & history",
            language,
          )}
        </summary>
        <pre>{JSON.stringify(item, null, 2)}</pre>
      </details>
    </article>
  );
}
