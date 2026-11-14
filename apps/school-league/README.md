# School league

For visitors, nickname-only founders and teachers. Port 3005. `pnpm dev:league` creates 20 schools, 400 students and a season with reproducible project standings.

60-second demo: league → Join with START-001 (try an invalid code first) → select student role → Founder card → enter an invented nickname, lowercase project title and one-line idea → publish → school points increase by 11 (one started + one published) → Download PNG → open school profile → select teacher → Admin → freeze → start a new season. Old snapshots stay in school history; the new season begins at zero.

Mocked: all platform progress, school validation, passport IDs and decorative QR. The QR explicitly does not verify a certificate. PNG renders locally with Canvas and exports allowed card fields; no remote images or fonts. No real platform connection or social posting.

Real integration: inject an authenticated AiStartifyClient, verify publication events, link real school ownership and provide a certificate-verification endpoint. Demo students can publish multiple fictional projects; production needs identity-linked anti-abuse rules.

Checks: `pnpm test`, `pnpm --filter school-league build`, `pnpm --filter school-league smoke`.
