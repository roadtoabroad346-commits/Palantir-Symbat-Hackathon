"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import GlobeRenderer, { type GlobeMethods } from "react-globe.gl";
import { MeshPhongMaterial } from "three";
import { feature } from "topojson-client";
import type { Feature, Geometry } from "geojson";
import world from "world-atlas/countries-110m.json";
import { DIRECTIONS } from "../config/directions";
import { overallCapture, dominantDirection } from "../lib/logic";
import type {
  Country,
  Metric,
  Feedback,
  DirectionKey,
  Language,
  Pulse,
  Direction,
} from "../lib/types";
import { screenMarkerFan } from "./marker-layout";
import "./globe.css";

export interface GlobeProps {
  countries: Country[];
  metrics: Metric[];
  feedback: Feedback[];
  visible: DirectionKey[];
  mode: "dominant" | "single";
  single: DirectionKey;
  lang: Language;
  selectedIso: string | null;
  onCountry: (iso: string) => void;
  onFeedback: (id: string) => void;
  pulses: Pulse[];
  arcs: boolean;
  reducedMotion: boolean;
  paused: boolean;
  presenter: boolean;
  activeBubbleIds: string[];
  onCloseBubble: (id: string) => void;
  onBubbleHover?: (hover: boolean) => void;
  onUnavailable: () => void;
}

const COUNTRY_NUMERIC: Record<string, string> = {
  "398": "KZ",
  "860": "UZ",
  "417": "KG",
  "356": "IN",
  "566": "NG",
  "608": "PH",
  "404": "KE",
  "792": "TR",
  "704": "VN",
  "360": "ID",
};
type LandFeature = Feature<Geometry, { name: string }>;
const geography = feature(
  world as unknown as Parameters<typeof feature>[0],
  world.objects.countries as unknown as Parameters<typeof feature>[1],
);
const land = (
  geography.type === "FeatureCollection" ? geography.features : []
) as LandFeature[];
const offsets = screenMarkerFan(5);
const directionMap = new Map(DIRECTIONS.map((d) => [d.key, d]));
const tr = (lang: Language, ru: string, en: string) =>
  lang === "ru" ? ru : en;
const name = (country: Country, lang: Language) =>
  lang === "ru" ? country.nameRu : country.nameEn;
const directionName = (direction: Direction, lang: Language) =>
  lang === "ru" ? direction.nameRu : direction.nameEn;
const polygonIso = (polygon: object) =>
  COUNTRY_NUMERIC[String(Number((polygon as LandFeature).id))];
const colors = (hex: string, alpha: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
};

