# School studio

For teachers, school admins and partner managers. Port 3004. Run `pnpm dev:portal`: 12 schools, 30 classes, 300 nickname-only students and four printable 45-minute lessons seed automatically.

60-second demo: Register school → leave consent unchecked → create class, see inactive code → Dashboard → confirm parental consent → open class → paste nickname CSV → try an email and inspect row-level error → import safe handles → Simulate activity → Reports, save a period-labelled current snapshot and download CSV → switch to partner-manager → update school status and add a non-personal note.

Mocked: all students, teachers, progress and school identities. Reports are snapshots of current demo progress labelled by period, not historical event reconstructions. Consent confirmation is a demo attestation, not proof of legal consent. Real integration needs authenticated school ownership, audited consent and a real platform adapter.

Print lesson kit or reports using Print. Checks: `pnpm test`, `pnpm --filter school-portal build`, `pnpm --filter school-portal smoke`.
