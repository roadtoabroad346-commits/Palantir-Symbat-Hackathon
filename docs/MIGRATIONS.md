# Migrations and preservation

No V1 table is dropped, renamed, truncated or reset. Each app adds checked-in `002_growth_hub_v2.sql`. `scripts/migrate.mjs` records each migration and applies it transactionally; repeat preparation skips already applied SQL. Prisma `db push` is not used. TLS/checksum verification and the configured JS schema engine remain intact.

V2 seed creates a separate versioned fictional identity catalog once and imports a canonical workflow view of existing portal schools with retained legacy IDs. It does not turn old mock registrations into real activations, import private contacts or overwrite user's existing V2 records. Subsequent `db:prepare` preserves saved data and signing keys.

Snapshot preservation proof covers original league points and frozen seasons, original challenge frozenJson regression, ambassador append-only ledger behavior, consent gates and report snapshots. V2 suites use temporary files; two independent processes compete against one temporary SQLite file in the last-seat test. Legacy mutation suites remain serialized.

For rollback, stop V2 writers/relay, return to previous code and retain the additive tables for forward recovery. Take a consistent SQLite backup (`VACUUM INTO` or backup API) before a real migration. Restoring a DB snapshot restores signing keys and invalidates sessions issued after it. No destructive down migration is included. Schema support for real data is not approval to deploy a demo auth system.
