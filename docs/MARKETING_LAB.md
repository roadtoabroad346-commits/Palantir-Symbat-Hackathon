# Marketing Lab

Open growth-engine `/v2`. Existing campaign/referral/compliance routes remain available.

The new campaign records project link, audience/stage context, country/language, goal, supported advantages, limitations, CTA, channels, recipient policy, daily/spend limits, approval version and pause state. Paid student/minor campaigns remain blocked. Actual spending remains zero until a payment/advertising provider is connected.

The public landing page saves voluntary nickname-only applications. A campaign-scoped opaque visitor cookie retains eligible source for 30 days; direct visits do not erase it. Repeated submissions with the same visitor token are deduplicated. This is pseudonymous local attribution, not anonymous tracking or verified upstream activation.

Discovery validates public HTTP(S) URLs and standard ports, rejects private/loopback/metadata addresses, validates every redirect DNS resolution and pins the checked address when connecting. Timeouts, content types and a 512,000-byte cap apply. Source text is stored as untrusted evidence and cannot change permissions. Failed fetch jobs retain an error and no invented prospect. Reviewed source records can be merged with retained source history. Bulk unattended crawling, universal parsing and CAPTCHA bypass are not implemented.

Lead states: prospect → researched → fit_reviewed → outreach_prepared → contacted → responded → interested → qualified → scheduled → completed → outcome, plus not_fit/opted_out/duplicate/archived. Interest needs actual response evidence. Manual contact logs require a reviewed recipient and active approved campaign; there is no messaging adapter or automatic sending. Opt-out is terminal. Small samples show insufficient data instead of a fabricated A/B winner.

Content plans cover configurable 7–30 day horizons. Reels 9:16 has hook, script, shots, on-screen text, subtitles, cover, caption, CTA and tracked link, plus rights. Editing resets approval. The local export creates a real authorized JSON storyboard package with an artifact download and hash. It is not MP4. Video-render requests create an honest failed/not-connected job; no phantom video is shown. Automatic publishing is unavailable. Manual publication requires current approval and an actual reference/URL, is explicitly self-reported, and deduplicates externalPostId. Metrics retain manual/source provenance.

Remaining advanced scope: provider-backed media jobs, automatic scheduled publication, actual platform reach/video retention, automated budget execution, broad CSV/crawler orchestration and crash recovery for running discovery jobs require additional implementation/provider contracts. These are not silently represented as connected functionality.
