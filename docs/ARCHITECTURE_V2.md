# Architecture V2

The original six Next 16.4.6 applications, Prisma 6.19.3/libSQL clients, SQLite files, launchers and V1 endpoints are retained. `founder-studio` adds port 3007. Every app exposes `/v2` and `/api/v2/[...path]`. The demo hub remains on 3000.

Canonical ownership:

| Owner | Domain |
|---|---|
| founder-studio | canonical new profiles, projects, optional teams, learning, prototypes, SIGNAL, experts, bookings and service-credit economy |
| school-portal | institutions, representatives, agreements, document revisions, cohorts and institutional reports |
| growth-engine | Marketing Lab campaigns, sources/prospects, leads, storyboards, artifacts and publication records |
| school-league | evidence review, metric observations, versioned policies, entries, delegations, evaluations, snapshots and appeals |
| global-dashboard | country projections, source freshness and evidence-pack exports; original offline globe is separate |
| ambassador-platform | mapping to existing adult ambassadors, confirmed contributions in the existing PointsLedger, supervised internship tasks |
| challenge-platform | individual/project/team entrants, finite opportunities, commitments and continuation |

`packages/shared/src/v2` contains separate domain modules, a scoped application service, HTTP boundary and shared bilingual workspace. It is not a replacement for V1 `server.ts` or the legacy UI. Original screens link to V2. V2 module navigation uses the same viewer hostname and each application's port.

## Storage

Checked-in `002_growth_hub_v2.sql` is additive and identical in all seven apps. `v2_record` stores bounded workflow aggregates with normalized immutable identity/ownership/mode, scope, visibility, revision and timestamps. Structured children belong to the responsible aggregate or their own lifecycle record; clients cannot write arbitrary kinds or JSON directly. Domain handlers validate each operation before storage.

Separate relational tables enforce idempotency, identity mapping, event delivery, inbox/projection sequence, monetary ledger and holds. The original Prisma/libSQL runtime and generation workflow remain intact. V2 uses Node 24's synchronous SQLite driver for short `BEGIN IMMEDIATE` transaction boundaries. This deliberate tradeoff provides atomic last-seat/credit/hold/outbox/idempotency operations across processes without changing existing clients or adding a database service. It is intended for this local single-machine release, not a claim of horizontal cloud scalability.

An application opens only its own database. Cross-app exchanges use signed versioned HTTP, never foreign database paths. Outbox messages can arrive repeatedly or out of order. Public exports also ask the canonical founder/evidence sources for current permission; a missing source fails closed.

## Security and modes

New sessions bind a server-side subject, with HMAC signatures using a key in the owning DB. Roles are loaded from server assignments and expire by scope. A new registration receives only founder rights. Demo sessions can only access demo records. Normal production builds reject demo session issuance/usage and legacy demo endpoints; `DEMO_PRODUCTION=1` is an explicit local demonstration of a production build and never creates pilot/production identities.

Real authentication and external provider contracts remain not connected. Schema support for pilot/production must not be confused with a production-ready identity system.
