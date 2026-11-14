# V2 demonstration

```
pnpm install --frozen-lockfile
pnpm demo
```

Open http://127.0.0.1:3000 inside the cloud Desktop, or localhost:3000 on your own machine. Original six apps and the new founder studio appear. Every original app links to `/v2`. `pnpm dev:studio` starts only port 3007. For production bundles, build first and use `DEMO_PRODUCTION=1 pnpm demo`.

Profiles are fictional: NovaSolo, OrbitSchool, SignalTester, GuideTeacher, SchoolDelegate, ResearchGuide, MarketingGuide, PrototypeGuide, PilotPartner, AdultAmbassador, SupervisedIntern, FlowCoordinator, EvidenceReviewer and LocalDemoAdmin. Select a profile in each app; cookies are app-specific. Rights come from server assignments.

1. Portal: GuideTeacher creates an institution and draft memorandum. Advance reviews. LocalDemoAdmin independently confirms signature. Prepare cohort, enroll NovaSolo, confirm start. Sync.
2. Studio: NovaSolo starts an individual project with optional cohort affiliation, saves trial/research, mini brief/version and human checks. A participant with matching teacher screening submits an original response; record a negative result and change.
3. Studio: publish only permitted project fields with explicit consent. Sync. Marketing Lab: create and approve a campaign, open its actual volunteer form, preserve/deduplicate source, prepare a Reel storyboard and download the actual JSON editing package. Video render remains visibly unavailable.
4. Studio: EvidenceReviewer reviews ResearchGuide. ResearchGuide offers a service and opens a slot. NovaSolo adds capped demo credits, prepares brief, reserves/confirms/cancels. Future session completion ends with an action and follow-up; the automated suite advances only its isolated clock to exercise this.
5. League: submit evidence, review independently, submit and verify a metric. FlowCoordinator opens an individual prototype season; project enters; EvidenceReviewer scores criteria; close review and freeze. Legacy V1 history remains intact.
6. Evidence Room: sync and generate a labelled demo JSON/CSV/printable pack with period, source freshness, policy and snapshot references. Revoking project permission blocks downloads even before the event projection catches up, through the canonical permission API.

`pnpm smoke:v2` creates isolated databases and executes this cross-app story through actual production HTTP routes. `pnpm smoke:v2-browser` exercises the founder UI, drafts, persistence across server restart, mini-brief/check forms, RU/EN, keyboard, reduced motion and 320/375/390px layouts. It captures screenshots in work/browser-evidence, excluded from source control.

`pnpm demo:v2-seed` creates a separate idempotent presentation fixture. Existing START-001…START-020 codes and legacy fixtures remain.
