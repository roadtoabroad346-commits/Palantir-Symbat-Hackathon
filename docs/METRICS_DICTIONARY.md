# Metrics dictionary

Every V2 observation records a definition key, value, unit, period start/end in UTC, project/institution/country, source type/reference, evidence ID, verification state, reviewer and revision, visibility and data mode. New observations are self_reported. Reviewer confirmation is separate. AI cannot verify an external fact.

| Metric | Meaning / constraints |
|---|---|
| interviews, tests, pilots | Individually documented actions in the stated period; source required |
| applications | Voluntary saved form responses, deduplicated by opaque visitor per campaign |
| qualified_applications | Reviewed audience fit and actual response evidence; prospect is not interest |
| users / customers | Different declared definitions; views and clicks are neither |
| projects_created / projects_checked / projects_published | Distinct states; local public card is not verified upstream publication |
| revenue / expenses | Nonnegative finite amount, ISO currency, unit and period; virtual credits are not revenue |
| conversion | Value = 100*numerator/denominator, denominator > 0, 0 <= numerator <= denominator |
| program_completion | Evidence-backed completion under the published program criteria; unique owner counted once |
| W2 retention | Meaningful action in [7,14) days after first local activation among participants whose full window matured |

Period and cumulative values are separate. Negative or nonfinite input, reversed periods and financial values without currency are rejected. Corrections create a new observation, preserving the old value and its successor link; superseded records do not enter a fresh evidence export. Revoked evidence invalidates dependent verified metrics.

Country projection separates unique projects, unique locally activated founders, authenticated upstream activation and authenticated upstream publications. The last two remain zero in the fictional demo and are not evidence of real results. Missing sources are explicitly incomplete coverage. 100,000 participants and 10,000 publications remain targets, not achieved facts.