class WebGLBoundary extends Component<
  { children: ReactNode; onUnavailable: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onUnavailable();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type MarkerItem = {
  kind: "marker";
  id: string;
  country: Country;
  metric: Metric;
  direction: Direction;
  lat: number;
  lng: number;
  slot: number;
};
type BubbleItem = {
  kind: "bubble";
  id: string;
  country: Country;
  feedback: Feedback;
  lat: number;
  lng: number;
};
type HtmlItem = MarkerItem | BubbleItem;

export default function Globe(props: GlobeProps) {
  const {
    countries,
    metrics,
    feedback,
    visible,
    mode,
    single,
    lang,
    selectedIso,
    onCountry,
    onFeedback,
    pulses,
    arcs,
    reducedMotion,
    paused,
    presenter,
    activeBubbleIds,
    onCloseBubble,
    onBubbleHover,
    onUnavailable,
  } = props;
  const container = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 700, height: 540 });
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const countryMap = useMemo(
    () => new Map(countries.map((c) => [c.iso, c])),
    [countries],
  );
  const currentMetrics = useMemo(
    () =>
      new Map(
        countries.map((c) => [c.iso, metrics.filter((m) => m.iso === c.iso)]),
      ),
    [countries, metrics],
  );
  const material = useMemo(
    () =>
      new MeshPhongMaterial({
        color: "#081b2c",
        shininess: 9,
        emissive: "#040d15",
        specular: "#13334e",
      }),
    [],
  );

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) {
      setSupported(false);
      onUnavailable();
      return;
    }
    context.getExtension("WEBGL_lose_context")?.loseContext();
    setSupported(true);
  }, [onUnavailable]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(280, Math.round(entry.contentRect.width)),
        height: Math.max(360, Math.round(entry.contentRect.height)),
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (presenter) setInteracted(false);
  }, [presenter]);
  // The library may signal readiness before its forwarded ref is assigned.
  // Initialize the camera after React commits the ready render, including in reduced motion.
  useEffect(() => {
    if (!ready || !globe.current) return;
    globe.current.pointOfView({ lat: 24, lng: 65, altitude: 2.2 }, 0);
  }, [ready]);
  useEffect(() => {
    if (!ready || !globe.current) return;
    const controls = globe.current.controls();
    controls.autoRotate = !reducedMotion && !interacted;
    controls.autoRotateSpeed = presenter ? 0.38 : 0.22;
    controls.enableDamping = !reducedMotion;
    controls.minDistance = 160;
    controls.maxDistance = 600;
    const stop = () => setInteracted(true);
    controls.addEventListener("start", stop);
    return () => {
      controls.removeEventListener("start", stop);
    };
  }, [ready, reducedMotion, interacted, presenter]);
  useEffect(() => {
    if (!ready || !selectedIso || !globe.current) return;
    const country = countryMap.get(selectedIso);
    if (!country) return;
    globe.current.pointOfView(
      { lat: country.lat, lng: country.lng, altitude: 1.75 },
      reducedMotion ? 0 : 950,
    );
  }, [selectedIso, countryMap, ready, reducedMotion]);
  useEffect(() => {
    if (!ready) return;
    const canvas = container.current?.querySelector("canvas");
    const lost = (event: Event) => {
      event.preventDefault();
      onUnavailable();
    };
    canvas?.addEventListener("webglcontextlost", lost);
    return () => canvas?.removeEventListener("webglcontextlost", lost);
  }, [ready, onUnavailable]);

  const visibleMetrics = useMemo(
    () =>
      metrics.filter(
        (m) =>
          m.primaryMetric > 0 &&
          visible.includes(m.direction) &&
          (mode !== "single" || m.direction === single),
      ),
    [metrics, visible, mode, single],
  );
  const htmlItems = useMemo(() => {
    const markers: MarkerItem[] = visibleMetrics.flatMap((metric) => {
      const country = countryMap.get(metric.iso),
        direction = directionMap.get(metric.direction);
      return country && direction
        ? [
            {
              kind: "marker" as const,
              id: `${country.iso}:${metric.direction}`,
              country,
              metric,
              direction,
              lat: country.lat,
              lng: country.lng,
              slot: DIRECTIONS.findIndex((d) => d.key === metric.direction),
            },
          ]
        : [];
    });
    const bubbles: BubbleItem[] = activeBubbleIds.slice(0, 3).flatMap((id) => {
      const f = feedback.find((f) => f.id === id),
        country = f ? countryMap.get(f.iso) : undefined;
      return f && country
        ? [
            {
              kind: "bubble" as const,
              id: f.id,
              country,
              feedback: f,
              lat: country.lat,
              lng: country.lng,
            },
          ]
        : [];
    });
    return [...markers, ...bubbles].slice(0, 200);
  }, [visibleMetrics, countryMap, activeBubbleIds, feedback]);
  const arcItems = useMemo(() => {
    if (!arcs) return [];
    const hub = countryMap.get("KZ");
    if (!hub) return [];
    return countries
      .filter((c) => c.wave > 1 && visibleMetrics.some((m) => m.iso === c.iso))
      .map((country) => {
        const rows = visibleMetrics.filter((m) => m.iso === country.iso);
        const key = mode === "single" ? single : dominantDirection(rows);
        return {
          startLat: hub.lat,
          startLng: hub.lng,
          endLat: country.lat,
          endLng: country.lng,
          iso: country.iso,
          color: directionMap.get(key ?? "growth")?.color ?? "#79c6e8",
        };
      });
  }, [arcs, countryMap, countries, visibleMetrics, mode, single]);
  const ringItems = useMemo(
    () =>
      reducedMotion
        ? []
        : pulses.slice(-20).flatMap((pulse) => {
            const country = countryMap.get(pulse.iso);
            return country && visible.includes(pulse.direction)
              ? [
                  {
                    ...pulse,
                    lat: country.lat,
                    lng: country.lng,
                    color: directionMap.get(pulse.direction)?.color ?? "#fff",
                  },
                ]
              : [];
          }),
    [pulses, countryMap, visible, reducedMotion],
  );

  const pickCountry = useCallback(
    (iso: string) => {
      setInteracted(true);
      onCountry(iso);
    },
    [onCountry],
  );
  const htmlElement = useCallback(
    (data: object) => {
      const item = data as HtmlItem;
      const anchor = document.createElement("div");
      anchor.className = `globe-html-anchor globe-${item.kind}-anchor`;
      anchor.style.pointerEvents = "none";
      if (item.kind === "marker") {
        const position = document.createElement("span");
        position.className = "globe-marker-position";
        position.style.transform = `translate(${offsets[item.slot].x}px,${offsets[item.slot].y}px)`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `globe-direction-marker globe-shape-${item.direction.shape}${selectedIso === item.country.iso ? " globe-selected" : ""}`;
        button.dataset.direction = item.direction.key;
        button.dataset.country = item.country.iso;
        button.style.setProperty("--marker-color", item.direction.color);
        button.style.setProperty(
          "--marker-size",
          `${24 + (8 * item.metric.capture) / 100}px`,
        );
        button.textContent = item.direction.letter;
        const label = `${name(item.country, lang)}, ${directionName(item.direction, lang)}, ${tr(lang, "охват", "capture")} ${item.metric.capture.toFixed(1)} ${tr(lang, "из 100", "of 100")}`;
        button.setAttribute("aria-label", label);
        button.title = label;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          pickCountry(item.country.iso);
        });
        button.addEventListener("pointerdown", (event) =>
          event.stopPropagation(),
        );
        position.append(button);
        anchor.append(position);
        return anchor;
      }
      const f = item.feedback,
        direction = directionMap.get(f.direction)!;
      const bubble = document.createElement("section");
      bubble.className = "globe-remark";
      bubble.setAttribute("role", "dialog");
      bubble.setAttribute(
        "aria-label",
        tr(lang, "Комментарий на глобусе", "Globe feedback"),
      );
      bubble.dataset.feedbackId = f.id;
      bubble.style.setProperty("--remark-color", direction.color);
      bubble.style.pointerEvents = "auto";
      if (reducedMotion || paused) bubble.classList.add("globe-remark-static");
      const top = document.createElement("div");
      top.className = "globe-remark-header";
      const author = document.createElement("span");
      const authorLabels = {
        ambassador: tr(lang, "Амбассадор", "Ambassador"),
        teacher: tr(lang, "Учитель", "Teacher"),
        student: tr(lang, "Ученик", "Student"),
      };
      author.textContent = `${{ ambassador: "△", teacher: "◇", student: "○" }[f.authorType]} ${f.nickname} · ${authorLabels[f.authorType]}`;
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.className = "globe-remark-close";
      close.setAttribute(
        "aria-label",
        tr(lang, "Закрыть комментарий", "Close remark"),
      );
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        onBubbleHover?.(false);
        onCloseBubble(f.id);
      });
      top.append(author, close);
      const chip = document.createElement("span");
      chip.className = "globe-remark-chip";
      chip.textContent = `${direction.letter} · ${directionName(direction, lang)} / ${f.category}`;
      const text = document.createElement("button");
      text.type = "button";
      text.className = "globe-remark-text";
      text.textContent = lang === "ru" ? f.textRu : f.textEn;
      text.addEventListener("click", (event) => {
        event.stopPropagation();
        pickCountry(f.iso);
        onFeedback(f.id);
      });
      const footer = document.createElement("div");
      footer.className = "globe-remark-footer";
      const demo = document.createElement("span");
      demo.textContent = tr(
        lang,
        "Демо: вымышленный комментарий",
        "Demo comment (fictional)",
      );
      const original = document.createElement("button");
      original.type = "button";
      original.textContent = tr(lang, "Оригинал", "Original");
      original.setAttribute("aria-pressed", "false");
      original.addEventListener("click", (event) => {
        event.stopPropagation();
        const showing = original.getAttribute("aria-pressed") === "true";
        original.setAttribute("aria-pressed", String(!showing));
        text.textContent = showing
          ? lang === "ru"
            ? f.textRu
            : f.textEn
          : f.textOriginal;
        original.textContent = showing
          ? tr(lang, "Оригинал", "Original")
          : tr(lang, "Перевод", "Translation");
      });
      footer.append(demo, original);
      bubble.addEventListener("mouseenter", () => onBubbleHover?.(true));
      bubble.addEventListener("mouseleave", () => onBubbleHover?.(false));
      bubble.addEventListener("focusin", () => onBubbleHover?.(true));
      bubble.addEventListener("focusout", (event) => {
        if (!bubble.contains(event.relatedTarget as Node))
          onBubbleHover?.(false);
      });
      bubble.addEventListener("pointerdown", (event) =>
        event.stopPropagation(),
      );
      bubble.append(top, chip, text, footer);
      anchor.append(bubble);
      return anchor;
    },
    [
      lang,
      selectedIso,
      pickCountry,
      onFeedback,
      onCloseBubble,
      onBubbleHover,
      reducedMotion,
      paused,
    ],
  );
  const capColor = useCallback(
    (object: object) => {
      const iso = polygonIso(object);
      const rows = (currentMetrics.get(iso) ?? []).filter((m) =>
        visible.includes(m.direction),
      );
      const key = mode === "single" ? single : dominantDirection(rows);
      const metric = rows.find((m) => m.direction === key);
      const score =
        mode === "single"
          ? (metric?.capture ?? 0)
          : overallCapture(currentMetrics.get(iso) ?? []);
      if (!key || score <= 0 || !visible.includes(key)) return "#142a39";
      return colors(directionMap.get(key)!.color, 0.3 + (0.65 * score) / 100);
    },
    [currentMetrics, visible, mode, single],
  );
  const tooltip = useCallback(
    (object: object) => {
      const iso = polygonIso(object),
        country = countryMap.get(iso);
      if (!country) return "";
      const rows = currentMetrics.get(iso) ?? [];
      const el = document.createElement("div");
      el.className = "globe-country-tooltip";
      const heading = document.createElement("strong");
      heading.textContent = name(country, lang);
      el.append(heading);
      const summary = document.createElement("div");
      summary.textContent = `${tr(lang, "Волна", "Wave")} ${country.wave} · ${tr(lang, "Общий охват", "Overall capture")} ${overallCapture(rows).toFixed(1)}%`;
      el.append(summary);
      for (const d of DIRECTIONS) {
        const row = document.createElement("div");
        row.textContent = `${d.letter} · ${directionName(d, lang)}: ${(rows.find((m) => m.direction === d.key)?.capture ?? 0).toFixed(1)}%`;
        el.append(row);
      }
      return el.outerHTML;
    },
    [countryMap, currentMetrics, lang],
  );

  return (
    <div
      className={`globe-viewport${presenter ? " globe-presenting" : ""}`}
      ref={container}
      data-testid="globe-viewport"
      data-marker-count={visibleMetrics.length}
      data-month={metrics[0]?.monthIndex}
      onPointerDownCapture={() => setInteracted(true)}
    >
      {supported === null && (
        <div className="globe-loading" role="status">
          {tr(lang, "Создаём карту возможностей…", "Mapping possibilities…")}
        </div>
      )}
      {supported && (
        <WebGLBoundary onUnavailable={onUnavailable}>
          <GlobeRenderer
            animateIn={false}
            ref={globe}
            width={size.width}
            height={size.height}
            backgroundColor="rgba(0,0,0,0)"
            globeMaterial={material}
            showAtmosphere
            atmosphereColor="#398db6"
            atmosphereAltitude={0.16}
            showGraticules
            onGlobeReady={() => setReady(true)}
            polygonsData={land}
            polygonCapColor={capColor}
            polygonSideColor={() => "#0a1e2d"}
            polygonStrokeColor={(object) =>
              polygonIso(object) === selectedIso ? "#f2fcff" : "#345064"
            }
            polygonAltitude={(object) =>
              polygonIso(object) === selectedIso
                ? 0.018
                : polygonIso(object) === hovered
                  ? 0.012
                  : 0.005
            }
            polygonCapCurvatureResolution={4}
            polygonsTransitionDuration={reducedMotion ? 0 : 550}
            polygonLabel={tooltip}
            onPolygonHover={(object) =>
              setHovered(object ? (polygonIso(object) ?? null) : null)
            }
            onPolygonClick={(object) => {
              const iso = polygonIso(object);
              if (countryMap.has(iso)) pickCountry(iso);
            }}
            htmlElementsData={htmlItems}
            htmlLat="lat"
            htmlLng="lng"
            htmlAltitude={(object) =>
              (object as HtmlItem).kind === "bubble" ? 0.055 : 0.025
            }
            htmlElement={htmlElement}
            htmlTransitionDuration={reducedMotion ? 0 : 350}
            arcsData={arcItems}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor="color"
            arcStroke={0.45}
            arcAltitudeAutoScale={0.38}
            arcDashLength={reducedMotion ? 1 : 0.4}
            arcDashGap={reducedMotion ? 0 : 0.3}
            arcDashAnimateTime={reducedMotion ? 0 : 3600}
            arcsTransitionDuration={reducedMotion ? 0 : 500}
            ringsData={ringItems}
            ringLat="lat"
            ringLng="lng"
            ringAltitude={0.025}
            ringColor="color"
            ringMaxRadius={4}
            ringPropagationSpeed={2}
            ringRepeatPeriod={1250}
          />
        </WebGLBoundary>
      )}
      <div className="globe-annotation" aria-hidden="true">
        <span>●</span>{" "}
        {tr(
          lang,
          "10 стран · 5 направлений · одна общая идея",
          "10 countries · 5 directions · one shared idea",
        )}
      </div>
    </div>
  );
}
