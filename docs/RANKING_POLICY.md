# Ranking policy — project-v2.0

This is an initial organizer-controlled pilot policy, not a scientifically validated index. The organizer declares eligibility, category, country/stage and period before opening registration. Individual/team categories are separate. Reviewers cannot score their own project and must declare no conflict.

| Criterion | Weight | 0 | 1 | 2 | 3 | 4 |
|---|---:|---|---|---|---|---|
| Problem / research | 20% | absent | assumption only | specific audience and preliminary material | relevant observations and limitations | traceable research supporting a precise problem |
| Prototype function | 25% | absent | visual concept | main path works with gaps | main path, data and errors checked | reproducible main/empty/invalid/save/reopen/failure/recovery checks |
| User testing | 25% | absent | proposed test | relevant preliminary responses | traceable tasks and original responses | relevant screening, reproducible observations and explicit limits |
| Change / learning | 20% | absent | unsupported change | reason linked to observation | documented before/after and retest | evidence-led iteration including unexpected or negative results |
| Next action | 10% | absent | vague intent | concrete manageable action | owner, due date and resources | feasible agreed action with confirmation and follow-up |

`score = sum(weight_i * rating_i / 4)`, ratings are integers 0–4, result 0–100. No intermediate rounding. Latest evaluation per reviewer is retained for calculation; all original evaluation rows remain. Multiple reviewers use the arithmetic mean of their unrounded scores. Evidence must be independently verified. Credits, money and likes are absent from the formula. Official primary-institution credit requires a canonical portal cohort enrollment matching the project owner and institution. A self-declared affiliation remains metadata; it does not block individual participation or become institutional credit.

Competition ranks: 1,1,3 for tied scores. ID sorting orders display only and never changes tied rank. Empty evidence means insufficient data, not a failing zero.

Institution pilot policy: `0.60 * average eligible ProjectScore + 0.25 * CompletionRatePercent + 0.15 * W2RetentionPercent`. Complete institutional ranking requires at least three eligible projects and ten participants plus a matured W2 denominator. Otherwise show sample sizes and provisional/insufficient data. Frozen project roster, source references, denominators and as-of date are retained in institutional ranking records. This threshold is a configurable future product policy, not a validated universal constant; changing it requires a new policy version in code.

Freeze stores roster, raw evidence references, policy, scores, mode and timestamp. Ordinary commands cannot mutate frozen results. Appeal creates an explained new snapshot revision; original snapshot and V1 `started + 10*published` results remain. Public reads suppress withdrawn permissions/revoked evidence without erasing the audit snapshot.
