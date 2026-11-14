# Implementation plan

- [x] Scaffold pnpm, strict TypeScript, Next App Router and shared package.
- [x] Shared adapter, privacy, scoring, deterministic generators, bilingual strings; unit tests.
- [x] Growth: Prisma schema → deterministic seed → logic/tests → UI → demo README → smoke; build and commit.
- [x] Ambassadors: same sequence; build and commit.
- [x] Challenges: same sequence; build and commit.
- [x] School portal: same sequence; build and commit.
- [x] School league: same sequence; build and commit.
- [x] Final build, lint, tests, five service smoke checks, documentation and reusable environment instructions.

Each application has its own SQLite database and port. Runtime writes use Prisma. Public text is checked before persistence. All platform data is simulated; no live integration or delivery.

ECC was applied after the initial four apps: independent review, RED/GREEN regression checkpoints, modular domain services, real SQLite workflow tests, coverage gates and native Chromium smoke. See VERIFICATION.md.
