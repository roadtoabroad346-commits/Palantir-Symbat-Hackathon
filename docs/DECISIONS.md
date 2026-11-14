# Decisions

- Five Next.js App Router applications share accessible UI primitives, adapter and pure business rules; each has its own Prisma client and SQLite file. Builds run sequentially to limit memory usage.
- Local demo authentication uses an HTTP-only same-site cookie. Role checks protect mutations, but this is not production authentication.
- LLM_PROVIDER defaults to mock. Other provider selections return an actionable error until implemented; no keys or external services are needed.
- SQLite schemas use scalar foreign keys, transactions and application validation. Shared server code uses a structural Prisma delegate interface to reuse workflows across independent clients.
- Public text checks are conservative heuristics, not a guarantee of anonymization. They reject email, phone-like strings and obvious full-name patterns; use invented handles. No student contact or precise address fields exist.
- Challenge progress and judge results normalize to 0–100 before weights. Closed challenges retain frozen JSON rankings. Seasons retain immutable snapshots.
- Demo referral URLs resolve locally through /r/[code]; real links, sending, certificates and upstream platform are simulated.
- Prisma uses engineType=client and the official libSQL adapter for local SQLite. prisma.config.ts selects the JS schema engine. This avoids binary engine downloads blocked by the cloud allowlist; TLS and checksum verification remain enabled. Node 24 is the development baseline.
- Local SQL migrations are checked in per app and applied transactionally by Node's SQLite module. Prisma's JS schema engine stays configured for client generation; normal app runtime uses the official Prisma/libSQL adapter. Do not run db push against the migration-managed files.

- ECC test suites use serialized file execution because some core/regression tests intentionally exercise app demo databases. The five broader workflow suites use their own temporary databases. Do not launch duplicate mutating suites concurrently.
- Coverage gates apply to pure business logic and server modules; generated code and UI rendering are excluded explicitly. HTTP/browser checks cover selected actual user flows without adding a heavy E2E framework.

## Global Impact

- Added as sixth independent app on3006; Kenya is appended to shared country names to preserve existing indexes used by earlier seeded demos.
- The S-curve allocates monthly increments among active countries. This keeps every country's totals monotonic and the sum equal to global totals at every month,while respecting wave starts0/4/8.
- Capture denominators are illustrative demo targets; indices are not real market share. Configurable direction weights default equal.
- All geography is bundled world-atlas TopoJSON. react-globe.gl props are checked against the installed type declarations; no texture or tile URL is configured.
- Five screen-space marker offsets keep buttons separated at any globe zoom; geographic fan offsets are also tested. Shapes and letters supplement the prescribed palette.
- Simulation increments the selected and subsequent months to preserve global/country reconciliation and monotonic growth.
- Seeded feedback has original-language text and bilingual translations. New free-form feedback preserves original text with an explicit language note; no fake translation or external LLM request is performed. Mock insights use per-country templates and keyword counts.
- Presenter mode changes UI state only. Reduced motion disables auto rotation/remarks/arc animation; manual timeline play uses discrete steps. The fallback table contains the same country metrics.

- Initial globe camera positioning runs after React commits the library-ready state. The library readiness callback can precede forwarded-ref assignment; reduced motion otherwise leaves the default camera position unchanged.

- react-globe.gl constructor prop `animateIn` is explicitly false. The built-in introduction is independent of OrbitControls autoRotate and CSS reduced-motion rules; disabling it avoids unwanted motion and stale HTML marker visibility during initialization. Normal slow rotation remains separately controlled by user interaction and reduced motion.
