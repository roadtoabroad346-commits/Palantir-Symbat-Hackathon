"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AppIllustration } from "./illustration";
import type { View, Form, Row } from "./server";
import { countries, countryName, t, type Language, dictionary } from "./index";
export function LanguageSwitcher({
  lang,
  onChange,
}: {
  lang: Language;
  onChange: (l: Language) => void;
}) {
  return (
    <button
      className="quiet"
      onClick={() => onChange(lang === "ru" ? "en" : "ru")}
      aria-label="Switch language"
    >
      {lang === "ru" ? "EN" : "RU"} ↗
    </button>
  );
}
const labels: Record<string, string> = {
  viewer: "Наблюдатель|Viewer",
  "growth-manager": "Менеджер роста|Growth manager",
  visitor: "Гость|Visitor",
  ambassador: "Амбассадор|Ambassador",
  admin: "Администратор|Admin",
  student: "Ученик|Student",
  teacher: "Учитель|Teacher",
  judge: "Судья|Judge",
  "partner-manager": "Менеджер партнёрств|Partner manager",
  visit: "Визиты|Visits",
  registered: "Регистрации|Registered",
  started: "Начаты|Started",
  published: "Опубликованы|Published",
  parent: "Родители|Parents",
  student_audience: "Ученики (для проверки)|Students (safety check)",
  true: "Да|Yes",
  false: "Нет|No",
};
export function Dashboard({ initial }: { initial: View }) {
  const [v, setV] = useState(initial),
    [lang, setLang] = useState<Language>("ru"),
    [dark, setDark] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [tableTab, setTableTab] = useState("");
  const tr = (s: string) => {
    const val = labels[s] ?? s;
    const parts = val.split("|");
    return parts[lang === "ru" ? 0 : 1] ?? parts[0];
  };
  useEffect(() => {
    const l = localStorage.getItem("startify-lang") === "en" ? "en" : "ru";
    setLang(l);
    document.documentElement.lang = l;
    setDark(localStorage.getItem("startify-theme") === "dark");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("startify-theme", dark ? "dark" : "light");
  }, [dark]);
  const changeLang = (l: Language) => {
    setLang(l);
    document.documentElement.lang = l;
    localStorage.setItem("startify-lang", l);
  };
  async function act(op: string, data: Row = {}) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(op === "session" ? "/api/session" : "/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, ...data }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      if (result.redirect) {
        location.href = result.redirect;
        return;
      }
      const next = await fetch(
        "/api/state?page=" +
          encodeURIComponent(v.path) +
          "&selection=" +
          encodeURIComponent(v.extra?.selection ?? ""),
      );
      setV(await next.json());
      setNotice(result.message ?? t(lang, "Готово", "Done"));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }
  async function copy(s: string) {
    try {
      await navigator.clipboard.writeText(s);
      setNotice(t(lang, "Скопировано", "Copied"));
    } catch {
      setNotice(
        t(
          lang,
          "Выделите и скопируйте текст вручную",
          "Select and copy the text manually",
        ),
      );
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>, form: Form) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    await act(form.op, { ...form.hidden, ...data });
  }
  const palette = v.app.split("-")[0];
  const tabbed =
    (v.app === "school-league" && v.path === "/") ||
    (v.app === "challenge-platform" && v.path.startsWith("/challenges/"));
  const visibleTables = tabbed
    ? v.tables.filter(
        (table) => table.title === (tableTab || v.tables[0]?.title),
      )
    : v.tables;
  return (
    <div className={`workspace ${palette} ${v.app}`}>
      <a className="skip" href="#main">
        {t(lang, "К содержимому", "Skip to content")}
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            s<span>↗</span>
          </span>
          <span>
            startify<span className="brand-small">GLOBAL GROWTH LAB</span>
          </span>
        </a>
        <div className="edition">
          0
          {[
            "growth-engine",
            "ambassador-platform",
            "challenge-platform",
            "school-portal",
            "school-league",
          ].indexOf(v.app) + 1}{" "}
          / {tr("Пять способов расти|Five ways to grow")}
        </div>
        <nav aria-label={t(lang, "Основная навигация", "Main navigation")}>
          {v.nav.map((n, i) => (
            <a
              key={n.href}
              className={v.path === n.href ? "active" : ""}
              href={
                n.href +
                (v.extra?.selection
                  ? "?selection=" + encodeURIComponent(v.extra.selection)
                  : "")
              }
            >
              <span className="nav-icon">
                {["◉", "↗", "▤", "◇", "✦", "⚑"][i]}
              </span>
              {tr(n.label)}
              <span className="nav-arrow">↗</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />{" "}
          {t(lang, "Идея. Действие. Влияние.", "Idea. Action. Impact.")}
          <p>
            {t(
              lang,
              "Каждый проект начинается с первого шага.",
              "Every project starts with a first step.",
            )}
          </p>
        </div>
      </aside>
      <div className="body">
        <header className="topbar">
          <span className="demo-badge">● {dictionary[lang].demo}</span>
          <span className="top-note">
            {t(
              lang,
              "AI Startify не подключён",
              "AI Startify is not connected",
            )}
          </span>
          <div className="tools">
            <LanguageSwitcher lang={lang} onChange={changeLang} />
            <button
              className="quiet"
              aria-label={t(lang, "Сменить тему", "Toggle theme")}
              onClick={() => setDark(!dark)}
            >
              {dark ? "☀" : "◐"}
            </button>
            <label className="role">
              <span className="sr-only">{dictionary[lang].signIn}</span>
              <select
                value={v.role}
                onChange={(e) => act("session", { role: e.target.value })}
                disabled={busy}
              >
                {v.roles.map((r) => (
                  <option key={r} value={r}>
                    {tr(r)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                AI STARTIFY / {t(lang, "ЛАБОРАТОРИЯ РОСТА", "GROWTH LAB")}
              </div>
              <h1>{tr(v.title)}</h1>
              <p className="subtitle">{tr(v.subtitle)}</p>
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                act("simulate", {
                  n: 20,
                  ambassadorId: v.extra?.selection ?? "amb-0",
                })
              }
            >
              <span>✦</span> {busy ? "…" : dictionary[lang].simulate}
            </button>
          </div>
          <div className="hero-line">
            <span>
              {t(lang, "Маленькие идеи.", "Small ideas.")}
              <br />
              <strong>
                {t(lang, "Большие возможности.", "Big possibilities.")}
              </strong>
            </span>
            <AppIllustration app={v.app} />
            <p>
              {t(
                lang,
                "Создавайте, проверяйте, делитесь. Все данные в этой лаборатории вымышлены.",
                "Create, explore, share. All data in this lab is fictional.",
              )}
            </p>
          </div>
          {notice && (
            <div className="notice" role="status">
              {tr(notice)}
              <button aria-label="Close" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          {v.metrics.length > 0 && (
            <section
              className="metrics"
              aria-label={t(lang, "Показатели", "Metrics")}
            >
              {v.metrics.map((m, i) => (
                <div className="metric" key={m.label}>
                  <div className="metric-label">
                    {tr(m.label)} <span>↗</span>
                  </div>
                  <strong>
                    {typeof m.value === "number"
                      ? m.value.toLocaleString(lang)
                      : tr(String(m.value))}
                  </strong>
                  <small>
                    {m.note
                      ? tr(m.note)
                      : t(
                          lang,
                          `Показатель ${String(i + 1).padStart(2, "0")} · демо`,
                          `Metric ${String(i + 1).padStart(2, "0")} · demo`,
                        )}
                  </small>
                </div>
              ))}
            </section>
          )}
          {v.chart && (
            <section className="panel funnel">
              <div className="section-title">
                <h2>
                  {t(
                    lang,
                    "Путь от интереса к проекту",
                    "From curiosity to a project",
                  )}
                </h2>
                <span className="pill">
                  {t(lang, "В реальном времени · демо", "Live · demo")}
                </span>
              </div>
              <div className="bars">
                {v.chart.map((b, i) => (
                  <div key={b.label}>
                    <div
                      className="bar"
                      style={{
                        height: `${24 + (100 * b.value) / Math.max(1, ...v.chart!.map((b) => b.value))}px`,
                        opacity: 1 - i * 0.15,
                      }}
                    />
                    <strong>{b.value}</strong>
                    <span>{tr(b.label)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {v.app === "school-league" && v.path === "/card" && (
            <FounderCard
              lang={lang}
              extra={v.extra ?? {}}
              tr={tr}
              copy={copy}
            />
          )}
          {v.cards.length > 0 && (
            <section className="stories">
              {v.cards.map((c, i) => (
                <article className="story" key={i}>
                  <div className="story-top">
                    <span className="story-index">
                      {c.tag ?? String(i + 1).padStart(2, "0")}
                    </span>
                    <span>↗</span>
                  </div>
                  <h2>{tr(c.title)}</h2>
                  <p>{tr(c.text)}</p>
                  {c.href && (
                    <div className="card-actions">
                      <a className="text-link" href={c.href}>
                        {t(lang, "Открыть", "Open")} ↗
                      </a>
                      <button
                        className="quiet"
                        onClick={() =>
                          copy(new URL(c.href!, location.origin).toString())
                        }
                      >
                        {t(lang, "Копировать ссылку", "Copy link")}
                      </button>
                    </div>
                  )}
                  {!c.href && /код|code/i.test(c.title) && (
                    <button
                      className="quiet"
                      onClick={() => copy(c.text.split("|")[0].split("\n")[0])}
                    >
                      {t(lang, "Копировать код", "Copy code")}
                    </button>
                  )}
                </article>
              ))}
            </section>
          )}
          {v.forms.map((form, i) => (
            <section className="panel" key={i}>
              <h2>{tr(form.title)}</h2>
              <form onSubmit={(e) => submit(e, form)}>
                <div className="form-grid">
                  {form.fields.map((f) => (
                    <label
                      className={f.type === "textarea" ? "wide" : ""}
                      key={f.name}
                    >
                      {tr(f.label)}
                      {f.type === "select" ? (
                        <select
                          name={f.name}
                          defaultValue={f.value}
                          required={f.required}
                        >
                          {f.options?.map((o) => (
                            <option value={o} key={o}>
                              {countries.some((c) => c.code === o)
                                ? countryName(o, lang)
                                : tr(o === "student" ? "student_audience" : o)}
                            </option>
                          ))}
                        </select>
                      ) : f.type === "checkbox" ? (
                        <span className="checkline">
                          <input
                            type="checkbox"
                            name={f.name}
                            value="true"
                            required={f.required}
                          />
                          {t(lang, "Подтверждаю", "I confirm")}
                        </span>
                      ) : f.type === "textarea" ? (
                        <textarea
                          name={f.name}
                          rows={4}
                          required={f.required}
                          defaultValue={f.value}
                          maxLength={3000}
                        />
                      ) : (
                        <input
                          step={f.type === "number" ? "any" : undefined}
                          type={f.type ?? "text"}
                          name={f.name}
                          required={f.required}
                          defaultValue={f.value}
                          min={f.min ?? (f.type === "number" ? 0 : undefined)}
                          max={f.max}
                          maxLength={f.type === "number" ? undefined : 200}
                        />
                      )}
                      {f.hint && <small>{tr(f.hint)}</small>}
                    </label>
                  ))}
                </div>
                <div className="form-footer">
                  <span>
                    {t(
                      lang,
                      "Публичный текст: только вымышленные никнеймы.",
                      "Public text: invented nicknames only.",
                    )}
                  </span>
                  <button className="primary" disabled={busy} type="submit">
                    {tr(form.button ?? "Сохранить|Save")} ↗
                  </button>
                </div>
              </form>
            </section>
          ))}
          {tabbed && (
            <div
              className="ranking-tabs"
              role="tablist"
              aria-label={t(
                lang,
                "Группировка рейтинга",
                "Leaderboard grouping",
              )}
            >
              {v.tables.map((table) => (
                <button
                  role="tab"
                  aria-selected={
                    table.title === (tableTab || v.tables[0]?.title)
                  }
                  key={table.title}
                  onClick={() => setTableTab(table.title)}
                >
                  {tr(table.title)}
                </button>
              ))}
            </div>
          )}
          {visibleTables.map((table, i) => (
            <section className="panel table-panel" key={i}>
              <div className="section-title">
                <h2>{tr(table.title)}</h2>
                <div className="table-tools">
                  <input
                    aria-label={t(lang, "Фильтр записей", "Filter records")}
                    placeholder={t(lang, "Найти…", "Filter…")}
                    value={filters[table.title] ?? ""}
                    onChange={(e) =>
                      setFilters({ ...filters, [table.title]: e.target.value })
                    }
                  />
                  <a className="quiet text-link" href="/api/export">
                    CSV ↓
                  </a>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {table.columns.map((c) => (
                        <th key={c}>{tr(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows
                      .filter((r) =>
                        r
                          .join(" ")
                          .toLowerCase()
                          .includes((filters[table.title] ?? "").toLowerCase()),
                      )
                      .map((row, j) => (
                        <tr key={j}>
                          {row.map((cell, k) => (
                            <td key={k}>
                              {typeof cell === "string" &&
                              cell.startsWith("/") ? (
                                <a className="text-link" href={cell}>
                                  {t(lang, "Открыть", "Open")} ↗
                                </a>
                              ) : typeof cell === "string" ? (
                                tr(cell)
                              ) : (
                                cell
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!table.rows.length && (
                  <p className="empty">{dictionary[lang].empty}</p>
                )}
              </div>
            </section>
          ))}
          <footer>
            <span>AI Startify · Global growth lab</span>
            <span>
              {t(
                lang,
                "Никаких реальных рассылок. Никаких данных детей.",
                "No real outreach. No student personal data.",
              )}
            </span>
            <button className="quiet" onClick={() => window.print()}>
              {t(lang, "Печать", "Print")} ↗
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
function FounderCard({
  lang,
  extra,
  tr,
  copy,
}: {
  lang: Language;
  extra: Row;
  tr: (s: string) => string;
  copy: (s: string) => void;
}) {
  const p = extra.project ?? {
    nickname: "Nova42",
    title: "Eco orbit",
    idea: "Small ideas for a greener school",
    school: "School 1",
    country: "KZ",
    passportId: "DEMO-PASSPORT",
    code: "START-001",
  };
  async function download() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 760;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#e9fe75";
    c.fillRect(0, 0, 1200, 760);
    c.fillStyle = "#172019";
    c.font = "bold 28px system-ui";
    c.fillText("AI STARTIFY / DEMO FOUNDER CARD", 64, 80);
    c.font = "bold 70px system-ui";
    c.fillText(String(p.title).slice(0, 26), 64, 210);
    c.font = "32px system-ui";
    c.fillText(String(p.nickname), 64, 280);
    const words = String(p.idea).split(" ");
    let line = "",
      y = 360;
    for (const w of words) {
      if (c.measureText(line + w).width > 950) {
        c.fillText(line, 64, y);
        y += 45;
        line = "";
      }
      line += w + " ";
    }
    c.fillText(line, 64, y);
    c.font = "25px system-ui";
    c.fillText(`${p.school} · ${p.country}`, 64, 580);
    c.fillText(`${p.passportId} · ${p.code}`, 64, 630);
    c.fillText("DEMO · certificate verification not connected", 64, 690);
    const a = document.createElement("a");
    a.download = "founder-card-demo.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }
  return (
    <section className="panel">
      <div className="founder-card">
        <div>
          AI STARTIFY <span>DEMO ✦</span>
        </div>
        <h2>{p.title}</h2>
        <strong>@{p.nickname}</strong>
        <p>{p.idea}</p>
        <div>
          {p.school} · {p.country}
        </div>
        <small>
          {p.passportId} · {p.code}
        </small>
        <svg
          width="60"
          height="60"
          viewBox="0 0 8 8"
          aria-label="Decorative demo QR, not a real verification code"
        >
          <path
            d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 4h1v2H4zM6 5h2v1H6zM5 7h3v1H5z"
            fill="currentColor"
          />
        </svg>
        <small>
          {tr(
            "Демо QR — проверка сертификата не подключена|Demo QR — certificate verification not connected",
          )}
        </small>
      </div>
      <div className="card-actions">
        <button className="primary" onClick={download}>
          {t(lang, "Скачать PNG", "Download PNG")} ↓
        </button>
        <button
          className="quiet"
          onClick={() =>
            copy(
              `${p.nickname} · ${p.title} · ${p.school} · ${p.country} #AIStartify #Demo`,
            )
          }
        >
          {t(lang, "Копировать текст", "Copy share text")}
        </button>
      </div>
    </section>
  );
}
