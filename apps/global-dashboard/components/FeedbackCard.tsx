"use client";
import type { Feedback } from "../lib/types";
import {
  shape,
  authorNames,
  categoryNames,
  statusNames,
  statuses,
} from "./dashboard-copy";
import type { DashboardModel } from "./useDashboard";
export function FeedbackCard({
  model,
  f,
  compact = false,
}: {
  model: DashboardModel;
  f: Feedback;
  compact?: boolean;
}) {
  const {
    label,
    name,
    data,
    lang,
    setDetail,
    setSelected,
    text,
    busy,
    vote,
    tx,
    admin,
    changeStatus,
  } = model;
  const d = shape(f.direction);
  return (
    <article className="feedback-card">
      <div className="feedback-meta">
        <span className="avatar">
          {f.authorType === "teacher"
            ? "▤"
            : f.authorType === "student"
              ? "✦"
              : "↗"}
        </span>
        <div>
          <strong>{f.nickname}</strong>
          <small>
            {label(authorNames, f.authorType)} ·{" "}
            {name(data?.countries.find((c) => c.iso === f.iso))}
          </small>
        </div>
        <span
          className="direction-dot"
          style={{ background: d.color }}
          title={lang === "ru" ? d.nameRu : d.nameEn}
        />
      </div>
      <button
        className="feedback-text"
        onClick={() => {
          setDetail(f.id);
          setSelected(f.iso);
        }}
      >
        {text(f)}
      </button>
      <div className="feedback-footer">
        <span className="tag">{label(categoryNames, f.category)}</span>
        <button
          className="vote"
          disabled={busy}
          onClick={() => vote(f)}
          aria-label={tx("Поддержать комментарий", "Upvote comment")}
        >
          ↑ {f.votes}
        </button>
      </div>
      <div className="fictional">
        {tx("Демо-комментарий (вымышленный)", "Demo comment (fictional)")} ·{" "}
        {label(statusNames, f.status)}
      </div>
      {!compact && admin && (
        <label className="status-control">
          {tx("Статус", "Status")}
          <select
            value={f.status}
            onChange={(e) => changeStatus(f, e.target.value)}
            disabled={busy}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label(statusNames, s)}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}
