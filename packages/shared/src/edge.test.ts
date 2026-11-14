import { describe, expect, it } from "vitest";
import {
  MockAiStartifyClient,
  HttpAiStartifyClient,
  type PlatformEvent,
  countries,
  countryName,
  t,
  dictionary,
  seededRandom,
  seedStudents,
  nickname,
  schoolCode,
  assertPublic,
  piiGuard,
  points,
  funnel,
  attribute,
  stageDistribution,
  cpa,
  compliance,
  messageVariants,
  levelFor,
  balance,
  redeemBalance,
  fraudCheck,
  challengeScore,
  rubricScore,
  badges,
  rank,
  validateTeam,
  parseNicknameCsv,
  codeActive,
  activationHealth,
  seasonRollover,
  csv,
} from "./index";

describe("deterministic fixture and language contracts", () => {
  it("keeps both translations and language defaults for all ten countries including Kenya", () => {
    expect(countries).toHaveLength(10);
    expect(new Set(countries.map((c) => c.code)).size).toBe(10);
    expect(countries.find((c) => c.code === "KE")).toMatchObject({
      ru: "Кения",
      en: "Kenya",
      wave: 2,
    });
    for (const c of countries) {
      expect(c.ru.length).toBeGreaterThan(0);
      expect(c.en.length).toBeGreaterThan(0);
      expect(["ru", "en"]).toContain(c.language);
      expect(countryName(c.code, "ru")).toBe(`${c.flag} ${c.ru}`);
      expect(countryName(c.code, "en")).toBe(`${c.flag} ${c.en}`);
    }
    expect(countryName("XX", "en")).toBe("XX");
    expect(t("ru", "Идея", "Idea")).toBe("Идея");
    expect(t("en", "Идея", "Idea")).toBe("Idea");
    expect(dictionary.en.demo).toBe("Demo data");
    expect(dictionary.ru.demo).toBe("Демоданные");
  });

  it("generates stable but seed-dependent random sequences in [0, 1)", () => {
    const a = seededRandom(7),
      b = seededRandom(7),
      c = seededRandom(8);
    const first = Array.from({ length: 20 }, a);
    expect(first).toEqual(Array.from({ length: 20 }, b));
    expect(first).not.toEqual(Array.from({ length: 20 }, c));
    expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("seeds each progress status consistently and uses opaque references", () => {
    const students = seedStudents(400, 20);
    expect(seedStudents(0)).toEqual([]);
    expect(new Set(students.map((s) => s.studentRef)).size).toBe(400);
    expect(new Set(students.map((s) => s.status))).toEqual(
      new Set(["none", "started", "published"]),
    );
    for (const s of students) {
      expect(s.stage).toBeGreaterThanOrEqual(0);
      expect(s.stage).toBeLessThanOrEqual(10);
      expect(s.status).toBe(
        s.stage === 0 ? "none" : s.stage === 10 ? "published" : "started",
      );
      expect(piiGuard(s.nickname)).toEqual([]);
    }
    expect(schoolCode(0)).toBe("START-001");
    expect(schoolCode(19)).toBe("START-020");
    expect(nickname(0)).toBe("Orbit10");
  });
});

describe("mock platform lifecycle", () => {
  it("looks up progress, filters schools and sanitizes referral owner identifiers", async () => {
    const client = new MockAiStartifyClient([
      {
        studentRef: "s-1",
        nickname: "Orbit23",
        schoolCode: "A",
        stage: 0,
        status: "none",
      },
      {
        studentRef: "s-2",
        nickname: "Pixel24",
        schoolCode: "B",
        stage: 9,
        status: "started",
      },
    ]);
    expect(await client.getProgress("missing")).toBeNull();
    expect((await client.getProgress("s-1"))?.nickname).toBe("Orbit23");
    expect(
      (await client.listProgressBySchool("A")).map((s) => s.studentRef),
    ).toEqual(["s-1"]);
    expect(await client.listProgressBySchool("missing")).toEqual([]);
    expect(await client.createReferral("owner / unsafe?", "telegram")).toEqual({
      code: "ownerunsafe-telegram",
      url: "/r/ownerunsafe-telegram",
    });
  });

  it("emits stage transitions once and stops advancing at stage ten", async () => {
    const client = new MockAiStartifyClient([
      {
        studentRef: "s-1",
        nickname: "Orbit23",
        schoolCode: "A",
        stage: 0,
        status: "none",
      },
      {
        studentRef: "s-2",
        nickname: "Pixel24",
        schoolCode: "A",
        stage: 9,
        status: "started",
      },
      {
        studentRef: "s-3",
        nickname: "Comet25",
        schoolCode: "B",
        stage: 0,
        status: "none",
      },
    ]);
    const events: PlatformEvent[] = [];
    const unsubscribe = client.subscribe((e) => events.push(e));
    client.advanceSchool("A");
    expect(events.map((e) => e.type)).toEqual([
      "project_started",
      "project_published",
    ]);
    expect(events[0].studentRef).toBe("s-1");
    expect(events[1]).toMatchObject({
      type: "project_published",
      studentRef: "s-2",
      projectId: "p-s-2",
    });
    expect((await client.getProgress("s-2"))?.stage).toBe(10);
    expect((await client.getProgress("s-3"))?.stage).toBe(0);
    client.advanceSchool("A");
    expect(events).toHaveLength(2);
    expect((await client.getProgress("s-2"))?.status).toBe("published");
    unsubscribe();
    client.advanceSchool("B");
    expect(events).toHaveLength(2);
  });

  it("keeps simulated student references unique across successive registration batches", () => {
    const client = new MockAiStartifyClient([]);
    const events: PlatformEvent[] = [];
    client.subscribe((e) => events.push(e));
    client.simulateRegistrations(0);
    client.simulateRegistrations(3, "AMB-TEST");
    client.simulateRegistrations(2);
    expect(events).toHaveLength(5);
    expect(new Set(events.map((e) => e.studentRef)).size).toBe(5);
    expect(events[0]).toMatchObject({
      type: "user_registered",
      referralCode: "AMB-TEST",
      country: "KZ",
    });
    expect(events[4]).toMatchObject({
      type: "user_registered",
      referralCode: "demo",
    });
    expect(
      client.students.every((s) => s.stage === 0 && s.status === "none"),
    ).toBe(true);
  });

  it("fails clearly for every unimplemented HTTP integration entry point", async () => {
    const client = new HttpAiStartifyClient();
    await expect(client.verifySchoolCode("START-001")).rejects.toThrow(
      "not implemented",
    );
    await expect(client.getProgress("s")).rejects.toThrow("not implemented");
    await expect(client.listProgressBySchool("START-001")).rejects.toThrow(
      "not implemented",
    );
    await expect(client.createReferral("owner", "telegram")).rejects.toThrow(
      "not implemented",
    );
    expect(() => client.subscribe(() => undefined)).toThrow("not implemented");
  });
});

describe("public text and growth safety boundaries", () => {
  it("rejects any prohibited value in a set of public fields", () => {
    expect(() => assertPublic("Orbit44", "A small idea")).not.toThrow();
    expect(() => assertPublic("Orbit44", "test@example.org")).toThrow("Email");
    expect(() => assertPublic("Orbit44", "123 456 7890")).toThrow("Phone");
    expect(() => assertPublic("Orbit44", "Иван Иванов")).toThrow("full name");
  });

  it("keeps free campaigns eligible and enforces adult paid audience boundaries", () => {
    expect(
      compliance({
        audience: "student",
        budgetUsd: 0,
        minAge: 15,
        text: "Ask a teacher",
      }),
    ).toEqual([{ level: "pass", reason: "Checks passed / Проверки пройдены" }]);
    expect(
      compliance({
        audience: "parent",
        budgetUsd: 1,
        minAge: 18,
        text: "Ask a teacher",
      })[0].level,
    ).toBe("pass");
    expect(
      compliance({
        audience: "parent",
        budgetUsd: 1,
        minAge: 17,
        text: "Ask a teacher",
      })[0].level,
    ).toBe("block");
    expect(
      compliance({ audience: "parent", budgetUsd: 1, text: "Ask a teacher" })[0]
        .level,
    ).toBe("pass");
    expect(
      compliance({
        audience: "parent",
        budgetUsd: 0,
        text: "Please provide your phone to the teacher",
      }).some((r) => r.level === "block"),
    ).toBe(true);
    expect(
      compliance({
        audience: "parent",
        budgetUsd: 0,
        text: "В вашем проекте укажите ваш телефон, учитель поможет",
      }).some((r) => r.level === "block"),
    ).toBe(true);
  });

  it("allows the optional mentor warning to be disabled independently", () => {
    expect(
      compliance(
        { audience: "parent", budgetUsd: 0, text: "Create a project" },
        { pii: true, adult: true, mention: false },
      )[0].level,
    ).toBe("pass");
  });

  it.each(["ru", "en"])(
    "adapts deterministic %s parent and teacher templates",
    (language) => {
      const config = {
        country: "UZ",
        audience: "parent",
        channel: "instagram",
        language,
        tone: "friendly",
      };
      const parent = messageVariants(config);
      expect(parent).toEqual(messageVariants(config));
      expect(parent.map((v) => v.label)).toEqual(["A", "B", "C"]);
      expect(new Set(parent.map((v) => v.text)).size).toBe(3);
      expect(
        parent.every(
          (v) => v.text.includes("instagram") && v.text.includes("friendly"),
        ),
      ).toBe(true);
      expect(parent[0].text).toMatch(
        language === "ru" ? /портфолио/ : /portfolio/,
      );
      const teacher = messageVariants({ ...config, audience: "teacher" });
      expect(teacher[0].text).toMatch(
        language === "ru" ? /4 занятий/ : /four-lesson/,
      );
      expect(() => messageVariants(config, "openai")).toThrow(
        "LLM_PROVIDER=mock",
      );
    },
  );

  it("returns complete zero funnel and exactly ten stage buckets", () => {
    expect(funnel([])).toEqual({
      visit: 0,
      registered: 0,
      started: 0,
      published: 0,
    });
    expect(attribute([{ type: "visit", linkCode: "a" }], "b")).toEqual([]);
    const stages = stageDistribution([
      { stage: 0 },
      { stage: 1 },
      { stage: 10 },
      { stage: 10 },
    ]);
    expect(stages).toHaveLength(10);
    expect(stages[0]).toEqual({ stage: 1, count: 1 });
    expect(stages[9]).toEqual({ stage: 10, count: 2 });
    expect(stages.reduce((n, s) => n + s.count, 0)).toBe(3);
    expect(cpa(0, 1)).toBe(0);
    expect(points(2, 3, { started: 2, published: 5 })).toBe(19);
  });
});

describe("ambassador anti-fraud and accounting boundaries", () => {
  it.each([
    [0, "Bronze"],
    [199, "Bronze"],
    [200, "Silver"],
    [599, "Silver"],
    [600, "Gold"],
    [1499, "Gold"],
    [1500, "Lead"],
  ])("assigns %s points to %s", (value, name) => {
    expect(levelFor(Number(value)).name).toBe(name);
  });

  it("computes a zero balance from no ledger and permits an exact-balance redemption", () => {
    expect(balance([])).toBe(0);
    expect(redeemBalance(100, 100, 1)).toBe(0);
    expect(() => redeemBalance(100, 0, 1)).toThrow();
    expect(() => redeemBalance(100, -1, 1)).toThrow();
  });

  it("detects a burst at exactly 60 seconds but not outside the window", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      ts: new Date(i === 19 ? 60_000 : 0).toISOString(),
    }));
    expect(fraudCheck(events)).toBe(true);
    expect(
      fraudCheck([
        ...events.slice(0, 19),
        { ts: new Date(60_001).toISOString() },
      ]),
    ).toBe(false);
    expect(fraudCheck(events.slice(0, 19))).toBe(false);
    expect(fraudCheck([])).toBe(false);
  });

  it("sorts event time before checking bursts and detects case-insensitive duplicate handles", () => {
    expect(
      fraudCheck(
        Array.from({ length: 20 }, (_, i) => ({
          ts: new Date((19 - i) * 1000).toISOString(),
        })),
      ),
    ).toBe(true);
    expect(
      fraudCheck([
        { ts: new Date(0).toISOString(), nickname: "Orbit42" },
        { ts: new Date(86400000).toISOString(), nickname: "orbit42" },
      ]),
    ).toBe(true);
    expect(
      fraudCheck([
        { ts: new Date(0).toISOString(), nickname: "Orbit42" },
        { ts: new Date(86400000).toISOString(), nickname: "Pixel43" },
      ]),
    ).toBe(false);
  });
});

