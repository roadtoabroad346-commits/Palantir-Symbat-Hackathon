# Demo entry point

- Add pnpm demo: one launcher, hub on3000, readiness checks and owned-process cleanup.
- Hub provides six clearly labelled demos, opens each in a full-window iframe and sets the app's demo role so no sign-in is needed.
- Reuse healthy services; never kill or replace an unknown process occupying a port. App identity is checked before a service is reused.
- Show actual readiness, short test instructions, loading/retry states and an obvious Globe entry. Use the current hostname for app ports.
- Verify launcher logic, real hub APIs and browser navigation across all six apps. Document one-command startup and cloud access limits.

The hub is one entry page. App frames still use local ports3001–3006; it is not an external single-port proxy or a deployment. Prefix proxying without Next basePath would break existing absolute paths and is deliberately not used.
