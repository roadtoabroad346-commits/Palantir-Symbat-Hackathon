"use client";
import { DIRECTIONS } from "../config/directions";
import { overallCapture as score, localizationInsights } from "../lib/logic";
import { categories, categoryNames } from "./dashboard-copy";
import { FeedbackCard } from "./FeedbackCard";
import type { DashboardModel } from "./useDashboard";
export function CountryDrawer({ model }: { model: DashboardModel }) {
  const {
    name,
    selectedCountry,
    tx,
    setSelected,
    lang,
    fmt,
    data,
    selected,
    month,
    label,
    countryFeedback,
  } = model;
  if (!data || !selectedCountry) return null;
  return (
    <aside
      className="country-drawer"
      role="dialog"
      aria-label={name(selectedCountry)}
    >
      <header>
        <div>
          <small>
            {tx("СТРАНА / ВОЛНА", "COUNTRY / WAVE")} 0{selectedCountry.wave}
          </small>
          <h2>{name(selectedCountry)}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={tx("Закрыть страну", "Close country")}
          onClick={() => setSelected(null)}
        >
          ×
        </button>
      </header>
      <div className="country-score">
        <strong>
          {selectedCountry.score.toFixed(1)}
          <span>%</span>
        </strong>
        <span>{tx("общий индекс охвата", "overall capture index")}</span>
      </div>
      <div className="capture-bars">
        {DIRECTIONS.map((d) => {
          const m = selectedCountry.metrics.find((m) => m.direction === d.key);
          return (
            <div key={d.key}>
              <div>
                <span>
                  {d.letter} · {lang === "ru" ? d.nameRu : d.nameEn}
                </span>
                <b>{(m?.capture ?? 0).toFixed(1)}%</b>
              </div>
              <div className="capture-track">
                <i
                  style={{
                    width: `${m?.capture ?? 0}%`,
                    background: d.color,
                  }}
                />
              </div>
              <small>
                {fmt(m?.primaryMetric ?? 0)}{" "}
                {lang === "ru" ? d.primaryRu : d.primaryEn} ·{" "}
                {fmt(m?.secondaryMetric ?? 0)}{" "}
                {lang === "ru" ? d.secondaryRu : d.secondaryEn}
              </small>
            </div>
          );
        })}
      </div>
      <div className="sparkline">
        <span>{tx("13 месяцев роста", "13 months of growth")}</span>
        <svg
          viewBox="0 0 260 50"
          role="img"
          aria-label={tx("История индекса охвата", "Capture index history")}
        >
          <path
            d={
              "M" +
              Array.from(
                { length: 13 },
                (_, i) =>
                  `${i * 21.5},${48 - score(data.metrics.filter((m) => m.iso === selected && m.monthIndex === i)) * 0.44}`,
              ).join(" L")
            }
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <circle
            cx={month * 21.5}
            cy={48 - selectedCountry.score * 0.44}
            r="4"
            fill="currentColor"
          />
        </svg>
      </div>
      <section className="insights">
        <h3>{tx("Что говорят на местах", "Localization insights")}</h3>
        <p>
          {localizationInsights(selectedCountry, data.feedback, lang).summary}
        </p>
        {localizationInsights(selectedCountry, data.feedback, lang).themes.map(
          (theme) => (
            <div className="insight-row" key={theme.theme}>
              <span>{theme.theme}</span>
              <b>{theme.count}</b>
            </div>
          ),
        )}
        <div className="category-counts">
          {categories.map((c) => (
            <span key={c}>
              {label(categoryNames, c)}:{" "}
              {countryFeedback.filter((f) => f.category === c).length}
            </span>
          ))}
        </div>
        <a
          className="csv-link"
          href={`/api/insights?iso=${selected}&lang=${lang}`}
        >
          {tx("Скачать инсайты CSV", "Export insights CSV")} ↓
        </a>
      </section>
      <h3>{tx("Голоса сообщества", "Community voices")}</h3>
      {countryFeedback.slice(0, 4).map((f) => (
        <FeedbackCard model={model} f={f} compact key={f.id} />
      ))}
    </aside>
  );
}