describe("challenge scoring and ranking boundaries", () => {
  it("honors auto-only and judge-only weights and caps the auto component", () => {
    expect(challengeScore(100, 20, 10, 70, 1)).toBe(100);
    expect(challengeScore(1, 0, 1, 70, 0)).toBe(70);
    expect(() => challengeScore(1, 0, 1, 70, -0.1)).toThrow();
    expect(() => challengeScore(1, 0, 1, 70, 1.1)).toThrow();
  });

  it.each([
    [[], []],
    [[10], [1, 2]],
    [[-1], [1]],
    [[101], [1]],
    [[Number.NaN], [1]],
    [[20], [-1]],
    [[20], [Number.NaN]],
    [[20], [0]],
  ])("rejects invalid rubric scores %j and weights %j", (scores, weights) => {
    expect(() => rubricScore(scores, weights)).toThrow("Invalid rubric");
  });

  it("normalizes arbitrary nonnegative rubric weights", () => {
    expect(rubricScore([20, 80], [0, 3])).toBe(80);
    expect(rubricScore([0, 100], [2, 2])).toBe(50);
  });

  it("does not award streak for duplicate dates, gaps or two days", () => {
    for (const days of [
      [],
      ["2026-01-01", "2026-01-01", "2026-01-02"],
      ["2026-01-01", "2026-01-02"],
      ["2026-01-01", "2026-01-03", "2026-01-04"],
    ]) {
      expect(
        badges({ started: 1, published: 0, countries: ["KZ", "KZ"], days }),
      ).toEqual(["First step"]);
    }
    expect(
      badges({
        started: 1,
        published: 0,
        countries: ["KZ"],
        days: ["2026-01-03", "2026-01-01", "2026-01-02"],
      }),
    ).toContain("Streak");
  });

  it("accepts boundary team sizes and rejects duplicate opaque members", () => {
    const members = Array.from({ length: 5 }, (_, i) => ({
      studentRef: `student-${i}`,
      nickname: `Orbit${i}`,
    }));
    expect(() => validateTeam(members.slice(0, 2))).not.toThrow();
    expect(() => validateTeam(members)).not.toThrow();
    expect(() => validateTeam([...members, members[0]])).toThrow("2–5");
    expect(() => validateTeam([members[0], members[0]])).toThrow("Duplicate");
  });

  it("uses points, published count, earlier timestamp, then ID without mutating input", () => {
    const base = { points: 10, published: 1, ts: "2026-01-02" };
    const input = [
      { ...base, id: "z" },
      { ...base, id: "a" },
      { ...base, id: "high", points: 11 },
      { ...base, id: "pub", published: 2 },
      { ...base, id: "early", ts: "2026-01-01" },
    ];
    const before = input.map((x) => ({ ...x }));
    expect(rank(input).map((r) => r.id)).toEqual([
      "high",
      "pub",
      "early",
      "a",
      "z",
    ]);
    expect(input).toEqual(before);
    expect(rank([])).toEqual([]);
  });
});

