export type Language = "ru" | "en";
export type ProjectStatus = "none" | "started" | "published";
export interface StudentProgress {
  studentRef: string;
  nickname: string;
  schoolCode: string;
  stage: number;
  status: ProjectStatus;
}
export type PlatformEvent =
  | {
      type: "user_registered";
      studentRef: string;
      schoolCode?: string;
      referralCode?: string;
      country: string;
      ts: string;
    }
  | { type: "project_started"; studentRef: string; ts: string }
  | {
      type: "project_published";
      studentRef: string;
      projectId: string;
      ts: string;
    };
export interface AiStartifyClient {
  verifySchoolCode(
    code: string,
  ): Promise<{ valid: boolean; schoolName?: string; country?: string }>;
  getProgress(ref: string): Promise<StudentProgress | null>;
  listProgressBySchool(code: string): Promise<StudentProgress[]>;
  createReferral(
    ownerRef: string,
    channel: string,
  ): Promise<{ code: string; url: string }>;
  subscribe(handler: (e: PlatformEvent) => void): () => void;
}
export const countries = [
  ["KZ", "Казахстан", "Kazakhstan", "🇰🇿", "ru"],
  ["UZ", "Узбекистан", "Uzbekistan", "🇺🇿", "ru"],
  ["KG", "Кыргызстан", "Kyrgyzstan", "🇰🇬", "ru"],
  ["IN", "Индия", "India", "🇮🇳", "en"],
  ["NG", "Нигерия", "Nigeria", "🇳🇬", "en"],
  ["PH", "Филиппины", "Philippines", "🇵🇭", "en"],
  ["TR", "Турция", "Turkey", "🇹🇷", "en"],
  ["VN", "Вьетнам", "Vietnam", "🇻🇳", "en"],
  ["ID", "Индонезия", "Indonesia", "🇮🇩", "en"],
  ["KE", "Кения", "Kenya", "🇰🇪", "en"],
].map(([code, ru, en, flag, language]) => ({ code, ru, en, flag, language }));
export const countryName = (code: string, lang: Language) => {
  const c = countries.find((c) => c.code === code);
  return c ? `${c.flag} ${c[lang]}` : code;
};
export const t = (lang: Language, ru: string, en: string) =>
  lang === "ru" ? ru : en;
