# Implementation plan

- [ ] Scaffold pnpm, strict TypeScript, Next App Router and shared package.
- [ ] Shared adapter, privacy, scoring, deterministic generators, bilingual strings; unit tests.
- [ ] Growth: Prisma schema → deterministic seed → logic/tests → UI → demo README → smoke; build and commit.
- [ ] Ambassadors: same sequence; build and commit.
- [ ] Challenges: same sequence; build and commit.
- [ ] School portal: same sequence; build and commit.
- [ ] School league: same sequence; build and commit.
- [ ] Final build, lint, tests, five service smoke checks, documentation and reusable environment instructions.

Each application has its own SQLite database and port. Runtime writes use Prisma. Public text is checked before persistence. All platform data is simulated; no live integration or delivery.
