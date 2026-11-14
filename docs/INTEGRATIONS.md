# Integration state

| Integration | Actual state | Available route |
|---|---|---|
| AI Startify / garage / internal dollar | not_connected; no verified contract or credentials supplied | existing offline adapter; explicit local actions; upstream activation/publication remain false |
| Real authentication | not_connected | HMAC local demo subjects only; production refuses demo auth |
| LLM recommendations | manual/template | source material and rule feedback; no invented externally verified facts |
| Video renderer | not_connected | real downloadable storyboard JSON; render job honestly failed |
| Publishing / messaging / advertising | not_connected | manual exports, reviewed recipient logs, manual reported post references |
| Payments / payouts | not_connected | capped demo service wallet, quota/booking/refund invariants |
| Document signing | manual authorized confirmation | independent scoped counterparty and source; no electronic signature provider |
| Code execution | not_connected | own prototype URL and human check log; no privileged code execution |
| Internal event transport | implemented local signed HTTP | durable outbox/inbox, bounded delivery retry and rebuild |

`integrationStatus` reports missing setting names and whether values are present, never credential values. Configured does not mean connected. `NotConnectedAdapter` fails with an explicit 503. Existing HttpAiStartifyClient remains a deliberate stub until an owner-confirmed upstream schema is supplied; no endpoints or real activations are guessed.

`V2_BUS_SECRET` must be 32+ characters for non-demo transport. `V2_DATABASE_PATH` is a per-process owner DB override used by isolated tests. `DEMO_PRODUCTION=1` explicitly enables a local demonstration of production bundles; do not treat that flag as a real identity provider. Provider capability contracts still require implementation and acceptance after credentials are supplied.