export const dictionary = {
  ru: {
    demo: "Демоданные",
    simulate: "Симулировать активность",
    save: "Сохранить",
    empty: "Пока пусто. Создайте первую запись.",
    signIn: "Войти как…",
  },
  en: {
    demo: "Demo data",
    simulate: "Simulate activity",
    save: "Save",
    empty: "Nothing here yet. Create your first record.",
    signIn: "Sign in as…",
  },
};
export function seededRandom(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export const nickname = (i: number) =>
  ["Orbit", "Comet", "Pixel", "Nova", "Cedar", "Spark", "Luna", "Mango"][
    i % 8
  ] + String(i + 10);
export const schoolCode = (i: number) =>
  `START-${String(i + 1).padStart(3, "0")}`;
export function seedStudents(n: number, schools = 8): StudentProgress[] {
  const r = seededRandom();
  return Array.from({ length: n }, (_, i) => {
    const stage = Math.floor(r() * 11);
    return {
      studentRef: `stu-${i}`,
      nickname: nickname(i),
      schoolCode: schoolCode(i % schools),
      stage,
      status: stage === 10 ? "published" : stage > 0 ? "started" : "none",
    };
  });
}
export class MockAiStartifyClient implements AiStartifyClient {
  private handlers = new Set<(e: PlatformEvent) => void>();
  private counter = 0;
  constructor(
    public students: StudentProgress[] = seedStudents(40),
    public schools = Array.from({ length: 20 }, (_, i) => ({
      code: schoolCode(i),
      name: `School ${i + 1}`,
      country: countries[i % 6].code,
    })),
  ) {}
  async verifySchoolCode(code: string) {
    const s = this.schools.find((s) => s.code === code);
    return s
      ? { valid: true, schoolName: s.name, country: s.country }
      : { valid: false };
  }
  async getProgress(ref: string) {
    return this.students.find((s) => s.studentRef === ref) ?? null;
  }
  async listProgressBySchool(code: string) {
    return this.students.filter((s) => s.schoolCode === code);
  }
  async createReferral(owner: string, channel: string) {
    const code = `${owner.replace(/[^a-z0-9-]/gi, "")}-${channel}`;
    return { code, url: `/r/${code}` };
  }
  subscribe(h: (e: PlatformEvent) => void) {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }
  private emit(e: PlatformEvent) {
    this.handlers.forEach((h) => h(e));
  }
  simulateRegistrations(n: number, referralCode = "demo") {
    for (let i = 0; i < n; i++) {
      const ref = `sim-${this.counter++}`;
      this.students.push({
        studentRef: ref,
        nickname: nickname(this.counter),
        schoolCode: schoolCode(i % 8),
        stage: 0,
        status: "none",
      });
      this.emit({
        type: "user_registered",
        studentRef: ref,
        referralCode,
        country: countries[i % 6].code,
        ts: new Date().toISOString(),
      });
    }
  }
  advanceSchool(code: string) {
    for (const s of this.students.filter((s) => s.schoolCode === code)) {
      const before = s.stage;
      s.stage = Math.min(10, s.stage + 1);
      s.status = s.stage === 10 ? "published" : "started";
      if (before === 0)
        this.emit({
          type: "project_started",
          studentRef: s.studentRef,
          ts: new Date().toISOString(),
        });
      if (before === 9)
        this.emit({
          type: "project_published",
          studentRef: s.studentRef,
          projectId: `p-${s.studentRef}`,
          ts: new Date().toISOString(),
        });
    }
  }
}
export class HttpAiStartifyClient implements AiStartifyClient {
  // Replace these methods with authenticated real AI Startify API calls once a contract is available.
  private fail(): never {
    throw new Error(
      "AI Startify HTTP client not implemented. Use MockAiStartifyClient.",
    );
  }
  async verifySchoolCode(_code: string): Promise<{ valid: boolean }> {
    return this.fail();
  }
  async getProgress(_ref: string): Promise<StudentProgress | null> {
    return this.fail();
  }
  async listProgressBySchool(_code: string): Promise<StudentProgress[]> {
    return this.fail();
  }
  async createReferral(
    _owner: string,
    _channel: string,
  ): Promise<{ code: string; url: string }> {
    return this.fail();
  }
  subscribe(_handler: (e: PlatformEvent) => void): () => void {
    return this.fail();
  }
}
export function piiGuard(text: string): string[] {
  const errors: string[] = [];
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text))
    errors.push("Email addresses are not allowed / Email запрещён");
  if (/(?:\+?\d[\s().-]*){7,}/.test(text))
    errors.push("Phone-like numbers are not allowed / Телефон запрещён");
  if (
    /(?:^|\s)[A-ZА-ЯЁ][a-zа-яё]{2,}\s+[A-ZА-ЯЁ][a-zа-яё]{2,}(?:\s|$)/u.test(
      text,
    )
  )
    errors.push(
      "Use a nickname, not a full name / Используйте никнейм вместо ФИО",
    );
  return errors;
}
export function assertPublic(...texts: string[]) {
  const errors = texts.flatMap(piiGuard);
  if (errors.length) throw new Error(errors.join("; "));
}
export function points(
  started: number,
  published: number,
  weights = { started: 1, published: 10 },
) {
  return started * weights.started + published * weights.published;
}
export type FunnelEvent = {
  type: string;
  linkCode?: string;
  country?: string;
  campaignId?: string;
  channel?: string;
};
export function funnel(events: FunnelEvent[]) {
  return Object.fromEntries(
    ["visit", "registered", "started", "published"].map((k) => [
      k,
      events.filter((e) => e.type === k).length,
    ]),
  ) as Record<"visit" | "registered" | "started" | "published", number>;
}
export function stageDistribution(students: Pick<StudentProgress, "stage">[]) {
  return Array.from({ length: 10 }, (_, i) => ({
    stage: i + 1,
    count: students.filter((s) => s.stage === i + 1).length,
  }));
}
export function attribute(events: FunnelEvent[], code: string) {
  return events.filter((e) => e.linkCode === code);
}
export const cpa = (budget: number, count: number) =>
  count > 0 ? budget / count : null;
