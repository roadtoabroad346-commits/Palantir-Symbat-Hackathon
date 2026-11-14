# Growth engine

For growth managers and viewers. Russian/English campaigns, local referrals, privacy checks and acquisition analytics. Port 3001.

Run from root: `pnpm install`, then `pnpm dev:growth`. Database creates and deterministically seeds on first launch. `pnpm --filter growth-engine db:seed` is safe to repeat. Select growth-manager in the role menu to edit.

60-second demo: open New campaign → Uzbekistan, parent, instagram, ru, friendly, $100, minimum age 18 → create three variants → open/copy referral link → simulate activity → Analytics → CSV. Try a paid student audience or age 16: submission is blocked with the reason. Search campaign tables by country, channel or status.

Mocked: AI copy, platform events, referrals and all metrics. Links record local visits; no messages or ads are sent. Real integration: implement HttpAiStartifyClient, replace the injected adapter and authenticate event ingestion. Production authentication and verified webhooks are required before deployment.

Checks: `pnpm test`; `pnpm --filter growth-engine build`; `pnpm --filter growth-engine smoke`.
