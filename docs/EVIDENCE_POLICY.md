# Evidence and export policy

Verification states: self_reported, pending, verified, rejected, revoked. Verification method and actual reviewer are separate from the claim. A URL is not automatically true. First-party evidence must refer to an event actually present for the project. Authenticated upstream source/method claims are blocked while AI Startify is not connected.

Evidence includes publication consent and sensitivity. Sensitive material is never put into the public export projection. Project publication has separate consent; revocation emits a new version, while frozen audit history remains intact.

Evidence packs contain generatedAt, reporting period, mode, policy version, snapshot IDs, definitions, source references/watermarks, metrics, cases, workload/resources, pilot plan, limitations and integrity SHA-256. A demo pack requires explicit acknowledgment and is labelled DEMO in its title and content. JSON and CSV are real downloads; printable HTML supports the browser's Print to PDF. There is no claim of a server-generated PDF or an official signature/QR.

The verification link resolves to `/api/v2/evidence-packs/<id>`. Exports validate stored integrity, project permission and evidence status. HTTP downloads additionally check the canonical source APIs; unavailable or revoked sources stop the export. Hashes prove stored integrity, not truth of the underlying human reports.

Original language is retained. RU/EN UI text is authored manually; no fake automated translations, partner endorsements, testimonials or national results are generated.
