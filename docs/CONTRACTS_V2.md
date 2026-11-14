# V2 contracts

All existing V1 routes remain. New routes live under `/api/v2`, workspaces under `/v2`.

- Canonical owner: portal institutions/cohorts; founder-studio identity/projects/learning/research/expert economy; growth campaigns/content/leads; challenges entrants/commitments; league metric verification/ranking; dashboard country/evidence read models.
- Stable opaque UUID IDs; legacy identity mapping is explicit, deterministic and scoped by producer/entity type. Names/email are never identity keys.
- `dataMode`: demo/pilot/production. External facts carry self_reported/pending/verified/rejected/revoked with method and reviewer. Every local seed is demo.
- HTTP: structured `{error:{code,message},requestId}` errors, ISO UTC, bounded lists and bodies, same-origin mutation guard, server scope checks. Critical POSTs require Idempotency-Key; same key/different payload conflicts.
- Local demo identity selection cannot assign arbitrary roles. Session binds a catalog subject; assignments come from server records. Production refuses demo sessions and V1 demo routes. Production identity is not connected without an actual provider.
- Events: persistent outbox/inbox, per-producer entity sequence, at-least-once retry, explicit target delivery receipts. Projection ignores older versions and duplicate eventIds. Rebuilds do not write wallets or registrations.
- V2 tables are additive to each owner app database; never open another app database. V1 Prisma/libSQL workflows remain. Small synchronous node:sqlite transaction boundary is used for V2 atomic holds, idempotency and outbox; this is the same SQLite file/checked-in SQL migration mechanism, not an additional database service.
- Rollback: stop V2 writers, restore prior code; leave additive tables intact. Take consistent SQLite backup for rollback of data; no automatic destructive down migration.
- Credentials and real upstream schemas are not supplied: adapters return not_connected, not fabricated success.

Detailed endpoints, domain schemas and permissions are documented with implementation below.

## Implemented HTTP surface

| Method / endpoint | Contract |
|---|---|
| GET /api/v2/health | app identity, schema version, mode/auth/upstream status |
| GET /api/v2/state?section=&selected= | scoped bilingual workspace DTO; no arbitrary private record fetch |
| GET /api/v2/records/:kind?limit=1..100&offset=0.. | bounded authorized list |
| GET /api/v2/records/:kind/:id | authorized record lookup |
| POST /api/v2/identity | founder-only local demo registration; Idempotency-Key required |
| POST /api/v2/session | subjectId from demo catalog; signed app-scoped cookie; no client roles |
| POST /api/v2/logout | clear app session |
| POST /api/v2/actions/:operation | validated domain command; Idempotency-Key 8–160 characters |
| POST /api/v2/sync | retry owner-app outbox under current actor rights |
| POST /api/v2/rebuild | platform admin only; no monetary/registration effects |
| POST /api/v2/events | signed, schema-validated event ingestion |
| POST /api/v2/relay | signed bounded local outbox cycle |
| POST /api/v2/consent-check | signed canonical founder permission check |
| POST /api/v2/verification-check | signed canonical evidence verification/permission check |
| GET/POST /api/v2/landing/:campaignId | approved campaign volunteer form and deduplicated inbound application |
| GET /api/v2/artifacts/:id | authorized actual storyboard file |
| GET /api/v2/evidence-packs/:id?format=json,csv,html | integrity/consent/verification guarded export; canonical source online required |
| GET /api/v2/countries | separate explicitly labelled country projection; original globe unchanged |

Domain operations are grouped in learning.ts, institutions.ts, economy.ts, marketing.ts, rankings.ts and community.ts. The workspace's forms are the supported local command catalog. Unknown operations return structured 404 errors. Request bodies are bounded (64 KiB; event envelope 256 KiB), mutation origin is required, event calls use HMAC instead. Each JSON response has requestId; critical commands conflict on reused key/different input. Dates are ISO UTC; money/credits are integer minor units.
