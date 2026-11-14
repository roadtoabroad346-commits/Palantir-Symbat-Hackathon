# Ambassador network

For ambassadors aged 18+ and program admins. Port 3002. Run `pnpm dev:ambassador` from root; SQLite automatically seeds 20 ambassadors, 12 tasks, eight rewards and pending submissions.

60-second demo: Join → confirm 18+ and conduct → Dashboard → copy referral link → choose ambassador role → simulate → Tasks → submit public proof → choose admin → approve → return to dashboard and see Silver → choose ambassador → redeem a reward. Simulating 20+ registrations quickly flags the burst and pauses points until admin review. The demo uses amb-0 by default.

Mocked: registrations, referral delivery and rewards. Points and approvals persist locally in an append-only ledger; no real contacts collected or rewards shipped. Real integration needs an authenticated platform adapter, webhook verification, authenticated adult enrollment and actual fulfillment.

Checks: `pnpm test`, `pnpm --filter ambassador-platform build`, `pnpm --filter ambassador-platform smoke`.