export function compliance(
  c: { audience: string; budgetUsd: number; text: string; minAge?: number },
  rules = { pii: true, adult: true, mention: true },
) {
  const result: { level: "pass" | "warn" | "block"; reason: string }[] = [];
  if (
    rules.adult &&
    c.budgetUsd > 0 &&
    (c.audience === "student" || (c.minAge ?? 18) < 18)
  )
    result.push({
      level: "block",
      reason:
        "Paid campaigns require an adult audience (18+) / Платная реклама только для 18+",
    });
  if (
    rules.pii &&
    (piiGuard(c.text).length ||
      /(?:your|send|enter|provide).{0,20}(?:email|phone|full name)|(?:ваш|введите|пришлите).{0,20}(?:телефон|почт|фио)/i.test(
        c.text,
      ))
  )
    result.push({
      level: "block",
      reason:
        "Copy requests or contains personal data / Текст содержит или запрашивает личные данные",
    });
  if (rules.mention && !/parent|teacher|родител|учител/i.test(c.text))
    result.push({
      level: "warn",
      reason:
        "Mention a parent or teacher / Добавьте упоминание родителя или учителя",
    });
  return result.length
    ? result
    : [{ level: "pass" as const, reason: "Checks passed / Проверки пройдены" }];
}
export function messageVariants(
  c: {
    country: string;
    audience: string;
    channel: string;
    language: string;
    tone: string;
  },
  provider = "mock",
) {
  if (provider !== "mock")
    throw new Error("LLM provider not implemented. Set LLM_PROVIDER=mock.");
  const ru = c.language === "ru";
  return ["A", "B", "C"].map((label, i) => ({
    label,
    text: ru
      ? `${["Дайте идее старт!", "От идеи к проекту.", "Пора создавать!"][i]} ${c.audience === "parent" ? "Родители: помогите собрать портфолио для учёбы за рубежом." : "Учителя: готовый клуб из 4 занятий помогает ученикам создать стартап."} ${countryName(c.country, "ru")} · ${c.channel} · ${c.tone}. Пройдите 10 этапов с AI Startify вместе со взрослым наставником.`
      : `${["Give your idea a start!", "Turn ideas into projects.", "Time to create!"][i]} ${c.audience === "parent" ? "Parents: build a project portfolio for study abroad." : "Teachers: use a ready four-lesson startup club kit."} ${countryName(c.country, "en")} · ${c.channel} · ${c.tone}. Explore 10 AI Startify stages with an adult mentor.`,
  }));
}
export const levels = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 200 },
  { name: "Gold", min: 600 },
  { name: "Lead", min: 1500 },
];
export const levelFor = (balance: number) =>
  [...levels].reverse().find((l) => balance >= l.min) ?? levels[0];
export const balance = (ledger: { delta: number }[]) =>
  ledger.reduce((s, r) => s + r.delta, 0);
