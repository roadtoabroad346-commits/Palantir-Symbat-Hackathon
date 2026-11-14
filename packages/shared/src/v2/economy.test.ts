import { afterEach, expect, it, vi } from "vitest";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { balance } from "./economy";
import { lab, project, type Lab } from "./testkit";
import { DEMO_ID } from "./seed";
const fixtures: Lab[] = [];
const make = () => {
  const l = lab("founder-studio");
  fixtures.push(l);
  return l;
};
afterEach(() => {
  vi.useRealTimers();
  fixtures.splice(0).forEach((l) => l.close());
});
function offered(a: Lab, capacity = 1, priceMinor = 500) {
  const expertProfileId = DEMO_ID("expert-research-profile");
  a.mutate(
    "expert.review",
    {
      expertProfileId,
      status: "approved",
      reviewEvidence: "Inspected fictional demo references",
    },
    "reviewer",
  );
  const offer = a.mutate(
    "offer.create",
    {
      title: "research review",
      skill: "research",
      stage: "prototype",
      language: "ru",
      format: capacity > 1 ? "group_workshop" : "short_session",
      priceMinor,
      capacity,
    },
    "expert-research",
  );
  const startAt = new Date(Date.now() + 2 * 86400000).toISOString(),
    endAt = new Date(Date.parse(startAt) + 30 * 60000).toISOString();
  const slot = a.mutate(
    "availability.create",
    { offerId: offer.id, startAt, endAt, timezone: "Asia/Qyzylorda" },
    "expert-research",
  );
  return { offer, slot, expertProfileId };
}
function credit(a: Lab, name = "solo", amountMinor = 10000) {
  return a.mutate(
    "wallet.demo_credit",
    { amountMinor, reference: randomUUID() },
    name,
  );
}
function hold(
  a: Lab,
  slotId: string,
  projectId: string,
  extra: Record<string, any> = {},
) {
  return {
    slotId,
    projectId,
    timezone: "Asia/Qyzylorda",
    brief: "Building a feedback form; tried first prototype",
    question: "How to test it?",
    materials: "https://example.org/prototype",
    funding: "service_credit",
    ...extra,
  };
}
it("matches an approved specialist by task and blocks self-verification", () => {
  const a = make();
  expect(() =>
    a.mutate("offer.create", { title: "unapproved" }, "expert-research"),
  ).toThrow("Approved expert");
  expect(() =>
    a.mutate(
      "expert.review",
      {
        expertProfileId: DEMO_ID("expert-research-profile"),
        status: "approved",
        reviewEvidence: "self",
      },
      "expert-research",
    ),
  ).toThrow("Permission");
  const { offer, slot } = offered(a);
  const p = project(a),
    match = a.mutate("expert.match", {
      projectId: p.id,
      skill: "research",
      language: "ru",
      budgetMinor: 1000,
    });
  expect(match.data.matches[0].reason).toContain("stage=prototype");
  expect(match.data.matches[0].slotIds).toContain(slot.id);
  expect(
    a.mutate("expert.match", {
      projectId: p.id,
      skill: "design",
      language: "en",
      budgetMinor: 0,
    }).data.status,
  ).toBe("no_matching_availability");
  expect(offer.data.skill).toBe("research");
  expect(slot.data.timezone).toBe("Asia/Qyzylorda");
  expect(a.hub.records(a.actor(), "service_offer")[0].data.priceMinor).toBe(
    500,
  );
  expect(() =>
    a.mutate(
      "availability.create",
      {
        offerId: offer.id,
        startAt: new Date(Date.parse(slot.data.startAt) + 60000).toISOString(),
        endAt: new Date(Date.parse(slot.data.endAt) + 60000).toISOString(),
        timezone: "UTC",
      },
      "expert-research",
    ),
  ).toThrow("overlaps");
  a.mutate(
    "expert.apply",
    {
      nickname: "TestGuide",
      skills: "research",
      stages: "idea",
      languages: "ru",
      timezone: "UTC",
      experience: "Demo",
      sources: "Fixture",
      cases: "Fixture",
      beginnerExperience: "Fixture",
      limitations: "Demo",
      consent: true,
    },
    "teacher",
  );
  expect(() => a.mutate("expert.apply", {}, "teacher")).toThrow(
    "already exists",
  );
});
it("moves a confirmed booking only after the other party accepts and keeps the original price", () => {
  const a = make(),
    p = project(a),
    { slot, offer } = offered(a);
  credit(a);
  const next = a.mutate(
    "availability.create",
    {
      offerId: offer.id,
      startAt: new Date(Date.parse(slot.data.startAt) + 86400000).toISOString(),
      endAt: new Date(Date.parse(slot.data.endAt) + 86400000).toISOString(),
      timezone: "UTC",
    },
    "expert-research",
  );
  const b = a.mutate("booking.hold", hold(a, slot.id, p.id));
  a.mutate("booking.confirm", { bookingId: b.id });
  const request = a.mutate("booking.reschedule", {
    bookingId: b.id,
    slotId: next.id,
    reason: "Need another day",
  });
  expect(a.store.get(b.id).data.slotId).toBe(slot.id);
  expect(() =>
    a.mutate("booking.reschedule.confirm", {
      requestId: request.id,
      approved: true,
      reason: "self",
    }),
  ).toThrow("Other booking party");
  a.mutate(
    "booking.reschedule.confirm",
    { requestId: request.id, approved: true, reason: "Agreed new date" },
    "expert-research",
  );
  expect(a.store.get(b.id).data.slotId).toBe(next.id);
  expect(a.store.get(b.id).data.priceMinor).toBe(500);
  expect(
    a.store.all("SELECT * FROM v2_ledger WHERE reference LIKE 'capture:%'"),
  ).toHaveLength(1);
  expect(
    a.hub
      .records(a.actor("expert-research"), "booking")
      .some((r) => r.id === b.id),
  ).toBe(true);
});
it("preserves frozen brief, time, price and policy and deduplicates hold, capture and refund", () => {
  const a = make(),
    p = project(a),
    { offer, slot } = offered(a),
    w = credit(a),
    input = hold(a, slot.id, p.id),
    key = randomUUID();
  const b = a.mutate("booking.hold", input, "solo", key);
  expect(a.mutate("booking.hold", input, "solo", key).id).toBe(b.id);
  expect(balance(a.store, w.id)).toEqual({
    posted: 10000,
    held: 500,
    available: 9500,
  });
  a.store.update(a.store.get(offer.id), { ...offer.data, priceMinor: 9999 });
  const confirmKey = randomUUID();
  a.mutate("booking.confirm", { bookingId: b.id }, "solo", confirmKey);
  a.mutate("booking.confirm", { bookingId: b.id }, "solo", confirmKey);
  expect(balance(a.store, w.id).posted).toBe(9500);
  const saved = a.store.get(b.id);
  expect(saved.data.priceMinor).toBe(500);
  expect(saved.data.tariffVersion).toBe("local-v2");
  expect(saved.data.brief).toContain("feedback form");
  const cancelKey = randomUUID();
  a.mutate(
    "booking.cancel",
    { bookingId: b.id, reason: "Reschedule later" },
    "solo",
    cancelKey,
  );
  a.mutate(
    "booking.cancel",
    { bookingId: b.id, reason: "Reschedule later" },
    "solo",
    cancelKey,
  );
  a.mutate("booking.cancel", { bookingId: b.id, reason: "Already cancelled" });
  expect(balance(a.store, w.id)).toEqual({
    posted: 10000,
    held: 0,
    available: 10000,
  });
  expect(a.store.all("SELECT * FROM v2_ledger")).toHaveLength(3);
  expect(() => a.store.run("UPDATE v2_ledger SET amount=999")).toThrow(
    "append-only",
  );
  expect(() => a.store.run("DELETE FROM v2_ledger")).toThrow("append-only");
});
it("enforces affordability, slot capacity, expired holds and removed expert under one transaction", () => {
  const a = make(),
    p = project(a),
    { slot, expertProfileId } = offered(a);
  expect(() => a.mutate("booking.hold", hold(a, slot.id, p.id))).toThrow(
    "Insufficient credits",
  );
  credit(a);
  const b = a.mutate("booking.hold", hold(a, slot.id, p.id));
  expect(() => a.mutate("booking.hold", hold(a, slot.id, p.id))).toThrow(
    "sold out",
  );
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 11 * 60000);
  expect(() => a.mutate("booking.confirm", { bookingId: b.id })).toThrow();
  const next = a.mutate("booking.hold", hold(a, slot.id, p.id));
  expect(a.store.get(b.id).data.status).toBe("expired");
  a.mutate(
    "expert.review",
    { expertProfileId, status: "suspended", reviewEvidence: "Demo suspension" },
    "reviewer",
  );
  expect(() => a.mutate("booking.confirm", { bookingId: next.id })).toThrow(
    "Expert unavailable",
  );
});
it("allows only one independent process to reserve the last place", async () => {
  const a = make(),
    p1 = project(a),
    p2 = a.mutate(
      "project.create",
      {
        title: "another orbit",
        problem: "A problem",
        audience: "Teachers",
        stage: "prototype",
        country: "KZ",
      },
      "school-founder",
    ),
    { slot } = offered(a);
  credit(a);
  credit(a, "school-founder");
  const payloads = [
    { actor: a.actor(), projectId: p1.id },
    { actor: a.actor("school-founder"), projectId: p2.id },
  ];
  const workers = payloads.map((v) =>
    fork(
      fileURLToPath(
        new URL(
          "../../../../scripts/v2-booking-race-worker.ts",
          import.meta.url,
        ),
      ),
      [a.file, v.actor.id, JSON.stringify(hold(a, slot.id, v.projectId))],
      {
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      },
    ),
  );
  try {
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolveReady, reject) => {
            worker.once("error", reject);
            worker.once("message", (message) => {
              if ((message as any).ready) resolveReady();
              else reject(Error("not ready"));
            });
          }),
      ),
    );
    const outcomes = workers.map(
      (worker) =>
        new Promise<any>((resolveDone, reject) => {
          worker.once("error", reject);
          worker.once("message", resolveDone);
        }),
    );
    workers.forEach((worker) => worker.send("go"));
    const results = await Promise.all(outcomes);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)[0].message).toContain("sold out");
    expect(
      a.store.list("booking").filter((b) => b.data.status === "held"),
    ).toHaveLength(1);
    expect(
      a.store.all("SELECT * FROM v2_hold WHERE status='held'"),
    ).toHaveLength(1);
  } finally {
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolveExit) => {
            if (worker.exitCode !== null) {
              resolveExit();
              return;
            }
            worker.once("exit", () => resolveExit());
            worker.kill();
          }),
      ),
    );
  }
}, 20000);
it("never overcommits confirmed sponsor resources and restores quota on cancellation", () => {
  const a = make(),
    p = project(a),
    { slot } = offered(a, 2),
    s = a.mutate(
      "sponsorship.create",
      {
        scope: "*",
        budgetMinor: 500,
        eligibleIds: [a.actor().id, a.actor("school-founder").id],
        skills: ["research"],
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        fundingSource: "Confirmed fictional demo budget",
      },
      "coordinator",
    );
  expect(() =>
    a.mutate(
      "sponsorship.confirm",
      { sponsorId: s.id, confirmation: "self" },
      "coordinator",
    ),
  ).toThrow();
  a.mutate(
    "sponsorship.confirm",
    { sponsorId: s.id, confirmation: "Independent funding fixture" },
    "admin",
  );
  const p2 = a.mutate(
    "project.create",
    {
      title: "other project",
      problem: "Another problem",
      audience: "Teachers",
      stage: "prototype",
      country: "KZ",
    },
    "school-founder",
  );
  const b = a.mutate(
    "booking.hold",
    hold(a, slot.id, p.id, { funding: "sponsor_entitlement", sponsorId: s.id }),
  );
  expect(() =>
    a.mutate(
      "booking.hold",
      hold(a, slot.id, p2.id, {
        funding: "sponsor_entitlement",
        sponsorId: s.id,
      }),
      "school-founder",
    ),
  ).toThrow("quota exhausted");
  a.mutate("booking.confirm", { bookingId: b.id });
  a.mutate("booking.cancel", { bookingId: b.id, reason: "Release support" });
  expect(
    a.mutate(
      "booking.hold",
      hold(a, slot.id, p2.id, {
        funding: "sponsor_entitlement",
        sponsorId: s.id,
      }),
      "school-founder",
    ).data.funding,
  ).toBe("sponsor_entitlement");
  expect(a.store.all("SELECT * FROM v2_ledger")).toHaveLength(0);
});
it("ends help with an action and expert follow-up, keeps disputes and payouts distinct", () => {
  const a = make(),
    p = project(a),
    { slot } = offered(a);
  credit(a);
  const b = a.mutate("booking.hold", hold(a, slot.id, p.id));
  a.mutate("booking.confirm", { bookingId: b.id });
  expect(() =>
    a.mutate("booking.complete", { bookingId: b.id }, "expert-research"),
  ).toThrow("after its end");
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(slot.data.endAt) + 1000);
  const completed = a.mutate(
    "booking.complete",
    {
      bookingId: b.id,
      summary: "Review found unclear questions",
      action: "Ask three neutral questions",
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      followUpAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
    "expert-research",
  );
  expect(completed.data.payoutStatus).toBe("not_connected");
  expect(() =>
    a.mutate(
      "action.review",
      { bookingId: b.id, feedback: "ok", nextStep: "next" },
      "expert-research",
    ),
  ).toThrow("Action not completed");
  a.mutate("action.complete", {
    bookingId: b.id,
    result: "Two observations contradicted hypothesis",
    limitations: "Two teachers",
  });
  expect(
    a.mutate(
      "action.review",
      {
        bookingId: b.id,
        feedback: "Refine audience",
        nextStep: "Test a new group",
      },
      "expert-research",
    ).data.status,
  ).toBe("reviewed");
  a.mutate("booking.dispute", {
    bookingId: b.id,
    reason: "Request partial refund review",
  });
  expect(() =>
    a.mutate(
      "booking.resolve",
      { bookingId: b.id, refundMinor: 501, resolution: "too much" },
      "admin",
    ),
  ).toThrow("Integer");
  const resolved = a.mutate(
    "booking.resolve",
    { bookingId: b.id, refundMinor: 250, resolution: "Partial refund agreed" },
    "admin",
  );
  expect(resolved.data.refundedMinor).toBe(250);
  expect(() =>
    a.mutate(
      "booking.resolve",
      { bookingId: b.id, refundMinor: 250, resolution: "again" },
      "admin",
    ),
  ).toThrow();
  expect(() =>
    a.mutate("booking.cancel", { bookingId: b.id, reason: "again" }),
  ).toThrow("cannot be cancelled");
});
it("keeps reschedule and no-show as audited workflows", () => {
  const a = make(),
    p = project(a),
    { slot } = offered(a);
  credit(a);
  const b = a.mutate("booking.hold", hold(a, slot.id, p.id));
  expect(
    a.mutate("booking.reschedule", {
      bookingId: b.id,
      slotId: slot.id,
      reason: "Discuss another day",
    }).data.status,
  ).toBe("pending");
  a.mutate("booking.confirm", { bookingId: b.id });
  expect(() =>
    a.mutate(
      "booking.no_show",
      { bookingId: b.id, reason: "Absent" },
      "coordinator",
    ),
  ).toThrow("ended");
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(slot.data.endAt) + 1000);
  expect(
    a.mutate(
      "booking.no_show",
      { bookingId: b.id, reason: "Confirmed absence" },
      "coordinator",
    ).data.status,
  ).toBe("disputed");
});