describe("class imports, consent, health and exports", () => {
  it("accepts BOM, CRLF, quotes, blank rows and a case-insensitive header", () => {
    expect(
      parseNicknameCsv('\uFEFFNICKNAME\r\n"Orbit42"\r\n\r\n Pixel43 \r\n'),
    ).toEqual({ valid: ["Orbit42", "Pixel43"], errors: [] });
    expect(parseNicknameCsv("")).toEqual({ valid: [], errors: [] });
  });

  it("identifies duplicate, multi-column, short and long rows without losing valid handles", () => {
    const parsed = parseNicknameCsv(
      `nickname\nOrbit42\nOrbit42\nNova,IN\nx\n${"a".repeat(41)}\nPixel43`,
    );
    expect(parsed.valid).toEqual(["Orbit42", "Pixel43"]);
    expect(parsed.errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(parsed.errors[0].message).toContain("Duplicate");
    expect(parsed.errors[1].message).toContain("One nickname");
  });

  it.each(["lead", "pilot", "active", "paused"])(
    "never activates %s school codes without consent",
    (status) => {
      expect(codeActive(false, status)).toBe(false);
      expect(codeActive(true, status)).toBe(status !== "paused");
    },
  );

  it("computes all activation numerators and denominators", () => {
    expect(activationHealth([])).toEqual({
      total: 0,
      started: 0,
      published: 0,
      startedShare: 0,
      publishedShare: 0,
    });
    expect(
      activationHealth([
        { stage: 0, status: "none" },
        { stage: 2, status: "started" },
        { stage: 10, status: "published" },
        { stage: 10, status: "published" },
      ]),
    ).toEqual({
      total: 4,
      started: 3,
      published: 2,
      startedShare: 0.75,
      publishedShare: 0.5,
    });
  });

  it("preserves old season snapshots and exports literal CSV cells", () => {
    const previous = [{ season: "a", points: 10 }];
    const snapshot = { season: "b", points: 0 };
    expect(seasonRollover(previous, snapshot)).toEqual([...previous, snapshot]);
    expect(previous).toEqual([{ season: "a", points: 10 }]);
    expect(csv([])).toBe("No data\n");
    const exported = csv([
      { name: '"Orbit"', note: null },
      { name: "=1+1", note: "a,b" },
      { name: "+99", note: "@handle" },
      { name: "-20", note: undefined },
    ]);
    expect(exported).toContain('"""Orbit"""');
    expect(exported).toContain('"\'=1+1"');
    expect(exported).toContain('"\'+99"');
    expect(exported).toContain('"\'@handle"');
    expect(exported).toContain('"\'-20"');
    expect(exported).toContain('"a,b"');
  });
});
