"use client";
import { DIRECTIONS } from "../config/directions";
import {
  categories,
  statuses,
  authorNames,
  categoryNames,
  statusNames,
} from "./dashboard-copy";
import { FeedbackCard } from "./FeedbackCard";
import type { DashboardModel } from "./useDashboard";
export function FeedbackPanel({ model }: { model: DashboardModel }) {
  const {
    tx,
    inbox,
    setBubblePause,
    bubblePause,
    data,
    sort,
    setBubbles,
    filters,
    setFilters,
    name,
    lang,
    label,
    setAdd,
    setError,
  } = model;
  if (!data) return null;
  return (
    <aside className="inbox">
      <header>
        <div>
          <div className="eyebrow">
            {tx("ГОЛОСА СООБЩЕСТВА", "COMMUNITY VOICES")}
          </div>
          <h2>
            {tx("Мир говорит.", "The world speaks.")}
            <span>{tx("Мы слушаем.", "We listen.")}</span>
          </h2>
        </div>
        <span className="inbox-count">{inbox.length}</span>
      </header>
      <p className="inbox-intro">
        {tx(
          "Что нужно школам и будущим основателям в разных странах.",
          "What schools and future founders need around the world.",
        )}
      </p>
      <div className="bubble-actions">
        <button
          onClick={() => setBubblePause(!bubblePause)}
          aria-pressed={bubblePause}
        >
          {bubblePause ? "▶" : "Ⅱ"}{" "}
          {tx(
            bubblePause ? "Включить реплики" : "Пауза реплик",
            bubblePause ? "Resume remarks" : "Pause remarks",
          )}
        </button>
        <button
          onClick={() => {
            const latest = [...data.feedback].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            )[0];
            if (latest) setBubbles([latest.id]);
          }}
        >
          {tx("Показать свежую", "Show latest")}
        </button>
      </div>
      <div className="inbox-filters">
        <select
          aria-label={tx("Фильтр стран", "Filter countries")}
          value={filters.country}
          onChange={(e) => setFilters({ ...filters, country: e.target.value })}
        >
          <option value="">{tx("Все страны", "All countries")}</option>
          {data.countries.map((c) => (
            <option key={c.iso} value={c.iso}>
              {name(c)}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("Фильтр направлений", "Filter directions")}
          value={filters.direction}
          onChange={(e) =>
            setFilters({ ...filters, direction: e.target.value })
          }
        >
          <option value="">{tx("Все направления", "All directions")}</option>
          {DIRECTIONS.map((d) => (
            <option key={d.key} value={d.key}>
              {lang === "ru" ? d.nameRu : d.nameEn}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("Фильтр категорий", "Filter categories")}
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
        >
          <option value="">{tx("Все темы", "All categories")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {label(categoryNames, c)}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("Фильтр авторов", "Filter authors")}
          value={filters.author}
          onChange={(e) => setFilters({ ...filters, author: e.target.value })}
        >
          <option value="">{tx("Все авторы", "All roles")}</option>
          {Object.keys(authorNames).map((a) => (
            <option key={a} value={a}>
              {label(authorNames, a)}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("Фильтр статусов", "Filter status")}
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">{tx("Все статусы", "All statuses")}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {label(statusNames, s)}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("Сортировка отзывов", "Sort feedback")}
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
        >
          <option value="votes">{tx("По поддержке", "Most upvoted")}</option>
          <option value="date">{tx("Сначала новые", "Newest first")}</option>
        </select>
      </div>
      <div className="inbox-list">
        {inbox.length ? (
          inbox.map((f) => <FeedbackCard model={model} key={f.id} f={f} />)
        ) : (
          <div className="empty-state">
            {tx(
              "Отзывов по этим фильтрам нет. Сбросьте фильтры или добавьте демо-комментарий.",
              "No matching feedback. Clear a filter or add a demo comment.",
            )}
          </div>
        )}
      </div>
      <button
        className="add-feedback"
        onClick={() => {
          setAdd(true);
          setError("");
        }}
      >
        + {tx("Добавить демо-комментарий", "Add demo comment")}
      </button>
    </aside>
  );
}
