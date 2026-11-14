# Verification evidence

Executed in the managed cloud workspace on 14 November 2026, Node 24.22.1, pnpm 11.25.0, Next.js 16.4.6, Prisma 6.19.3, local SQLite via the official libSQL adapter.

## Verified gates

- Frozen-lockfile installation completed without changing dependency resolution. Prisma binary TLS/checksum verification was not disabled. The supported JS schema engine is selected instead of external native engine downloads.
- `pnpm build`: five production builds completed, each with strict TypeScript compilation.
- `pnpm lint`: ESLint and all five standalone typechecks passed.
- `pnpm test:coverage`: **89/89 tests across 16 files passed**. Business logic and server modules: **99.27% statements/lines, 97.79% branches, 100% functions**. All configured coverage thresholds exceed 80%.
- Pure calculations, adapter behavior and privacy rules are unit-tested. Five workflow suites apply the actual checked-in SQL migrations to temporary SQLite files, seed real Prisma clients and exercise all domain service routes and mutations. Workflow databases are removed after the run. Existing regression/core tests preserve their own fixtures in the development databases.
- No hardcoded API-key/private-key patterns found in source. Review inspected role checks, Origin checks, safe React rendering, parameterized Prisma writes, consent gates, mandatory PII/age rules and append-only transactional points. This is a focused code review, not a claim of a complete production security audit.
- `pnpm dev:all`: all five development services returned their correct domain state and main page with HTTP 200. Services were stopped after verification.
- `pnpm db:prepare`: repeated migrations and seed preparation completed successfully without resetting existing databases.
- `git diff --check`: passed.

Coverage explicitly excludes React rendering, CSS, generated Prisma code and Next route wrappers. Those layers are covered by route smoke tests and selected real-browser flows; no 100% UI coverage is claimed.

## HTTP and browser checks

The per-app smoke scripts boot the production service and test all main paths, namespace isolation of role cookies, authenticated simulation changes and CSV content. Routes exercised: Growth 5, Ambassadors 6, Challenges 6, Portal 6, League 5 (28 in total).

Native CDP against installed Chromium tests a real campaign form submission, resulting campaign route and three message variants. It tests Russian/English and theme switching, a 390px viewport without horizontal overflow, and a real PNG download with validated binary signature and **1200×760** dimensions. No external browser testing framework is installed. The script cleans its own service/browser processes and temporary profile/download files. It leaves one clearly named fictional campaign in the demo DB.

## ECC test-first evidence

ECC was requested after the first four MVPs had been implemented. No claim is made that earlier code was originally written under ECC's RED/GREEN process. Sources used: [TDD workflow](https://github.com/affaan-m/ecc/blob/main/skills/tdd-workflow/SKILL.md), [verification loop](https://github.com/affaan-m/ecc/blob/main/skills/verification-loop/SKILL.md) and coding standards. Independent agents reviewed correctness, wrote edge/regression tests, modularized domain services and ran browser validation.

| Guarantee                                                                              | RED evidence                                                                                                                  | GREEN evidence                                                          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Publishing adds league points, freezing blocks changes, rollover retains old snapshots | League test executed and failed `Unknown action`; checkpoint `91496df`                                                        | Same test passed after implementation; `b60f449`                        |
| Resolved fraud no longer blocks future legitimate points                               | Regression expected balance 1, received 0; `10f0569`                                                                          | Same test passed after a review-boundary ledger entry; `b60f449`        |
| Direct class URL shows its owning school's totals/navigation                           | Regression received school-0 for a newly created school; `10f0569`                                                            | Same test passed after resolving the class's school; `b60f449`          |
| Challenge simulation preserves published projects                                      | Executed regression received 0 after a prior published count of 1; test recorded in `b60f449`, RED stage checkpoint `2866eb1` | Same regression passed with restored published member stages; `6487c83` |
| Team members require nonempty handles and opaque references                            | Six executed failing cases; `2866eb1`                                                                                         | All six passed; `6487c83`                                               |

The league test fixture was corrected to use a school code supported by the mock contract. Its earlier arbitrary test code produced `Invalid school code`, which was a fixture issue rather than an implementation regression.

## Limits

All upstream platform behavior, LLM copy, outreach, certificates and passport IDs remain mocked. Reports are saved current-progress snapshots labelled by month, not event-history accounting. Demo roles intentionally do not authenticate people. Public deployment/real integration and validation after publishing a new cloud snapshot have not been performed. Optional A/B allocation, real sending, cross-country matchmaking and embeddable widgets are outside the implemented vertical slices.

Environment install/start instructions were saved as a configuration draft. Saving does not publish or prove restoration in a fresh task. Review and save the environment settings, then publish through the product when desired.
