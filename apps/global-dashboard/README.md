# Global Impact · an atlas of possibility

A sixth independent MVP for the AI Startify growth team and hackathon presenters. A fully local 3D observatory shows **demo capture indices**, expansion waves and fictional community requests. It does not measure actual market share or connect to the real AI Startify platform.

## Run

From the monorepo root, with Node24 and pnpm11.25:

```sh
pnpm install --frozen-lockfile
pnpm dev:globe
```

Port3006. The command generates Prisma, applies the checked-in SQLite migration and seeds an empty database automatically. No manual database steps, keys or external runtime services are required. `pnpm --filter global-dashboard db:seed` is idempotent and preserves existing demo changes. Cloud cache exports are documented in the root README.

```sh
pnpm --filter global-dashboard build
pnpm --filter global-dashboard start
pnpm --filter global-dashboard smoke
node scripts/globe-browser-smoke.mjs   # optional installed Chromium
pnpm test
pnpm lint
```

## A 60-second demonstration

1. Open the dashboard: month0 starts with4,000users and567published projects. KZ,UZ,KG are active. The five marker shapes use letters G,A,C,P,L as well as color.
2. Play the timeline. At month4 India,Nigeria,Philippines and Kenya light up; month8 adds Turkey,Vietnam,Indonesia. Month12 reaches100,000users and10,000projects before extra simulation.
3. Pause on a speech bubble, show its original text, then open the feedback detail. Every remark is labelled fictional.
4. Choose Single direction and Ambassadors; use the legend to hide/show layers. Click India for capture bars,13-month history and Hindi lesson-kit insights.
5. Add an invented nickname and a short comment. The comment appears immediately on the globe. An email, phone-like string or obvious full name is rejected.
6. Simulate activity: counters increase and pulses identify the affected place. Open Table view for equivalent keyboard-accessible country data.
7. Press P for presenter mode; Escape exits. Space plays/pauses, T changes view,1–5toggle directions. Shortcuts do not interfere with text inputs.

## Data, offline behavior and privacy

World shapes are bundled from world-atlas/countries-110m.json and converted locally using topojson-client. No globeImageUrl, remote fonts,textures,tiles or runtime CDN requests are used. react-globe.gl is dynamically imported with SSR disabled. When WebGL fails, all country data remains available in a sortable table.

The initial curve is deterministic and normalized: Growth registrations sum to global users and League publications sum to global projects at all13months. Per-country counts grow monotonically after their wave starts. Each capture score divides the direction's metric by its configured country target,clamped to0–100; the overall index uses configurable weights. Targets are illustrative,not population estimates. Direction config is shared by renderer,cards,legend,table and drawer.

Simulation uses the shared MockAiStartifyClient and persists changes to the selected and subsequent months to preserve sums and monotonicity. It intentionally changes the original curve. Seeded comments have local-language originals and RU/EN translations. New free-form comments retain their original language; the other language explicitly labels the original text instead of pretending to translate it. Public nickname and text validation runs both in the browser and on the server. No tracking or student contact fields exist.

Reduced motion disables globe rotation,automatic remarks,animated arcs,rings and camera animation. Timeline play remains manual and advances discrete states. The table and buttons expose equivalent data without manipulating the3Dcanvas. The desktop drawer becomes an overlay sheet on mobile.

## Architecture and future integration

`config/directions.ts` owns colors,shapes,letters and weights; `config/targets.ts` owns markets,waves and illustrative targets. Prisma stores countries,650direction/month rows,13global rows and60fictional comments in `prisma/demo.db`. The UI reads `/api/data`; mock mutations return updated state and pulse metadata. Comments support upvotes and demo-admin triage; insights export as CSV.

`DashboardDataSource` isolates the dashboard from real MVPs. `MockDataSource` reads local SQLite. `HttpDataSource` deliberately throws **not implemented**. Future MVP contract:

```text
GET /api/metrics?country=KZ&month=4
{ direction, primaryMetric, secondaryMetric }
```

Implement authenticated reads for each MVP,validate metric provenance and choose de-duplication rules before replacing the mock. Demo admin is a local HTTP-only cookie,not real authentication. The localization summary is a deterministic two-sentence country template with rule-based keyword counts. `LLM_PROVIDER=mock` is the offline default; real providers are not implemented and do not require keys here.

See `docs/GLOBE_PLAN.md`, `docs/DECISIONS.md` and `docs/GLOBE_VERIFICATION.md` for implementation and test evidence.
