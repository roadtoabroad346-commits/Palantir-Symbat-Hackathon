# Startup challenges

For students, teachers, judges and admins. Port 3003. `pnpm dev:challenge` creates three challenges, 18 teams across eight mock schools, three judges and progress history.

60-second demo: open challenge-0 → create a team with START-001 and two nickname,country rows (Nova77,KZ and Orbit88,UZ) → see cross-border badge → choose teacher and simulate → choose judge and score the rubric → leaderboard recalculates → choose admin and close → Showcase. Closed rankings are frozen snapshots; later simulation skips closed challenges.

Mocked: platform progress, school validation, identities, badges and showcase entries. Real integration: replace the AiStartifyClient injection, authenticate teachers/judges, verify progress event provenance and retain an audited results publication process.

Checks: `pnpm test`, `pnpm --filter challenge-platform build`, `pnpm --filter challenge-platform smoke`. Pure scoring, rubric, badges and ordering are tested in shared; persistence and frozen results are tested here.
