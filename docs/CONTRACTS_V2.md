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
