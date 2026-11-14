"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { piiGuard, t } from "@startify/shared";
import { DIRECTIONS } from "../config/directions";
import { overallCapture as score } from "../lib/logic";
import { shape, categoryNames } from "./dashboard-copy";
import type {
  DashboardState,
  DirectionKey,
  Feedback,
  Language,
  Pulse,
  Country,
} from "../lib/types";
export function useDashboardController() {
  const [data, setData] = useState<DashboardState | null>(null),
    [lang, setLang] = useState<Language>("ru"),
    [dark, setDark] = useState(true),
    [month, setMonth] = useState(0),
    [playing, setPlaying] = useState(false),
    [presenter, setPresenter] = useState(false),
    [visible, setVisible] = useState<DirectionKey[]>(
      DIRECTIONS.map((d) => d.key),
    ),
    [mode, setMode] = useState<"dominant" | "single">("dominant"),
    [single, setSingle] = useState<DirectionKey>("growth"),
    [table, setTable] = useState(false),
    [webgl, setWebgl] = useState(true),
    [arcs, setArcs] = useState(true),
    [reduced, setReduced] = useState(false),
    [bubblePause, setBubblePause] = useState(false),
    [hovered, setHovered] = useState(false),
    [bubbles, setBubbles] = useState<string[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [add, setAdd] = useState(false),
    [admin, setAdmin] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [pulses, setPulses] = useState<Pulse[]>([]),
    [original, setOriginal] = useState(false),
    [filters, setFilters] = useState({
      country: "",
      direction: "",
      category: "",
      author: "",
      status: "",
      sort: "votes",
    }),
    [sort, setSort] = useState<"score" | "country" | "growth">("score");
  const recentBubble = useRef<string | null>(null);
  const bubbleCursor = useRef(0);
  const hasShownBubble = useRef(false);
  const tx = useCallback((ru: string, en: string) => t(lang, ru, en), [lang]);
  const label = (map: Record<string, [string, string]>, key: string) =>
    map[key]?.[lang === "ru" ? 0 : 1] ?? key;
  const name = useCallback(
    (c?: Country) => (c ? (lang === "ru" ? c.nameRu : c.nameEn) : ""),
    [lang],
  );
  const text = useCallback(
    (f: Feedback) =>
      original ? f.textOriginal : lang === "ru" ? f.textRu : f.textEn,
    [original, lang],
  );
  const fmt = (n: number) =>
    n.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
  useEffect(() => {
    fetch("/api/data")
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Could not load demo data / Не удалось загрузить демоданные",
          );
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
    fetch("/api/session")
      .then((r) => r.json())
      .then((r) => setAdmin(Boolean(r.admin)))
      .catch(() => {});
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const listener = () => setReduced(mq.matches);
    mq.addEventListener("change", listener);
    setLang(localStorage.getItem("impact-lang") === "en" ? "en" : "ru");
    setDark(localStorage.getItem("impact-theme") !== "light");
    return () => mq.removeEventListener("change", listener);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("impact-lang", lang);
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("impact-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () => setMonth((m) => (m + 1) % 13),
      presenter ? 3000 : 1800,
    );
    return () => clearInterval(id);
  }, [playing, presenter]);
  useEffect(() => {
    if (!presenter) return;
    setPlaying(true);
    setMode("single");
    const id = setInterval(
      () =>
        setSingle(
          (s) =>
            DIRECTIONS[(DIRECTIONS.findIndex((d) => d.key === s) + 1) % 5].key,
        ),
      6000,
    );
    return () => clearInterval(id);
  }, [presenter]);
  const feedbackPool = useMemo(
    () =>
      data
        ? [...data.feedback].sort(
            (a, b) =>
              b.votes - a.votes || b.createdAt.localeCompare(a.createdAt),
          )
        : [],
    [data],
  );
  useEffect(() => {
    if (!feedbackPool.length || reduced || bubblePause || hovered) return;
    const show = () => {
      if (recentBubble.current) {
        setBubbles([recentBubble.current]);
        recentBubble.current = null;
        return;
      }
      setBubbles([feedbackPool[bubbleCursor.current % feedbackPool.length].id]);
      bubbleCursor.current++;
    };
    if (recentBubble.current || !hasShownBubble.current) {
      show();
      hasShownBubble.current = true;
    }
    const id = setInterval(show, 6000);
    return () => clearInterval(id);
  }, [feedbackPool, reduced, bubblePause, hovered]);
  const toggleDirection = useCallback((key: DirectionKey) => {
    setVisible((v) =>
      v.includes(key) ? v.filter((k) => k !== key) : [...v, key],
    );
    setSingle(key);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest("input,textarea,select,[contenteditable=true]") ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (e.key === "Escape") {
        setPresenter(false);
        setPlaying(false);
        setDetail(null);
        setAdd(false);
        setSelected(null);
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (presenter) setPlaying(false);
        setPresenter(!presenter);
      } else if (e.code === "Space") {
        if (el.closest("button")) return;
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        setTable((t) => !t);
      } else if (/^[1-5]$/.test(e.key)) {
        e.preventDefault();
        toggleDirection(DIRECTIONS[Number(e.key) - 1].key);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggleDirection, presenter]);
  const rows = useMemo(
    () => data?.metrics.filter((m) => m.monthIndex === month) ?? [],
    [data, month],
  );
  const ranking = useMemo(() => {
    if (!data) return [];
    return data.countries
      .map((c) => {
        const metrics = rows.filter((r) => r.iso === c.iso);
        const previous = data.metrics.filter(
          (r) => r.iso === c.iso && r.monthIndex === Math.max(0, month - 1),
        );
        return {
          ...c,
          metrics,
          score: score(metrics),
          growth: score(metrics) - score(previous),
        };
      })
      .sort((a, b) => b.score - a.score || a.iso.localeCompare(b.iso));
  }, [data, rows, month]);
  const sortedCountries = useMemo(
    () =>
      [...ranking].sort((a, b) =>
        sort === "country"
          ? name(a).localeCompare(name(b))
          : sort === "growth"
            ? b.growth - a.growth
            : b.score - a.score,
      ),
    [ranking, sort, name],
  );
  const selectedCountry = ranking.find((c) => c.iso === selected);
  const countryFeedback = useMemo(
    () => data?.feedback.filter((f) => f.iso === selected) ?? [],
    [data, selected],
  );
  const inbox = useMemo(
    () =>
      data
        ? [...data.feedback]
            .filter(
              (f) =>
                (!filters.country || f.iso === filters.country) &&
                (!filters.direction || f.direction === filters.direction) &&
                (!filters.category || f.category === filters.category) &&
                (!filters.author || f.authorType === filters.author) &&
                (!filters.status || f.status === filters.status),
            )
            .sort((a, b) =>
              filters.sort === "votes"
                ? b.votes - a.votes || b.createdAt.localeCompare(a.createdAt)
                : b.createdAt.localeCompare(a.createdAt),
            )
        : [],
    [data, filters],
  );
  const current = data?.globals.find((g) => g.monthIndex === month);
  const selectedFeedback = data?.feedback.find((f) => f.id === detail);
  async function request(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Request failed");
      if (result.state) setData(result.state);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function simulate() {
    const result = await request("/api/simulate", { month });
    if (result) {
      setPulses(result.pulses);
      setNotice(
        tx(
          "Демоактивность добавлена. Показатели обновлены.",
          "Demo activity added. Metrics updated.",
        ),
      );
    }
  }
  async function session() {
    const result = await request("/api/session", { admin: !admin });
    if (result) setAdmin(!admin);
  }
  async function createComment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const problems = [
      ...piiGuard(String(values.nickname)),
      ...piiGuard(String(values.text)),
    ];
    if (problems.length) {
      setError(problems.join("; "));
      return;
    }
    const result = await request("/api/feedback", { ...values, lang });
    if (result) {
      recentBubble.current = result.feedback.id;
      setBubbles([result.feedback.id]);
      setSelected(result.feedback.iso);
      setTable(false);
      setAdd(false);
      setNotice(
        tx(
          "Комментарий добавлен на глобус.",
          "Your comment is now on the globe.",
        ),
      );
    }
  }
  async function vote(f: Feedback) {
    await request("/api/feedback/" + f.id, { action: "vote" });
  }
  async function changeStatus(f: Feedback, status: string) {
    await request("/api/feedback/" + f.id, { action: "status", status });
  }
  async function copyTask(f: Feedback) {
    const c = data?.countries.find((c) => c.iso === f.iso);
    const d = shape(f.direction);
    try {
      await navigator.clipboard.writeText(
        `[DEMO / FICTIONAL] ${name(c)} · ${lang === "ru" ? d.nameRu : d.nameEn}\n${label(categoryNames, f.category)}\n${text(f)}\nAcceptance: address the request, validate localization with an adult school representative.\nFeedback: ${f.id}`,
      );
      setNotice(tx("Текст задачи скопирован.", "Task text copied."));
    } catch {
      setError(
        tx(
          "Копирование недоступно. Выделите текст комментария вручную.",
          "Clipboard unavailable. Select and copy the comment manually.",
        ),
      );
    }
  }
  const openCountry = useCallback((iso: string) => setSelected(iso), []);
  const openFeedback = useCallback((id: string) => setDetail(id), []);
  const closeBubble = useCallback(
    (id: string) => setBubbles((ids) => ids.filter((i) => i !== id)),
    [],
  );
  const unavailable = useCallback(() => setWebgl(false), []);
  return {
    data,
    setData,
    lang,
    setLang,
    dark,
    setDark,
    month,
    setMonth,
    playing,
    setPlaying,
    presenter,
    setPresenter,
    visible,
    setVisible,
    mode,
    setMode,
    single,
    setSingle,
    table,
    setTable,
    webgl,
    setWebgl,
    arcs,
    setArcs,
    reduced,
    setReduced,
    bubblePause,
    setBubblePause,
    hovered,
    setHovered,
    bubbles,
    setBubbles,
    selected,
    setSelected,
    detail,
    setDetail,
    add,
    setAdd,
    admin,
    setAdmin,
    busy,
    setBusy,
    notice,
    setNotice,
    error,
    setError,
    pulses,
    setPulses,
    original,
    setOriginal,
    filters,
    setFilters,
    sort,
    setSort,
    recentBubble,
    tx,
    label,
    name,
    text,
    fmt,
    feedbackPool,
    toggleDirection,
    rows,
    ranking,
    sortedCountries,
    selectedCountry,
    countryFeedback,
    inbox,
    current,
    selectedFeedback,
    request,
    simulate,
    session,
    createComment,
    vote,
    changeStatus,
    copyTask,
    openCountry,
    openFeedback,
    closeBubble,
    unavailable,
  };
}
export type DashboardModel = ReturnType<typeof useDashboardController>;