export function redeemBalance(current: number, cost: number, stock: number) {
  if (cost <= 0 || stock < 1 || current < cost)
    throw new Error(
      "Insufficient points or stock / Недостаточно баллов или наград",
    );
  return current - cost;
}
export function fraudCheck(events: { ts: string; nickname?: string }[]) {
  const ts = events.map((e) => new Date(e.ts).getTime()).sort((a, b) => a - b);
  return (
    ts.some((v, i) => i >= 19 && v - ts[i - 19] <= 60000) ||
    new Set(events.map((e) => e.nickname?.toLowerCase()).filter(Boolean)).size <
      events.filter((e) => e.nickname).length
  );
}
export function challengeScore(
  started: number,
  published: number,
  avgStage: number,
  judge: number,
  autoWeight = 0.5,
) {
  if (autoWeight < 0 || autoWeight > 1) throw new Error("Invalid weight");
  return (
    Math.min(100, points(started, published) + avgStage * 0.5) * autoWeight +
    judge * (1 - autoWeight)
  );
}
export function rubricScore(scores: number[], weights: number[]) {
  if (
    scores.length !== weights.length ||
    !scores.length ||
    scores.some((s) => !Number.isFinite(s) || s < 0 || s > 100) ||
    weights.some((w) => !Number.isFinite(w) || w < 0) ||
    weights.reduce((a, b) => a + b, 0) <= 0
  )
    throw new Error("Invalid rubric");
  return (
    scores.reduce((s, v, i) => s + v * weights[i], 0) /
    weights.reduce((a, b) => a + b, 0)
  );
}
export function badges(p: {
  started: number;
  published: number;
  countries: string[];
  days: string[];
}) {
  const days = [...new Set(p.days)].sort().map((d) => Date.parse(d));
  const streak = days.some(
    (d, i) =>
      i > 1 &&
      d - days[i - 1] === 86400000 &&
      days[i - 1] - days[i - 2] === 86400000,
  );
  return [
    p.started > 0 ? "First step" : "",
    p.published > 0 ? "Published" : "",
    new Set(p.countries).size > 1 ? "Cross-border team" : "",
    streak ? "Streak" : "",
  ].filter(Boolean);
}
export function rank<
  T extends { points: number; published: number; ts: string; id: string },
>(rows: T[]) {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.published - a.published ||
      a.ts.localeCompare(b.ts) ||
      a.id.localeCompare(b.id),
  );
}
export function validateTeam(
  members: { nickname: string; studentRef: string }[],
) {
  if (members.length < 2 || members.length > 5)
    throw new Error(
      "Teams need 2–5 members / В команде должно быть 2–5 участников",
    );
  if (new Set(members.map((m) => m.studentRef)).size !== members.length)
    throw new Error("Duplicate member");
  members.forEach((m) => {
    if (
      typeof m.nickname !== "string" ||
      !m.nickname.trim() ||
      typeof m.studentRef !== "string" ||
      !m.studentRef.trim()
    )
      throw new Error(
        "A nickname and opaque reference are required / Нужны никнейм и идентификатор",
      );
    assertPublic(m.nickname);
  });
}
export function parseNicknameCsv(csv: string) {
  const rows = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  const valid: string[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((line, i) => {
    const name = line.trim().replace(/^"|"$/g, "");
    if (!name || (i === 0 && /^nickname$/i.test(name))) return;
    const issues = piiGuard(name);
    if (name.includes(",") || name.length > 40 || name.length < 2)
      issues.push(
        "One nickname per row (2–40 characters) / Один никнейм в строке",
      );
    if (valid.includes(name))
      issues.push("Duplicate nickname / Повтор никнейма");
    if (issues.length) errors.push({ row: i + 1, message: issues.join("; ") });
    else valid.push(name);
  });
  return { valid, errors };
}
export const codeActive = (consent: boolean, status: string) =>
  consent && status !== "paused";
export function activationHealth(
  students: { stage: number; status: string }[],
) {
  const total = students.length;
  return {
    total,
    started: students.filter((s) => s.stage > 0).length,
    published: students.filter((s) => s.status === "published").length,
    startedShare: total
      ? students.filter((s) => s.stage > 0).length / total
      : 0,
    publishedShare: total
      ? students.filter((s) => s.status === "published").length / total
      : 0,
  };
}
export function seasonRollover<T>(history: T[], snapshot: T) {
  return [...history, snapshot];
}
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "No data\n";
  const keys = Object.keys(rows[0]);
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n")
  );
}
