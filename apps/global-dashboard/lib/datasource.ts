import { randomUUID } from "node:crypto";
import {
  assertPublic,
  MockAiStartifyClient,
  seededRandom,
  type AiStartifyClient,
} from "@startify/shared";
import type { PrismaClient } from "../generated/client";
import { COUNTRIES, TARGETS, startMonth } from "../config/targets";
import { DIRECTIONS } from "../config/directions";
import { captureScore } from "./logic";
import { createSeed } from "./seed-data";
import type {
  DashboardState,
  FeedbackInput,
  Feedback,
  Pulse,
  FeedbackStatus,
  DirectionKey,
} from "./types";
export interface DashboardDataSource {
  read(): Promise<DashboardState>;
  simulate(month: number): Promise<{ state: DashboardState; pulses: Pulse[] }>;
  addFeedback(
    input: FeedbackInput,
  ): Promise<{ state: DashboardState; feedback: Feedback }>;
  updateFeedback(
    id: string,
    action: "vote" | "status",
    status?: FeedbackStatus,
    admin?: boolean,
  ): Promise<{ state: DashboardState }>;
}
export async function seedDatabase(db: PrismaClient) {
  if (await db.country.count()) return;
  const seed = createSeed();
  await db.$transaction([
    db.country.createMany({ data: seed.countries }),
    db.countryDirectionMonthly.createMany({ data: seed.metrics }),
    db.globalMonthly.createMany({ data: seed.globals }),
    db.feedback.createMany({
      data: seed.feedback.map((f) => ({
        ...f,
        createdAt: new Date(f.createdAt),
      })),
    }),
  ]);
}
function checkEnum(value: unknown, values: string[], name: string) {
  if (typeof value !== "string" || !values.includes(value))
    throw new Error(`Invalid ${name} / Проверьте поле ${name}`);
  return value;
}
function checkText(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(
      `${name}: use 1–${max} characters / Введите от1до${max} символов`,
    );
  assertPublic(value);
  return value.trim();
}
export class MockDataSource implements DashboardDataSource {
  constructor(private db: PrismaClient) {}
  async read(): Promise<DashboardState> {
    const [countries, metrics, globals, feedback] = await Promise.all([
      this.db.country.findMany({ orderBy: { iso: "asc" } }),
      this.db.countryDirectionMonthly.findMany({
        orderBy: [{ monthIndex: "asc" }, { iso: "asc" }, { direction: "asc" }],
      }),
      this.db.globalMonthly.findMany({ orderBy: { monthIndex: "asc" } }),
      this.db.feedback.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    return {
      countries,
      metrics: metrics as DashboardState["metrics"],
      globals,
      feedback: feedback.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
      })) as Feedback[],
    };
  }
  async simulate(month: number) {
    if (!Number.isInteger(month) || month < 0 || month > 12)
      throw new Error("Month must be 0–12 / Месяц должен быть от0до12");
    const current = await this.db.globalMonthly.findUniqueOrThrow({
      where: { monthIndex: month },
    });
    const rng = seededRandom(current.users + current.publishedProjects + month);
    const active = COUNTRIES.filter((c) => month >= startMonth(c));
    const c = active[Math.floor(rng() * active.length)],
      direction = DIRECTIONS[Math.floor(rng() * 5)].key;
    const mock = new MockAiStartifyClient([
      {
        studentRef: "pulse-founder",
        nickname: "Pulse42",
        schoolCode: "START-001",
        stage: 9,
        status: "started",
      },
    ]);
    const client: AiStartifyClient = mock;
    let registrations = 0,
      projects = 0;
    const off = client.subscribe((e) => {
      if (e.type === "user_registered") registrations++;
      if (e.type === "project_published") projects++;
    });
    mock.simulateRegistrations(12, "global-impact-demo");
    mock.advanceSchool("START-001");
    off();
    await this.db.$transaction(async (tx) => {
      const rows = await tx.countryDirectionMonthly.findMany({
        where: { iso: c.iso, monthIndex: { gte: month } },
      });
      for (const row of rows) {
        const key = row.direction as DirectionKey;
        const delta = {
          growth: registrations,
          ambassador: direction === "ambassador" ? registrations : 0,
          challenge: direction === "challenge" ? projects : 0,
          portal: direction === "portal" ? registrations : 0,
          league: projects,
        }[key];
        const primary = row.primaryMetric + delta;
        await tx.countryDirectionMonthly.update({
          where: {
            iso_direction_monthIndex: {
              iso: row.iso,
              direction: row.direction,
              monthIndex: row.monthIndex,
            },
          },
          data: {
            primaryMetric: primary,
            secondaryMetric: row.secondaryMetric + (key === direction ? 1 : 0),
            capture: captureScore(primary, TARGETS[c.iso][key]),
          },
        });
      }
      await tx.globalMonthly.updateMany({
        where: { monthIndex: { gte: month } },
        data: {
          users: { increment: registrations },
          publishedProjects: { increment: projects },
          activeCampaigns: { increment: direction === "growth" ? 1 : 0 },
          ambassadors: { increment: direction === "ambassador" ? 1 : 0 },
          schools: {
            increment: direction === "portal" || direction === "league" ? 1 : 0,
          },
        },
      });
    });
    return {
      state: await this.read(),
      pulses: [{ id: randomUUID(), iso: c.iso, direction }],
    };
  }
  async addFeedback(input: FeedbackInput) {
    const iso = checkEnum(
      input.iso,
      COUNTRIES.map((c) => c.iso),
      "country",
    );
    const direction = checkEnum(
      input.direction,
      DIRECTIONS.map((d) => d.key),
      "direction",
    );
    const authorType = checkEnum(
      input.authorType,
      ["ambassador", "student", "teacher"],
      "role",
    );
    const category = checkEnum(
      input.category,
      [
        "localization",
        "translation",
        "content",
        "ux",
        "feature",
        "compliance",
        "offline",
      ],
      "category",
    );
    const lang = checkEnum(input.lang, ["ru", "en"], "language");
    const nickname = checkText(input.nickname, "Nickname / Никнейм", 40),
      text = checkText(input.text, "Comment / Замечание", 1000);
    const row = await this.db.feedback.create({
      data: {
        id: randomUUID(),
        iso,
        direction,
        authorType,
        nickname,
        category,
        lang,
        textOriginal: text,
        textRu:
          lang === "ru"
            ? text
            : `Комментарий на английском (оригинал): ${text}`,
        textEn: lang === "en" ? text : `Comment in Russian (original): ${text}`,
        sentiment: "neutral",
        votes: 0,
        status: "new",
        createdAt: new Date(),
      },
    });
    const feedback = {
      ...row,
      createdAt: row.createdAt.toISOString(),
    } as Feedback;
    return { state: await this.read(), feedback };
  }
  async updateFeedback(
    id: string,
    action: "vote" | "status",
    status?: FeedbackStatus,
    admin = false,
  ) {
    if (action === "vote")
      await this.db.feedback.update({
        where: { id },
        data: { votes: { increment: 1 } },
      });
    else if (action === "status") {
      if (!admin)
        throw new Error(
          "Demo admin role required / Включите роль администратора",
        );
      checkEnum(status, ["new", "triaged", "planned", "shipped"], "status");
      await this.db.feedback.update({ where: { id }, data: { status } });
    } else throw new Error("Unknown action / Неизвестное действие");
    return { state: await this.read() };
  }
}
/** Future contract: every MVP exposes GET /api/metrics?country=&month= returning
 * {direction,primaryMetric,secondaryMetric}. Aggregate authenticated responses here.
 * No network requests are made by this stub. */
export class HttpDataSource implements DashboardDataSource {
  private unavailable(): never {
    throw new Error(
      "HTTP DashboardDataSource not implemented. Use MockDataSource.",
    );
  }
  async read(): Promise<DashboardState> {
    return this.unavailable();
  }
  async simulate(
    _month: number,
  ): Promise<{ state: DashboardState; pulses: Pulse[] }> {
    return this.unavailable();
  }
  async addFeedback(
    _input: FeedbackInput,
  ): Promise<{ state: DashboardState; feedback: Feedback }> {
    return this.unavailable();
  }
  async updateFeedback(
    _id: string,
    _action: "vote" | "status",
    _status?: FeedbackStatus,
    _admin?: boolean,
  ): Promise<{ state: DashboardState }> {
    return this.unavailable();
  }
}
