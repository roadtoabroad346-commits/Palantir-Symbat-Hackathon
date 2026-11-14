# Global Impact verification

Verified in the managed workspace on 14 November 2026 with Node24.22.1, pnpm11.25.0, Next16.4.6, Prisma6.19.3 and installed Chromium. The application is an independent sixth MVP, not a live connection to the other five databases.

## Results

- Frozen-lockfile **offline** installation succeeded from the populated package cache. First dependency acquisition requires package registry access; the application itself requires no external runtime network.
- Root `pnpm build`: all **six production builds passed**. Global Impact also rebuilt after the final legend highlight adjustment.
- `pnpm lint`: ESLint and strict TypeScript checks passed for all six applications.
- `pnpm test:coverage`: **101/101 tests passed in19files**. Configured business/server scope: **98.76% statements/lines,96.33% branches,97.32% functions**. New dashboard logic/data sources alone:96.51% lines,87.31% branches,88% functions. Configured aggregate thresholds are80%.
- Renderer and geography helpers are unit-tested. Actual Prisma/SQLite tests use a temporary file and the checked-in migration, proving idempotent deterministic seed,simulation reconciliation,PII rejection,votes and admin triage.
- `pnpm --filter global-dashboard smoke`: real production HTTP checks passed for seeded13-month data,10countries,5directions,exact country/global sums,simulation pulses,public text validation,upvotes,admin-only status changes,Origin rejection and insights CSV.
- Native Chromium/CDP checks passed actual WebGL rendering,five distinct marker shapes,wave marker counts15/35/50 at months0/4/8,month12,country drawer and Hindi insights,layer toggles and table access.
- Browser checks submitted safe and unsafe feedback,verified immediate globe remarks after submission from table view,pause/close and stable remarks after hover,language/theme switching,presenter P/Escape and P-to-exit pausing the timeline.
- At390px the page has no horizontal overflow. Reduced motion disables automatic remarks; the timeline remains usable after taking the browser offline. A separate no-WebGL context retains all10countries in its fallback table.
- Browser network monitoring found **no external runtime requests**, and the passing run recorded no JavaScript console errors.
- `pnpm dev:globe` booted with existing seeded data; the main page returned200 and the data endpoint returned10countries,13months and650metric rows. The development service was stopped after verification.
- `git diff --check` passed. Focused review checked public text guards,safe DOM textContent,parameterized Prisma writes,transactional simulation and admin cookie enforcement. This is not a production security certification.

Coverage excludes React rendering,Next route wrappers,generated Prisma clients and CSS. Those layers receive the HTTP/browser checks above; no claim is made of complete UI code coverage. The optional browser script needs locally installed Chromium and uses native CDP,no E2E framework.

## ECC evidence

The user's instruction to use ECC and subagents continued from the previous task. Specialized agents implemented data/backend,renderer and browser checks; the root agent integrated,reviewed and completed the remaining work. Sources: [TDD workflow](https://github.com/affaan-m/ecc/blob/main/skills/tdd-workflow/SKILL.md) and [verification loop](https://github.com/affaan-m/ecc/blob/main/skills/verification-loop/SKILL.md).

- Calculation/seed tests executed RED against missing implementations,then passed GREEN. Screen-space marker tests similarly failed their intentional stub before implementation. Checkpoint:e0ff349.
- Browser regression executed RED: P exit left the timeline's pause glyph `Ⅱ` instead of stopped `▶`. Checkpoint:7b950a7. The same browser scenario passed after the controller fix.
- Review also corrected new-comment submission from table view,hover-resume remark replacement and country fill opacity to retain the same five-direction overall index as the drawer. Presenter legend highlights the selected direction. Shared country names and expansion-wave metadata are reused by the dashboard,including Kenya in wave2; the shared i18n helper supplies RU/EN selection.
- A reduced-motion browser regression reproduced35 visible markers after selecting month8 even though the layer contained50. Inspection of the installed library found its separate constructor `animateIn` rotation/scale tweens and cached HTML visibility calculations. The built-in introduction is now disabled,and initial camera positioning occurs after the ready render commits. The focused reduced-motion/offline regression passed after this correction. Checkpoint:dc88556.
- Existing shared country tests initially exposed their fixed nine-country assumption. They now explicitly require ten countries including Kenya and preserve all previous translation checks.

Commands/scripts: `pnpm test:coverage`, `pnpm lint`, `pnpm build`, `pnpm --filter global-dashboard smoke`, `pnpm smoke:globe-browser`. Screenshots of actual WebGL were inspected from the passing browser run.

## Reproducibility and limits

The seed starts at4,000users/567projects and ends at100,000users/10,000projects. Simulation intentionally changes these snapshots and all subsequent months; exact baseline endpoints are tested on fresh isolated seeds. Workflow smoke tests leave clearly fictional feedback and simulated activity in the development database. Repeating seed does not erase those changes.

All metrics,target denominators,school growth and comments are fictional. Capture is a demo index,not measured market share. Seed comments have stored local originals and RU/EN translations. New arbitrary text preserves the original with a clear language note when a translation is unavailable. Localization summaries are deterministic templates with keyword counts; real LLM and HTTP metrics integrations remain unimplemented.

Reusable installation/start instructions were saved to the environment draft. They do not publish a snapshot or prove restoration in a new task. Real deployment,live upstream integration and production authentication were not performed.
