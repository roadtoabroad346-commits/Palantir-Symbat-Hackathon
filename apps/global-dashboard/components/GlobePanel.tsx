"use client";
import dynamic from "next/dynamic";
import { DIRECTIONS } from "../config/directions";
import type { DirectionKey } from "../lib/types";
import { CountryDrawer } from "./CountryDrawer";
import type { DashboardModel } from "./useDashboard";
const Globe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => (
    <div className="globe-loading">
      <span className="loading-orbit" />
      Loading local atlas…
    </div>
  ),
});
export function GlobePanel({ model }: { model: DashboardModel }) {
  const {
    tx,
    mode,
    setMode,
    single,
    setSingle,
    lang,
    arcs,
    setArcs,
    table,
    setTable,
    webgl,
    sort,
    setSort,
    sortedCountries,
    selected,
    setSelected,
    name,
    fmt,
    data,
    rows,
    visible,
    openCountry,
    openFeedback,
    pulses,
    reduced,
    bubblePause,
    presenter,
    bubbles,
    closeBubble,
    setHovered,
    unavailable,
    ranking,
    month,
    toggleDirection,
    playing,
    setPlaying,
    setMonth,
  } = model;
  if (!data) return null;
  return (
    <section className="atlas-panel">
      <div className="atlas-toolbar">
        <div
          className="view-segments"
          aria-label={tx("Режим заливки", "Coverage mode")}
        >
          <button
            className={mode === "dominant" ? "selected" : ""}
            onClick={() => setMode("dominant")}
          >
            {tx("Ведущее направление", "Dominant direction")}
          </button>
          <button
            className={mode === "single" ? "selected" : ""}
            onClick={() => setMode("single")}
          >
            {tx("Одно направление", "Single direction")}
          </button>
        </div>
        <div className="atlas-controls">
          {mode === "single" && (
            <select
              aria-label={tx("Направление", "Direction")}
              value={single}
              onChange={(e) => setSingle(e.target.value as DirectionKey)}
            >
              {DIRECTIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {lang === "ru" ? d.nameRu : d.nameEn}
                </option>
              ))}
            </select>
          )}
          <button
            className={arcs ? "active" : ""}
            onClick={() => setArcs(!arcs)}
            aria-pressed={arcs}
          >
            ⌁ {tx("Маршруты", "Arcs")}
          </button>
          <button
            className={table ? "active" : ""}
            onClick={() => setTable(!table)}
            aria-pressed={table}
          >
            ▤ {tx("Таблица", "Table")} <kbd>T</kbd>
          </button>
        </div>
      </div>
      <div className="atlas-stage">
        {!webgl || table ? (
          <div className="country-table">
            <div className="table-caption">
              <h2>{tx("Мир в цифрах", "The world in numbers")}</h2>
              <label>
                {tx("Сортировка", "Sort")}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                >
                  <option value="score">
                    {tx("Индекс охвата", "Capture index")}
                  </option>
                  <option value="country">{tx("Страна", "Country")}</option>
                  <option value="growth">
                    {tx("Рост за месяц", "Monthly growth")}
                  </option>
                </select>
              </label>
            </div>
            {!webgl && (
              <p role="status">
                {tx(
                  "WebGL недоступен. Все данные доступны в этой таблице.",
                  "WebGL is unavailable. All data remains available in this table.",
                )}
              </p>
            )}
            <div className="table-overflow">
              <table>
                <thead>
                  <tr>
                    <th>{tx("Страна", "Country")}</th>
                    <th>{tx("Волна", "Wave")}</th>
                    <th>{tx("Индекс", "Index")}</th>
                    {DIRECTIONS.map((d) => (
                      <th key={d.key}>
                        <span style={{ color: d.color }}>{d.letter}</span>{" "}
                        {lang === "ru" ? d.nameRu : d.nameEn}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCountries.map((c) => (
                    <tr key={c.iso}>
                      <th>
                        <button onClick={() => setSelected(c.iso)}>
                          {name(c)} ↗
                        </button>
                      </th>
                      <td>0{c.wave}</td>
                      <td>{c.score.toFixed(1)}%</td>
                      {DIRECTIONS.map((d) => (
                        <td key={d.key}>
                          {(
                            c.metrics.find((m) => m.direction === d.key)
                              ?.capture ?? 0
                          ).toFixed(1)}
                          %
                          <small>
                            {fmt(
                              c.metrics.find((m) => m.direction === d.key)
                                ?.primaryMetric ?? 0,
                            )}
                          </small>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <div className="globe-caption">
              <span className="crosshair">+</span>
              <div>
                <strong>
                  {tx("Идеи не знают границ", "Ideas know no borders")}
                </strong>
                <small>
                  {tx(
                    "Вращайте мир. Находите возможности.",
                    "Rotate the world. Find the possibilities.",
                  )}
                </small>
              </div>
            </div>
            <Globe
              countries={data.countries}
              metrics={rows}
              feedback={data.feedback}
              visible={visible}
              mode={mode}
              single={single}
              lang={lang}
              selectedIso={selected}
              onCountry={openCountry}
              onFeedback={openFeedback}
              pulses={pulses}
              arcs={arcs}
              reducedMotion={reduced}
              paused={bubblePause}
              presenter={presenter}
              activeBubbleIds={bubbles}
              onCloseBubble={closeBubble}
              onBubbleHover={setHovered}
              onUnavailable={unavailable}
            />
            <div className="map-footnote">
              <span>
                ↗{" "}
                {
                  ranking.filter((c) =>
                    c.metrics.some((m) => m.primaryMetric > 0),
                  ).length
                }
                /10 {tx("стран активны", "countries active")}
              </span>
              <span>
                0{month >= 8 ? 3 : month >= 4 ? 2 : 1} /{" "}
                {tx("ВОЛНА РОСТА", "EXPANSION WAVE")}
              </span>
            </div>
          </>
        )}
        <CountryDrawer model={model} />
      </div>
      <div className="globe-legend">
        <div className="legend-directions">
          {DIRECTIONS.map((d, i) => (
            <button
              key={d.key}
              onClick={() => toggleDirection(d.key)}
              aria-pressed={visible.includes(d.key)}
              className={!visible.includes(d.key) ? "muted" : ""}
            >
              <span
                className={`mini-marker ${d.shape}`}
                style={{ background: d.color }}
              >
                <b>{d.letter}</b>
              </span>
              <span>{lang === "ru" ? d.nameRu : d.nameEn}</span>
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
        <div className="capture-key">
          <span>{tx("Охват", "Capture")}</span>
          <i />
          <span>0—100%</span>
        </div>
      </div>
      <div className="timeline">
        <button
          className="play-button"
          aria-label={
            playing
              ? tx("Пауза", "Pause timeline")
              : tx("Играть таймлайн", "Play timeline")
          }
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <div className="timeline-line">
          <div className="timeline-heading">
            <strong>
              {tx("Месяц", "Month")} {String(month).padStart(2, "0")}{" "}
              <span>/ 12</span>
            </strong>
            <span>
              {tx(
                "От первых идей к глобальному движению",
                "From first ideas to a global movement",
              )}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="12"
            step="1"
            value={month}
            aria-label={tx("Месяц таймлайна", "Timeline month")}
            onChange={(e) => {
              setMonth(Number(e.target.value));
              setPlaying(false);
            }}
          />
          <div className="wave-ticks">
            <span>00 · KZ / UZ / KG</span>
            <span>04 · IN / NG / PH / KE</span>
            <span>08 · TR / VN / ID</span>
            <span>12</span>
          </div>
        </div>
      </div>
      <div className="leaderboards">
        <section>
          <h3>↗ {tx("Лидеры охвата", "Capture leaders")}</h3>
          {ranking.slice(0, 5).map((c, i) => (
            <button onClick={() => setSelected(c.iso)} key={c.iso}>
              <span className="rank-number">0{i + 1}</span>
              <span>{name(c)}</span>
              <b>{c.score.toFixed(1)}%</b>
            </button>
          ))}
        </section>
        <section>
          <h3>✦ {tx("Быстрее всего растут", "Fastest this month")}</h3>
          {[...ranking]
            .sort((a, b) => b.growth - a.growth || a.iso.localeCompare(b.iso))
            .slice(0, 5)
            .map((c, i) => (
              <button onClick={() => setSelected(c.iso)} key={c.iso}>
                <span className="rank-number">0{i + 1}</span>
                <span>{name(c)}</span>
                <b>
                  +{Math.max(0, c.growth).toFixed(1)} {tx("п.п.", "pp")}
                </b>
              </button>
            ))}
        </section>
      </div>
    </section>
  );
}
