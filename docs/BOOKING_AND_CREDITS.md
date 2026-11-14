# Expert support and service credits

Experts submit passports with evidence sources, skills, stages, languages, timezone, beginner experience, cases and limitations. Independent review approves/limits/suspends them; they cannot approve themselves. Match results explain task/stage/language/price/availability fit.

Offers have integer minor-unit price, code, scale, tariff/rules version, capacity and cancellation rules. Demo code `DEMO-SVC`, scale 2, is a service unit, not a USD peg. Existing ambassador points and learning achievements remain separate from service credits. Sponsor entitlement is restricted funded support, not a limitless award currency.

Booking: project/brief/question/materials → future slot → balance/entitlement/capacity validation → 10-minute hold → confirmation/capture → session → action plan → result and expert follow-up. Times are stored UTC and displayed with an IANA timezone. Overlapping availability is rejected. An expert sees their own bookings; unrelated people cannot read them.

SQLite `BEGIN IMMEDIATE` serializes capacity, hold, balance and outbox/idempotency writes. Separate competing-process tests prove one winner for a last seat. Same key/different input conflicts; same key/same input replays its original result. Ledger rows cannot be updated or deleted. Confirmed prices/rules stay frozen. Available balance cannot go negative. Holds, confirmations, cancellation and expiry compete under the same lock.

Timely cancellation (60 minutes before start) or expert cancellation refunds under the saved rules. Repeated cancellation/refund cannot over-refund. Disputes require an independent coordinator decision, bounded by the remaining original amount. A proposed move keeps the original booking until the other party accepts a same-service slot; price and ledger capture stay unchanged. No-show becomes a reviewable dispute.

Funding needs independently confirmed source, budget, eligibility, skill restrictions and expiry. Active holds/confirmed usage count against quota; cancellation restores permitted quota. Demo credits are capped. Payments, expert payouts and the actual AI Startify internal-dollar contract remain not connected. An expert payout is not inferred from the credit ledger.
