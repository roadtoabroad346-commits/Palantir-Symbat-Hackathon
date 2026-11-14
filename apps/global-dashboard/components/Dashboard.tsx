"use client";
import { DIRECTIONS } from "../config/directions";
import { useDashboardController } from "./useDashboard";
import { GlobePanel } from "./GlobePanel";
import { FeedbackPanel } from "./FeedbackPanel";
import { FeedbackModals } from "./FeedbackModals";
export default function Dashboard() {
  const model = useDashboardController();
  const {
    presenter,
    tx,
    setLang,
    lang,
    setDark,
    dark,
    admin,
    session,
    busy,
    setPresenter,
    setPlaying,
    simulate,
    error,
    notice,
    setError,
    setNotice,
    current,
    label,
    fmt,
    rows,
    sort,
    visible,
    mode,
    single,
    toggleDirection,
    name,
    data,
  } = model;
  if (!data)
    return (
      <main className="initial-state">
        <span className="brand-icon">s↗</span>
        <h1>Global impact</h1>
        <p role="status">
          {error ||
            tx(
              "Загружаем локальный мир идей…",
              "Loading a local world of ideas…",
            )}
        </p>
        {error && (
          <button onClick={() => location.reload()}>
            {tx("Повторить", "Retry")}
          </button>
        )}
      </main>
    );
  return (
    <div className={`impact-app ${presenter ? "presenter" : ""}`}>
      <a href="#globe-main" className="skip-link">
        {tx("К содержимому", "Skip to content")}
      </a>
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-icon">s↗</span>
          <span>
            startify<span className="brand-sub">GLOBAL OBSERVATORY</span>
          </span>
        </a>
        <nav aria-label={tx("Приложения", "Applications")}>
          <span className="nav-current">◎ Global impact</span>
          <span className="header-divider" />
          <span className="live-label">
            <i />
            {tx("Локальная демосреда", "Local demo environment")}
          </span>
        </nav>
        <div className="header-actions">
          <span className="demo-label">{tx("Демоданные", "Demo data")}</span>
          <button
            className="quiet-button"
            onClick={() => setLang(lang === "ru" ? "en" : "ru")}
            aria-label="Switch language"
          >
            {lang === "ru" ? "EN" : "RU"}
          </button>
          <button
            className="quiet-button"
            onClick={() => setDark(!dark)}
            aria-label={tx("Сменить тему", "Toggle theme")}
          >
            {dark ? "☀" : "◐"}
          </button>
          <button
            className={`admin-button ${admin ? "active" : ""}`}
            onClick={session}
            disabled={busy}
          >
            {admin ? "✓ Admin" : tx("Демо-админ", "Demo admin")}
          </button>
        </div>
      </header>
      <main id="globe-main">
        <div className="page-title">
          <div>
            <div className="eyebrow">
              AI STARTIFY / {tx("АТЛАС ВОЗМОЖНОСТЕЙ", "ATLAS OF POSSIBILITY")}
            </div>
            <h1>
              Global <span>impact.</span>
            </h1>
            <p>
              {tx(
                "Каждая точка — место, где идея может стать проектом.",
                "Every point is a place where an idea can become a project.",
              )}
            </p>
          </div>
          <div className="title-actions">
            <button
              className="secondary-button presenter-button"
              onClick={() => {
                setPresenter(!presenter);
                if (presenter) setPlaying(false);
              }}
              aria-pressed={presenter}
            >
              ⛶{" "}
              {tx(
                presenter ? "Выйти из презентации" : "Режим презентации",
                presenter ? "Exit presenter" : "Presenter mode",
              )}{" "}
              <kbd>P</kbd>
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={simulate}
            >
              ✦ {tx("Симулировать активность", "Simulate activity")}
            </button>
          </div>
        </div>
        {(error || notice) && (
          <div
            className={`notification ${error ? "error" : ""}`}
            role={error ? "alert" : "status"}
          >
            <span>{error || notice}</span>
            <button
              aria-label={tx("Закрыть", "Dismiss")}
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              ×
            </button>
          </div>
        )}
        <section
          className="kpi-row"
          aria-label={tx("Глобальные показатели", "Global metrics")}
        >
          {current &&
            [
              {
                label: tx("Участники", "Students"),
                value: current.users,
                goal: 100000,
              },
              {
                label: tx("Проекты опубликованы", "Projects published"),
                value: current.publishedProjects,
                goal: 10000,
              },
              { label: tx("Школы", "Schools"), value: current.schools },
              {
                label: tx("Амбассадоры", "Ambassadors"),
                value: current.ambassadors,
              },
              {
                label: tx("Кампании", "Active campaigns"),
                value: current.activeCampaigns,
              },
            ].map((k, i) => (
              <div className="kpi" key={k.label}>
                <div>
                  <span>{k.label}</span>
                  <span className="kpi-symbol">
                    {["↗", "✦", "▤", "◇", "◉"][i]}
                  </span>
                </div>
                <strong>{fmt(k.value)}</strong>
                {k.goal ? (
                  <>
                    <div className="goal-track">
                      <i
                        style={{
                          width: `${Math.min(100, (k.value / k.goal) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {tx("из", "of")} {fmt(k.goal)}{" "}
                      <b>{((k.value / k.goal) * 100).toFixed(1)}%</b>
                    </small>
                  </>
                ) : (
                  <small>
                    {tx("за выбранный месяц · демо", "selected month · demo")}
                  </small>
                )}
              </div>
            ))}
        </section>
        <section
          className="direction-cards"
          aria-label={tx("Направления роста", "Growth directions")}
        >
          {DIRECTIONS.map((d) => {
            const metrics = rows.filter((r) => r.direction === d.key);
            const best = [...metrics].sort((a, b) => b.capture - a.capture)[0];
            return (
              <button
                key={d.key}
                className={`direction-card ${visible.includes(d.key) ? "enabled" : "disabled"} ${mode === "single" && single === d.key ? "highlight" : ""}`}
                onClick={() => toggleDirection(d.key)}
                aria-pressed={visible.includes(d.key)}
                style={{ "--direction": d.color } as React.CSSProperties}
              >
                <span className="direction-top">
                  <span className={`mini-marker ${d.shape}`}>
                    <b>{d.letter}</b>
                  </span>
                  <span>{lang === "ru" ? d.nameRu : d.nameEn}</span>
                  <span className="layer-check">
                    {visible.includes(d.key) ? "✓" : "+"}
                  </span>
                </span>
                <strong>
                  {fmt(metrics.reduce((n, r) => n + r.primaryMetric, 0))}
                </strong>
                <small>{lang === "ru" ? d.primaryRu : d.primaryEn}</small>
                <div className="direction-note">
                  <span>
                    {metrics.filter((r) => r.primaryMetric > 0).length}{" "}
                    {tx("стран", "countries")}
                  </span>
                  <span>
                    ↗ {name(data.countries.find((c) => c.iso === best?.iso))}
                  </span>
                </div>
              </button>
            );
          })}
        </section>
        <div className="observatory-grid">
          <GlobePanel model={model} />
          <FeedbackPanel model={model} />
        </div>
        <footer className="app-footer">
          <span>AI Startify · Global growth challenge</span>
          <span>
            {tx(
              "Демоданные · Реальная платформа не подключена",
              "Demo data · Real platform not connected",
            )}
          </span>
          <span>
            <kbd>P</kbd> {tx("презентация", "present")} <kbd>Space</kbd>{" "}
            {tx("играть", "play")} <kbd>T</kbd> {tx("таблица", "table")}{" "}
            <kbd>1–5</kbd> {tx("слои", "layers")}
          </span>
        </footer>
      </main>

      <FeedbackModals model={model} />
    </div>
  );
}
