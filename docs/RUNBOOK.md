# Runbook

Requirements: Node >=24 <25, pnpm 11.25.0, current checked-in lockfile. Installed versions: Next 16.4.6, React 19, Prisma 6.19.3.

```
pnpm install --frozen-lockfile
pnpm db:prepare
pnpm demo
```

Use the original Windows/macOS launchers or the commands above. V2 is on `/v2` in every app; founder-studio uses 3007. Stop with Ctrl-C. Existing data survives restart/repeated preparation. No keys are required for local demo.

For bounded verification, stop conflicting servers first and run sequentially:

```
pnpm test
pnpm test:coverage
pnpm lint
pnpm build
pnpm smoke
pnpm smoke:browser
pnpm smoke:globe-browser
pnpm smoke:v2
pnpm smoke:v2-browser
git diff --check
```

Builds are sequential. Legacy suites intentionally touch demo fixtures, so do not run those suites together. V2 suites/HTTP/browser tests use isolated DBs. Browser scripts require /usr/bin/chromium or CHROMIUM_PATH. V2 browser CDP uses 9223; original browser suites use their existing managed test ports.

Debug unavailable cross-app sources: start their owning apps, inspect `/api/v2/health`, then Sync or `node scripts/v2-relay.mjs`. Failed deliveries remain in `v2_delivery`; do not delete them to make status green. Read models show timestamps/missing sources. Public proof exports fail closed if canonical permission services are offline.

Normal production refuses local demo sessions and legacy demo cookies. A real public pilot needs an actual identity provider, verified scope provisioning and approved provider contracts. The code intentionally returns unavailable where these are missing; setting environment strings alone does not complete those integrations.

See STATUS, ACCEPTANCE and VERIFICATION_V2 for evidence and remaining scope. Local 127.0.0.1 links are machine-local and are not a published website.
