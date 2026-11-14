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
