"use client";
import { DIRECTIONS } from "../config/directions";
import { categories, authorNames, categoryNames } from "./dashboard-copy";
import { FeedbackCard } from "./FeedbackCard";
import { Modal } from "./Modal";
import type { DashboardModel } from "./useDashboard";
export function FeedbackModals({ model }: { model: DashboardModel }) {
  const {
    selectedFeedback,
    tx,
    setDetail,
    setOriginal,
    original,
    copyTask,
    add,
    setAdd,
    error,
    createComment,
    label,
    name,
    selected,
    data,
    single,
    lang,
    busy,
  } = model;
  if (!data) return null;
  return (
    <>
      {selectedFeedback && (
        <Modal
          title={tx("Голос сообщества", "Community voice")}
          onClose={() => setDetail(null)}
        >
          <FeedbackCard model={model} f={selectedFeedback} />
          <div className="detail-actions">
            <button
              className="secondary-button"
              onClick={() => setOriginal(!original)}
            >
              {tx(
                original ? "Показать перевод" : "Показать оригинал",
                original ? "Show translation" : "Show original",
              )}
            </button>
            <button
              className="primary-button"
              onClick={() => copyTask(selectedFeedback)}
            >
              {tx("Копировать как задачу", "Copy as task")}
            </button>
          </div>
          <small className="fictional">
            {tx(
              "Вымышленный отзыв. Только никнейм, без личных данных.",
              "Fictional feedback. Nickname only, no personal data.",
            )}
          </small>
        </Modal>
      )}
      {add && (
        <Modal
          title={tx("Добавить демо-комментарий", "Add demo comment")}
          onClose={() => setAdd(false)}
        >
          <p className="form-intro">
            {tx(
              "Только вымышленные никнеймы. Не указывайте имена, телефоны или email.",
              "Invented nicknames only. Do not enter real names, phones or emails.",
            )}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={createComment} className="comment-form">
            <label>
              {tx("Роль", "Role")}
              <select name="authorType">
                {Object.keys(authorNames).map((a) => (
                  <option key={a} value={a}>
                    {label(authorNames, a)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("Никнейм", "Nickname")}
              <input
                name="nickname"
                required
                maxLength={40}
                placeholder="Nova42"
              />
            </label>
            <label>
              {tx("Страна", "Country")}
              <select name="iso" defaultValue={selected ?? "UZ"}>
                {data.countries.map((c) => (
                  <option key={c.iso} value={c.iso}>
                    {name(c)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("Направление", "Direction")}
              <select name="direction" defaultValue={single}>
                {DIRECTIONS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {lang === "ru" ? d.nameRu : d.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              {tx("Тема", "Category")}
              <select name="category">
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {label(categoryNames, c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              {tx("Что можно улучшить?", "What could work better?")}
              <textarea
                name="text"
                rows={4}
                required
                maxLength={600}
                placeholder={tx(
                  "Нужны короткие задания на местном языке.",
                  "Short tasks in the local language would help.",
                )}
              />
            </label>
            <button
              className="primary-button full-width"
              type="submit"
              disabled={busy}
            >
              {tx("Добавить на глобус", "Add to the globe")} ↗
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
