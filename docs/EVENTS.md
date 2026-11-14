# Events and delivery

Envelope: `eventId, schemaVersion=2, type, occurredAt, producer, subjectRef, entityRef, institutionRef?, cohortRef?, correlationId, causationId?, dataMode, verification, sequence, payload`.

Only known producer/type pairs and permitted projection fields are accepted. Unknown schemas, fields, modes, invalid scores and wrong producers fail validation. Requests have a five-minute HMAC signature window. Configure `V2_BUS_SECRET` with at least 32 characters for a non-demo transport. The built-in local demo transport credential is never a production credential.

A critical command commits aggregate changes, ledger/hold changes, outbox and idempotency response in one SQLite transaction. Each target has a delivery row. A flush handles up to 60 pending messages in bounded groups of 10 with four-second HTTP deadlines. Failures keep attempts and lastError; delivery is at least once. Inbox uniqueness prevents repeat effects; per-producer/entity sequence suppresses older projections. Projection rebuild only reads the inbox and writes projection rows. It creates no money, awards or registrations.

`pnpm demo` retries local outboxes every five seconds. The workspace Sync button retries its own outbox. `node scripts/v2-relay.mjs` performs one all-app cycle. Offline apps remain pending; the UI exposes source timestamps/missing sources. There is no automatic external marketing send.

Canonical public export permission checks are signed internal APIs. JSON/CSV/print exports fail with 410 after canonical revocation and 503 if current permission cannot be checked. Cached projections alone are insufficient for HTTP export permission.

Events currently include identity.registered, project.updated/project.revoked, team.updated, institution/cohort/representative.updated, evidence/metric/ranking.updated, campaign.updated, lead.qualified, commitment.updated and contribution.verified. Local action records and audit contain additional lifecycle history. Existing PlatformEvent and V1 simulations are unchanged and never silently promoted into authenticated real facts.
