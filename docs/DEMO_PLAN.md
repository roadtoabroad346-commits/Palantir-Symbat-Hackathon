# Demo entry point

- [x] Add pnpm demo: one launcher, hub on3000, readiness checks and owned-process cleanup.
- [x] Hub provides six clearly labelled demos, opens each in a full-window iframe and sets the app's demo role so no sign-in is needed.
- [x] Reuse healthy services; never kill or replace an unknown process occupying a port. App identity is checked before a service is reused.
- [x] Show actual readiness, short test instructions, loading/retry states and an obvious Globe entry. Use the current hostname for app ports.
- [x] Verify launcher logic, real hub APIs and browser navigation across all six apps. Document one-command startup and cloud access limits.

The hub is one entry page. App frames still use local ports3001–3006; it is not an external single-port proxy or a deployment. Prefix proxying without Next basePath would break existing absolute paths and is deliberately not used.

## Verification

- ECC RED: three demo discovery/identity/URL tests failed against stubs; checkpoint74c1c7f. GREEN: all pass after implementation; an additional real busy-port test verifies nonzero exit and preserves the occupying service.
- Root test suite:105/105tests passed. Root lint and all6app typechecks passed. Node syntax checks passed for launcher/helper/client; Bash syntax check applies to the macOS shortcut.
- Actual launch: all6domain APIs report ready. HTTP verified shared browser helper module,foreign-Origin rejection and invalidapp404.
- Actual Chromium: six ready cards; embedded globe WebGL and markers; automatic globe admin and five app roles; real child language interactions; internal navigation; parentURL hash; Backhome; ENcopy;390px page/viewer with nooverflow; no uncaught browserJavaScript errors. Script:scripts/demo-browser-smoke.mjs. Existing apps remain running; the browser script cleans only its own Chromium.
- Initial browser regression found Next16blocking iframe dev resources. Installed official allowedDevOrigins documentation was read; only localhost and127.0.0.1 were added in six configs. Restarted developer services then passed actual client interactivity checks.
- Desktop shortcuts are supplied for Windows/macOS. Windows execution was not tested on this Linux host; pnpm demo and the actual browser flow were exercised here.
- Source-only archive includes tracked project files,not node_modules,build caches,SQLite demo state,Git metadata or local secrets. First install needs package registry access.
