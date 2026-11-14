# Global Impact implementation plan

- [x] Add independent Next app global-dashboard on3006; reuse shared privacy/countries and add Kenya.
- [x] Define direction/target config, Prisma models and deterministic13-month S-curve with normalized country totals.
- [x] Test calculations, wave activation, marker fan, filters and deterministic seeds before implementation (ECC).
- [x] Seed isolated SQLite and expose mock datasource/API; real HTTP datasource remains a clear stub.
- [x] Local world-atlas polygons and dynamically loaded react-globe.gl, five marker shapes, hover/camera/arcs/rings and WebGL fallback.
- [x] Bilingual accessible dashboard: KPIs, timeline, direction cards, drawer, feedback inbox/triage/create and insights CSV.
- [x] Presenter/keyboard controls and reduced motion behavior.
- [x] Build, lint, unit/API/browser tests, offline network check, README/demo and reusable environment update.

Parallel boundaries: data/backend agent owns app config/lib/prisma/seed/API/tests; globe agent owns components/Globe.tsx and globe-layer styles; root owns app scaffold, Dashboard and layout/styles. Public interfaces are documented in app/lib/types.ts by data agent. No existing MVP schema/database is changed.

Evidence and remaining integration limits: [GLOBE_VERIFICATION.md](GLOBE_VERIFICATION.md).
