import { insist, type Actor, type Data, type RecordV2 } from "./types";
import { Store, timestamp } from "./store";
import { hasRole, own, requireRole } from "./access";
import {
  bool,
  choice,
  integer,
  iso,
  list,
  publicText,
  text,
  timezone,
} from "./validation";
import { randomUUID } from "node:crypto";

export function wallet(store: Store, actor: Actor) {
  let result = store
    .list("wallet", actor.mode)
    .find((r) => r.owner === actor.id);
  if (!result)
    result = store.create("wallet", actor, {
      code: "DEMO-SVC",
      scale: 2,
      tariffVersion: "local-v2",
      currencyMeaning: "Service credits; no USD peg; not ambassador points",
      paidProvider: "not_connected",
    });
  return result;
}
function expire(store: Store) {
  const at = timestamp();
  const holds = store.all(
    "SELECT * FROM v2_hold WHERE status='held' AND expiresAt<=?",
    at,
  );
  for (const hold of holds) {
    store.run(
      "UPDATE v2_hold SET status='expired' WHERE id=? AND status='held'",
      hold.id,
    );
    const booking = store.get(hold.bookingId, "booking");
    if (booking.data.status === "held")
      store.update(booking, { ...booking.data, status: "expired" });
  }
}
export function balance(
  store: Store,
  walletId: string,
  category = "service_credit",
) {
  const posted = Number(
    store.one(
      "SELECT COALESCE(SUM(amount),0) n FROM v2_ledger WHERE walletId=? AND category=?",
      walletId,
      category,
    )?.n ?? 0,
  );
  const held = Number(
    store.one(
      "SELECT COALESCE(SUM(h.amount),0) n FROM v2_hold h JOIN v2_record b ON b.id=h.bookingId WHERE h.walletId=? AND h.status='held' AND h.expiresAt>? AND json_extract(b.data,'$.funding')=?",
      walletId,
      timestamp(),
      category,
    )?.n ?? 0,
  );
  return { posted, held, available: posted - held };
}
function ledger(
  store: Store,
  walletId: string,
  amount: number,
  category: string,
  reference: string,
  mode: string,
) {
  insist(
    Number.isSafeInteger(amount),
    "invalid_amount",
    "Integer minor units required",
  );
  store.run(
    "INSERT INTO v2_ledger VALUES (?,?,?,?,?,?,?)",
    randomUUID(),
    walletId,
    amount,
    category,
    reference,
    mode,
    timestamp(),
  );
}
function bookingAccess(actor: Actor, booking: RecordV2) {
  insist(
    actor.mode === booking.mode &&
      (actor.id === booking.owner ||
        actor.id === booking.data.expertId ||
        hasRole(actor, ["coordinator", "platform_admin"], booking.scope)),
    "forbidden",
    "Нет доступа к бронированию / Booking access denied",
    403,
  );
}
function fundingAvailable(
  store: Store,
  sponsorship: RecordV2,
  at = timestamp(),
) {
  insist(
    sponsorship.data.status === "funded" && sponsorship.data.expiresAt > at,
    "funding_unavailable",
    "Sponsor funding unavailable",
  );
  const used = store
    .list("booking", sponsorship.mode)
    .filter(
      (b) =>
        b.data.sponsorId === sponsorship.id &&
        ["held", "confirmed", "completed", "disputed"].includes(
          b.data.status,
        ) &&
        !(b.data.status === "held" && b.data.expiresAt <= at),
    )
    .reduce(
      (sum, b) => sum + b.data.priceMinor - (b.data.refundedMinor ?? 0),
      0,
    );
  return sponsorship.data.budgetMinor - used;
}
export function economyMutate(
  store: Store,
  actor: Actor,
  op: string,
  d: Data,
): Data | undefined {
  if (op === "expert.match") {
    const project = store.get(text(d, "projectId", 160), "project");
    own(actor, project);
    const skill = text(d, "skill", 80),
      language = choice(d, "language", ["ru", "en"]),
      budgetMinor = integer(d, "budgetMinor");
    const offers = store
      .list("service_offer", actor.mode)
      .filter(
        (o) =>
          o.data.active &&
          o.data.skill === skill &&
          o.data.stage === project.data.stage &&
          o.data.language === language &&
          o.data.priceMinor <= budgetMinor &&
          store.get(o.data.expertProfileId, "expert").data.status ===
            "approved",
      );
    const matches = offers.flatMap((o) => {
      const slots = store
        .list("availability", actor.mode)
        .filter(
          (s) =>
            s.data.offerId === o.id &&
            s.data.status === "open" &&
            s.data.startAt > timestamp(),
        );
      return slots.length
        ? [
            {
              offerId: o.id,
              expertId: o.owner,
              priceMinor: o.data.priceMinor,
              code: o.data.code,
              slotIds: slots.map((s) => s.id),
              reason: `task=${skill}; stage=${project.data.stage}; language=${language}; price <= ${budgetMinor}; future availability found`,
            },
          ]
        : [];
    });
    return store.create(
      "expert_match",
      actor,
      {
        projectId: project.id,
        skill,
        language,
        budgetMinor,
        matches,
        status: matches.length ? "matches_found" : "no_matching_availability",
      },
      { scope: project.scope },
    );
  }
  if (op === "expert.apply") {
    const old = store
      .list("expert", actor.mode)
      .find((r) => r.owner === actor.id);
    insist(!old, "already_exists", "Expert application already exists", 409);
    return store.create("expert", actor, {
      nickname: publicText(d, "nickname", 40),
      skills: list(d, "skills"),
      stages: list(d, "stages"),
      languages: list(d, "languages"),
      timezone: timezone(d.timezone),
      experience: text(d, "experience"),
      sources: text(d, "sources"),
      cases: text(d, "cases"),
      beginnerExperience: text(d, "beginnerExperience"),
      limitations: text(d, "limitations"),
      status: "submitted",
      verificationStatus: "self_reported",
      consent: bool(d, "consent"),
    });
  }
  if (op === "expert.review") {
    const expert = store.get(text(d, "expertProfileId", 160), "expert");
    requireRole(actor, ["platform_admin", "moderator"], expert.scope);
    insist(
      expert.owner !== actor.id && expert.mode === actor.mode,
      "self_verification",
      "Expert cannot verify own qualifications",
      403,
    );
    const status = choice(d, "status", [
      "reviewing",
      "approved",
      "limited",
      "suspended",
    ]);
    const updated = store.update(
      expert,
      {
        ...expert.data,
        status,
        verificationStatus: status === "approved" ? "verified" : "pending",
        reviewer: actor.id,
        reviewEvidence: text(d, "reviewEvidence"),
        reviewedAt: timestamp(),
      },
      status === "approved" && expert.data.consent ? "public" : "private",
    );
    for (const role of store
      .list("role_assignment", actor.mode)
      .filter(
        (r) => r.data.subjectId === expert.owner && r.data.role === "expert",
      ))
      store.update(role, { ...role.data, status: "revoked" });
    if (status === "approved")
      store.create(
        "role_assignment",
        actor,
        { subjectId: expert.owner, role: "expert", status: "active" },
        { scope: expert.owner },
      );
    return updated;
  }
  if (op === "offer.create") {
    const expert = store
      .list("expert", actor.mode)
      .find((r) => r.owner === actor.id && r.data.status === "approved");
    insist(expert, "expert_unapproved", "Approved expert required", 403);
    requireRole(actor, ["expert"], actor.id);
    return store.create(
      "service_offer",
      actor,
      {
        expertId: actor.id,
        expertProfileId: expert.id,
        title: publicText(d, "title"),
        skill: text(d, "skill", 80),
        stage: text(d, "stage", 80),
        language: choice(d, "language", ["ru", "en"]),
        format: choice(d, "format", [
          "short_session",
          "async_review",
          "group_workshop",
          "supported_experiment",
        ]),
        priceMinor: integer(d, "priceMinor", 0, 1000000),
        code: "DEMO-SVC",
        scale: 2,
        tariffVersion: "local-v2",
        rulesVersion: "booking-v2",
        cancelBeforeMinutes: 60,
        refundPercent: 100,
        capacity: integer(d, "capacity", 1, 30),
        active: true,
        consent: true,
      },
      { visibility: "public" },
    );
  }
  if (op === "availability.create") {
    const offer = store.get(text(d, "offerId", 160), "service_offer");
    own(actor, offer);
    requireRole(actor, ["expert"], actor.id);
    const startAt = iso(d, "startAt"),
      endAt = iso(d, "endAt");
    insist(
      startAt > timestamp() && startAt < endAt,
      "invalid_period",
      "Future slot with positive duration required",
    );
    const overlap = store
      .list("availability", actor.mode)
      .some(
        (s) =>
          s.data.expertId === actor.id &&
          s.data.startAt < endAt &&
          s.data.endAt > startAt &&
          s.data.status === "open",
      );
    insist(
      !overlap,
      "overlap",
      "Слот пересекается с другим / Availability overlaps another slot",
      409,
    );
    return store.create(
      "availability",
      actor,
      {
        offerId: offer.id,
        expertId: actor.id,
        startAt,
        endAt,
        timezone: timezone(d.timezone),
        capacity: offer.data.capacity,
        status: "open",
        consent: true,
      },
      { visibility: "public" },
    );
  }
  if (op === "wallet.demo_credit") {
    insist(
      actor.mode === "demo",
      "payment_not_connected",
      "Payment provider not connected",
      503,
    );
    const w = wallet(store, actor),
      amount = integer(d, "amountMinor", 1, 100000);
    insist(
      balance(store, w.id).posted + amount <= 200000,
      "demo_limit",
      "Demo balance cap reached",
    );
    ledger(
      store,
      w.id,
      amount,
      "service_credit",
      `demo:${text(d, "reference", 160)}`,
      actor.mode,
    );
    return { ...w, balance: balance(store, w.id) };
  }
  if (op === "sponsorship.create") {
    requireRole(
      actor,
      ["coordinator", "platform_admin"],
      text(d, "scope", 160),
    );
    const record = store.create(
      "sponsorship",
      actor,
      {
        budgetMinor: integer(d, "budgetMinor", 1, 10000000),
        code: "DEMO-SVC",
        scale: 2,
        eligibleIds: list(d, "eligibleIds"),
        skills: list(d, "skills"),
        expiresAt: iso(d, "expiresAt"),
        fundingSource: text(d, "fundingSource"),
        status: "pending",
        verificationStatus: "pending",
      },
      { scope: text(d, "scope", 160) },
    );
    return record;
  }
  if (op === "sponsorship.confirm") {
    const s = store.get(text(d, "sponsorId", 160), "sponsorship");
    requireRole(actor, ["platform_admin"], s.scope);
    insist(
      s.owner !== actor.id && s.mode === actor.mode,
      "self_verification",
      "Independent funding confirmation required",
      403,
    );
    return store.update(s, {
      ...s.data,
      status: "funded",
      verificationStatus: "verified",
      confirmedBy: actor.id,
      confirmation: text(d, "confirmation"),
    });
  }
  if (op === "booking.hold") {
    expire(store);
    requireRole(actor, ["founder"], actor.id);
    const slot = store.get(text(d, "slotId", 160), "availability"),
      offer = store.get(slot.data.offerId, "service_offer"),
      expert = store.get(offer.data.expertProfileId, "expert");
    insist(
      slot.mode === actor.mode &&
        slot.data.status === "open" &&
        slot.data.startAt > timestamp() &&
        offer.data.active &&
        expert.data.status === "approved" &&
        actor.id !== expert.owner,
      "slot_unavailable",
      "Слот недоступен / Slot unavailable",
      409,
    );
    const active = store
      .list("booking", actor.mode)
      .filter(
        (b) =>
          b.data.expertId === slot.data.expertId &&
          ["held", "confirmed", "completed", "disputed"].includes(
            b.data.status,
          ) &&
          b.data.startAt < slot.data.endAt &&
          b.data.endAt > slot.data.startAt,
      );
    insist(
      active.length < slot.data.capacity,
      "sold_out",
      "Все места заняты / Slot sold out",
      409,
    );
    const funding = choice(
      d,
      "funding",
      ["service_credit", "sponsor_entitlement"],
      "service_credit",
    );
    const w = wallet(store, actor);
    let sponsorId = null;
    if (funding === "sponsor_entitlement") {
      sponsorId = text(d, "sponsorId", 160);
      const s = store.get(sponsorId, "sponsorship");
      insist(
        s.mode === actor.mode &&
          s.data.eligibleIds.includes(actor.id) &&
          (!s.data.skills.length || s.data.skills.includes(offer.data.skill)),
        "sponsor_ineligible",
        "Not eligible for this support",
        403,
      );
      insist(
        fundingAvailable(store, s) >= offer.data.priceMinor,
        "sponsor_exhausted",
        "Квота спонсора исчерпана / Sponsor quota exhausted",
        409,
      );
    } else
      insist(
        balance(store, w.id).available >= offer.data.priceMinor,
        "insufficient_balance",
        "Недостаточно кредитов / Insufficient credits",
        409,
      );
    const project = store.get(text(d, "projectId", 160), "project");
    own(actor, project);
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    const booking = store.create(
      "booking",
      actor,
      {
        projectId: project.id,
        slotId: slot.id,
        offerId: offer.id,
        expertId: slot.data.expertId,
        expertProfileId: expert.id,
        startAt: slot.data.startAt,
        endAt: slot.data.endAt,
        timezone: timezone(d.timezone),
        priceMinor: offer.data.priceMinor,
        code: offer.data.code,
        scale: offer.data.scale,
        tariffVersion: offer.data.tariffVersion,
        rulesVersion: offer.data.rulesVersion,
        cancelBeforeMinutes: offer.data.cancelBeforeMinutes,
        refundPercent: offer.data.refundPercent,
        brief: text(d, "brief", 8000),
        materials: text(d, "materials", 4000, true),
        question: text(d, "question"),
        walletId: w.id,
        funding,
        sponsorId,
        status: "held",
        expiresAt,
        refundedMinor: 0,
      },
      { scope: project.scope },
    );
    store.run(
      "INSERT INTO v2_hold VALUES (?,?,?,?,?,?)",
      randomUUID(),
      w.id,
      booking.id,
      offer.data.priceMinor,
      expiresAt,
      "held",
    );
    return booking;
  }
  if (
    [
      "booking.confirm",
      "booking.cancel",
      "booking.complete",
      "booking.dispute",
      "booking.resolve",
      "action.complete",
      "action.review",
      "booking.no_show",
    ].includes(op)
  ) {
    expire(store);
    const booking = store.get(text(d, "bookingId", 160), "booking");
    bookingAccess(actor, booking);
    const b = booking.data;
    if (op === "booking.confirm") {
      insist(
        actor.id === booking.owner,
        "forbidden",
        "Only booking owner can confirm",
        403,
      );
      insist(
        b.status === "held" && b.expiresAt > timestamp(),
        "hold_expired",
        "Резерв истёк / Hold expired",
        409,
      );
      const expert = store.get(b.expertProfileId, "expert");
      insist(
        expert.data.status === "approved",
        "expert_unavailable",
        "Expert unavailable",
        409,
      );
      if (b.funding === "service_credit")
        ledger(
          store,
          b.walletId,
          -b.priceMinor,
          "service_credit",
          `capture:${booking.id}`,
          actor.mode,
        );
      else {
        const sponsor = store.get(b.sponsorId, "sponsorship");
        insist(
          fundingAvailable(store, sponsor) >= 0,
          "sponsor_exhausted",
          "Sponsor budget exhausted",
          409,
        );
      }
      store.run(
        "UPDATE v2_hold SET status='captured' WHERE bookingId=? AND status='held'",
        booking.id,
      );
      return store.update(booking, {
        ...b,
        status: "confirmed",
        confirmedAt: timestamp(),
      });
    }
    if (op === "booking.cancel") {
      if (b.status === "cancelled") return booking;
      insist(
        ["held", "confirmed"].includes(b.status),
        "invalid_transition",
        "Booking cannot be cancelled",
        409,
      );
      const refundable =
        b.status === "held"
          ? 0
          : Date.parse(b.startAt) - Date.now() >=
                b.cancelBeforeMinutes * 60000 || actor.id === b.expertId
            ? b.priceMinor
            : 0;
      if (refundable && b.funding === "service_credit")
        ledger(
          store,
          b.walletId,
          refundable,
          "service_credit",
          `refund:${booking.id}`,
          actor.mode,
        );
      store.run(
        "UPDATE v2_hold SET status='released' WHERE bookingId=?",
        booking.id,
      );
      return store.update(booking, {
        ...b,
        status: "cancelled",
        refundedMinor: refundable,
        cancelReason: text(d, "reason"),
        cancelledBy: actor.id,
      });
    }
    if (op === "booking.complete") {
      insist(
        actor.id === b.expertId &&
          b.status === "confirmed" &&
          b.endAt <= timestamp(),
        "session_unavailable",
        "Expert may complete a confirmed session after its end",
        409,
      );
      const action = store.create(
        "action_plan",
        actor,
        {
          bookingId: booking.id,
          projectId: b.projectId,
          founderId: booking.owner,
          expertId: b.expertId,
          summary: text(d, "summary"),
          action: text(d, "action"),
          dueAt: iso(d, "dueAt"),
          followUpAt: iso(d, "followUpAt"),
          status: "agreed",
          result: null,
        },
        { scope: booking.scope, owner: booking.owner },
      );
      return store.update(booking, {
        ...b,
        status: "completed",
        actionPlanId: action.id,
        completedAt: timestamp(),
        payoutStatus: "not_connected",
      });
    }
    if (op === "booking.dispute") {
      insist(
        ["confirmed", "completed"].includes(b.status),
        "invalid_transition",
        "Cannot dispute",
        409,
      );
      return store.update(booking, {
        ...b,
        status: "disputed",
        disputeReason: text(d, "reason"),
      });
    }
    if (op === "booking.resolve") {
      requireRole(actor, ["coordinator", "platform_admin"], booking.scope);
      insist(
        actor.id !== booking.owner &&
          actor.id !== b.expertId &&
          b.status === "disputed",
        "conflict_of_interest",
        "Independent dispute reviewer required",
        403,
      );
      const amount = integer(
        d,
        "refundMinor",
        0,
        b.priceMinor - b.refundedMinor,
      );
      if (amount && b.funding === "service_credit")
        ledger(
          store,
          b.walletId,
          amount,
          "service_credit",
          `dispute-refund:${booking.id}`,
          actor.mode,
        );
      return store.update(booking, {
        ...b,
        status: "resolved",
        refundedMinor: b.refundedMinor + amount,
        resolution: text(d, "resolution"),
        resolvedBy: actor.id,
      });
    }
    if (op === "booking.no_show") {
      requireRole(actor, ["coordinator", "platform_admin"], booking.scope);
      insist(
        b.endAt <= timestamp() && b.status === "confirmed",
        "invalid_transition",
        "No-show requires ended confirmed booking",
      );
      return store.update(booking, {
        ...b,
        status: "disputed",
        disputeReason: `no_show: ${text(d, "reason")}`,
      });
    }
    if (op === "action.complete") {
      insist(
        actor.id === booking.owner && b.actionPlanId,
        "forbidden",
        "Only founder can report action",
        403,
      );
      const action = store.get(b.actionPlanId, "action_plan");
      return store.update(action, {
        ...action.data,
        status: "completed",
        result: text(d, "result"),
        limitations: text(d, "limitations"),
        completedAt: timestamp(),
      });
    }
    if (op === "action.review") {
      insist(
        actor.id === b.expertId && b.actionPlanId,
        "forbidden",
        "Expert follow-up required",
        403,
      );
      const action = store.get(b.actionPlanId, "action_plan");
      insist(
        action.data.status === "completed",
        "action_incomplete",
        "Action not completed",
      );
      return store.update(action, {
        ...action.data,
        status: "reviewed",
        feedback: text(d, "feedback"),
        nextStep: text(d, "nextStep"),
        reviewedAt: timestamp(),
      });
    }
  }
  if (op === "booking.reschedule") {
    const booking = store.get(text(d, "bookingId", 160), "booking");
    bookingAccess(actor, booking);
    insist(
      ["held", "confirmed"].includes(booking.data.status),
      "invalid_transition",
      "Cannot reschedule",
      409,
    );
    const target = store.get(text(d, "slotId", 160), "availability");
    insist(
      target.mode === actor.mode &&
        target.data.offerId === booking.data.offerId &&
        target.data.status === "open" &&
        target.data.startAt > timestamp(),
      "invalid_reschedule",
      "Choose a future slot for the same service; the confirmed price stays fixed",
      409,
    );
    return store.create(
      "reschedule_request",
      actor,
      {
        bookingId: booking.id,
        requestedSlotId: text(d, "slotId", 160),
        reason: text(d, "reason"),
        status: "pending",
        requestedBy: actor.id,
        instruction:
          "Other party must confirm; original reservation remains until confirmation",
      },
      { scope: booking.scope },
    );
  }
  if (op === "booking.reschedule.confirm") {
    expire(store);
    const request = store.get(text(d, "requestId", 160), "reschedule_request"),
      booking = store.get(request.data.bookingId, "booking");
    bookingAccess(actor, booking);
    insist(
      request.mode === actor.mode &&
        request.data.status === "pending" &&
        actor.id !== request.data.requestedBy &&
        [booking.owner, booking.data.expertId].includes(actor.id),
      "independent_confirmation",
      "Other booking party must confirm the move",
      403,
    );
    if (!bool(d, "approved"))
      return store.update(request, {
        ...request.data,
        status: "rejected",
        reason: text(d, "reason"),
        reviewedBy: actor.id,
      });
    const target = store.get(request.data.requestedSlotId, "availability"),
      b = booking.data;
    insist(
      ["held", "confirmed"].includes(b.status) &&
        target.mode === actor.mode &&
        target.data.offerId === b.offerId &&
        target.data.status === "open" &&
        target.data.startAt > timestamp(),
      "invalid_reschedule",
      "Booking or target is no longer available",
      409,
    );
    const count = store
      .list("booking", actor.mode)
      .filter(
        (other) =>
          other.id !== booking.id &&
          other.data.expertId === b.expertId &&
          ["held", "confirmed", "completed", "disputed"].includes(
            other.data.status,
          ) &&
          other.data.startAt < target.data.endAt &&
          other.data.endAt > target.data.startAt,
      ).length;
    insist(
      count < target.data.capacity,
      "sold_out",
      "Target slot sold out",
      409,
    );
    store.update(booking, {
      ...b,
      slotId: target.id,
      startAt: target.data.startAt,
      endAt: target.data.endAt,
      rescheduleHistory: [
        ...(b.rescheduleHistory ?? []),
        {
          previousSlotId: b.slotId,
          previousStartAt: b.startAt,
          requestId: request.id,
          confirmedBy: actor.id,
          at: timestamp(),
        },
      ],
    });
    return store.update(request, {
      ...request.data,
      status: "confirmed",
      reviewedBy: actor.id,
      reason: text(d, "reason"),
      confirmedAt: timestamp(),
    });
  }
  return undefined;
}
