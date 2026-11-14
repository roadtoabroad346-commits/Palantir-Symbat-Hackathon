import { MockAiStartifyClient, points, csv, rank } from "../index";
import type { AiStartifyClient } from "../index";
import {
  uid,
  now,
  field,
  required,
  number,
  publicText,
  add,
  get,
} from "./common";
import type { Database, Row, View } from "./types";
export async function activeSeason(tx: Database) {
  const s = await tx.season.findFirst({ where: { active: true } });
  if (!s) throw new Error("No active season / Нет активного сезона");
  return s;
}
export async function leagueRanking(tx: Database, seasonId?: string) {
  const season = seasonId
    ? await get(tx, "season", seasonId)
    : await activeSeason(tx);
  const schools = await tx.school.findMany();
  const snaps = await tx.pointsSnapshot.findMany({
    where: { seasonId: season.id },
  });
  return rank(
    schools.map((s) => {
      const snap = snaps.find((p) => p.schoolId === s.id);
      return {
        id: String(s.id),
        name: String(s.name),
        country: String(s.country),
        city: String(s.city),
        slug: String(s.slug),
        started: snap?.started ?? 0,
        published: snap?.published ?? 0,
        points: points(snap?.started ?? 0, snap?.published ?? 0),
        ts: new Date(snap?.ts ?? season.startAt).toISOString(),
      };
    }),
  );
}
export function createLeague(db: Database, platform: AiStartifyClient) {
  async function leagueMutate(op: string, d: Row, role: string) {
    if (op === "joinSchool") {
      const code = required(d, "schoolCode");
      if (!(await platform.verifySchoolCode(code)).valid)
        throw new Error(
          "Invalid school code. Try START-001 / Неверный код школы. Демо: START-001",
        );
      const s = await db.school.findUnique({ where: { code } });
      if (!s) throw new Error("School not available in this demo");
      return { redirect: "/?selection=" + s.id };
    }
    if (op === "publish") {
      if (!["student", "teacher"].includes(role))
        throw new Error(
          "Select student or teacher role / Выберите роль ученика или учителя",
        );
      const schoolId = required(d, "schoolId");
      const s = await get(db, "school", schoolId);
      if (!(await platform.verifySchoolCode(s.code)).valid)
        throw new Error("Invalid school code");
      const nick = publicText(d, "nickname"),
        title = publicText(d, "title"),
        idea = publicText(d, "idea");
      if (nick.length > 40 || title.length > 60 || idea.length > 160)
        throw new Error(
          "Use at most 40/60/160 characters for nickname/title/idea / Максимум 40/60/160 символов для никнейма/названия/идеи",
        );
      return db.$transaction(async (tx) => {
        const season = await activeSeason(tx);
        if (season.frozen)
          throw new Error(
            "Season frozen. Ask a teacher to start a new season / Сезон заморожен. Учитель может начать новый",
          );
        const id = uid(),
          projectId = uid();
        await add(tx, "student", {
          id,
          schoolId,
          nickname: nick,
          studentRef: uid(),
        });
        await add(tx, "project", {
          id: projectId,
          studentId: id,
          title,
          idea,
          status: "published",
          passportId: "DEMO-" + projectId.slice(0, 8),
          publishedAt: now(),
        });
        const snap = await tx.pointsSnapshot.findFirst({
          where: { seasonId: season.id, schoolId },
        });
        if (snap)
          await tx.pointsSnapshot.update({
            where: { id: snap.id },
            data: {
              started: { increment: 1 },
              published: { increment: 1 },
              points: { increment: points(1, 1) },
            },
          });
        else
          await add(tx, "pointsSnapshot", {
            id: `${season.id}:${schoolId}`,
            seasonId: season.id,
            schoolId,
            started: 1,
            published: 1,
            points: points(1, 1),
          });
        return {
          redirect: "/card?selection=" + schoolId,
          message:
            "Published. League rankings updated / Опубликовано. Рейтинг обновлён",
        };
      });
    }
    if (role !== "teacher")
      throw new Error("Select teacher role / Выберите роль учителя");
    if (op === "freeze") {
      const season = await activeSeason(db);
      await db.season.update({
        where: { id: season.id },
        data: { frozen: true },
      });
      return {
        message:
          "Season frozen; history retained / Сезон заморожен, история сохранена",
      };
    }
    if (op === "newSeason") {
      const title = publicText(d, "title");
      return db.$transaction(async (tx) => {
        await tx.season.updateMany({
          where: { active: true },
          data: { active: false, frozen: true },
        });
        const id = uid();
        await add(tx, "season", {
          id,
          title,
          startAt: now(),
          endAt: new Date(Date.now() + 90 * 86400000),
          active: true,
          frozen: false,
        });
        for (const s of await tx.school.findMany())
          await add(tx, "pointsSnapshot", {
            id: `${id}:${s.id}`,
            seasonId: id,
            schoolId: s.id,
            started: 0,
            published: 0,
            points: 0,
          });
        return {
          message:
            "New season started; past standings preserved / Новый сезон начат, прошлые результаты сохранены",
        };
      });
    }
    if (op === "simulate") {
      return db.$transaction(async (tx) => {
        const season = await activeSeason(tx);
        if (season.frozen) throw new Error("Season frozen / Сезон заморожен");
        const n = number(d, "n", 1, 100);
        const students = await tx.student.findMany({ take: n });
        for (let i = 0; i < students.length; i++) {
          const s = students[i];
          const mock = new MockAiStartifyClient([
            {
              studentRef: s.studentRef,
              nickname: s.nickname,
              schoolCode: "demo",
              stage: i % 2 ? 9 : 0,
              status: "started",
            },
          ]);
          mock.advanceSchool("demo");
          const client: AiStartifyClient = mock;
          const p = await client.getProgress(s.studentRef);
          const published = p?.status === "published";
          const snapshot = await tx.pointsSnapshot.findFirst({
            where: { seasonId: season.id, schoolId: s.schoolId },
          });
          if (!snapshot) continue;
          await tx.pointsSnapshot.update({
            where: { id: snapshot.id },
            data: {
              started: { increment: 1 },
              published: { increment: published ? 1 : 0 },
              points: { increment: points(1, published ? 1 : 0) },
            },
          });
          await add(tx, "project", {
            id: uid(),
            studentId: s.id,
            title: "demo-orbit",
            idea: "A small idea for a better school / Идея для школы",
            status: published ? "published" : "started",
            passportId: "DEMO-SIM",
            publishedAt: published ? now() : null,
          });
        }
        return { message: "League progress updated / Прогресс лиги обновлён" };
      });
    }
    throw new Error("Unknown action");
  }
  async function leagueView(v: View) {
    const season = await activeSeason(db);
    const ranking = await leagueRanking(db);
    const selected =
      ranking.find((s) => s.id === v.extra?.selection) ?? ranking[0];
    v.extra = { ...v.extra, selection: selected.id };
    v.metrics = [
      { label: "Школы|Schools", value: ranking.length },
      {
        label: "Начаты|Started",
        value: ranking.reduce((n, s) => n + s.started, 0),
      },
      {
        label: "Опубликованы|Published",
        value: ranking.reduce((n, s) => n + s.published, 0),
      },
      { label: "Баллы вашей школы|Your school points", value: selected.points },
    ];
    v.cards.push({
      title: season.title,
      text: `${new Date(season.startAt).toISOString().slice(0, 10)} → ${new Date(season.endAt).toISOString().slice(0, 10)}\n${season.frozen ? "Заморожен|Frozen" : "Активный сезон|Active season"}`,
      tag: "⚑",
    });
    if (v.path === "/join")
      v.forms.push({
        title: "Найдите вашу школу|Find your school",
        op: "joinSchool",
        fields: [
          field(
            "schoolCode",
            "Код школы|School code",
            "text",
            undefined,
            "START-001",
          ),
        ],
      });
    else if (v.path === "/card") {
      const students = await db.student.findMany({
        where: { schoolId: selected.id },
      });
      const p = await db.project.findFirst({
        where: {
          studentId: { in: students.map((s) => s.id) },
          status: "published",
        },
        orderBy: { createdAt: "desc" },
      });
      if (p) {
        const student = students.find((s) => s.id === p.studentId);
        const s = await get(db, "school", selected.id);
        v.extra = {
          ...v.extra,
          project: {
            ...p,
            nickname: student?.nickname,
            school: s.name,
            country: s.country,
            code: s.code,
          },
        };
      }
      v.forms.push({
        title: "Опубликуйте карточку основателя|Publish your founder card",
        op: "publish",
        hidden: { schoolId: selected.id },
        button: "Опубликовать и обновить рейтинг|Publish and update league",
        fields: [
          {
            ...field(
              "nickname",
              "Никнейм (до 40 символов)|Nickname (up to 40 characters)",
            ),
            value: "Nova42",
          },
          field(
            "title",
            "Название проекта (до 60 символов)|Project title (up to 60 characters)",
            "text",
            undefined,
            "eco orbit",
          ),
          field(
            "idea",
            "Идея в одной строке (до 160 символов)|One-line idea (up to 160 characters)",
            "textarea",
            undefined,
            "a greener playground",
          ),
        ],
      });
      v.cards.push({
        title: "Ваша школа|Your school",
        text: `${selected.name} · ${selected.country}`,
        href: "/?selection=" + selected.id,
        tag: "↗",
      });
    } else if (v.path.startsWith("/schools/")) {
      const s = await db.school.findUnique({
        where: { slug: v.path.split("/")[2] },
      });
      if (!s) throw new Error("School not found");
      v.title = s.name;
      const students = await db.student.findMany({ where: { schoolId: s.id } });
      const projects = await db.project.findMany({
        where: {
          studentId: { in: students.map((s) => s.id) },
          status: "published",
        },
      });
      v.cards.push(
        ...projects.slice(0, 20).map((p) => ({
          title: p.title,
          text: `${students.find((s) => s.id === p.studentId)?.nickname} · ${s.country}\n${p.idea}`,
          tag: "✦",
        })),
      );
      const history = await db.pointsSnapshot.findMany({
        where: { schoolId: s.id },
      });
      v.tables.push({
        title: "История сезонов|Season history",
        columns: [
          "Сезон|Season",
          "Начаты|Started",
          "Опубликованы|Published",
          "Баллы|Points",
        ],
        rows: history.map((p) => [
          p.seasonId,
          p.started,
          p.published,
          p.points,
        ]),
      });
    } else if (v.path === "/admin") {
      v.forms.push(
        {
          title: "Начать новый сезон|Start a new season",
          op: "newSeason",
          fields: [
            field(
              "title",
              "Название сезона|Season title",
              "text",
              undefined,
              "next orbit",
            ),
          ],
        },
        {
          title: "Зафиксировать текущий сезон|Freeze current season",
          op: "freeze",
          fields: [],
        },
      );
      const seasons = await db.season.findMany();
      v.tables.push({
        title: "Сезоны|Seasons",
        columns: ["Название|Title", "Активен|Active", "Заморожен|Frozen"],
        rows: seasons.map((s) => [s.title, String(s.active), String(s.frozen)]),
      });
    } else {
      v.tables.push({
        title: "Школы|Schools",
        columns: [
          "#",
          "Школа|School",
          "Страна|Country",
          "Начаты|Started",
          "Опубликованы|Published",
          "Баллы|Points",
          "Профиль|Profile",
        ],
        rows: ranking.map((r, i) => [
          i + 1,
          r.id === selected.id ? "★ " + r.name : r.name,
          r.country,
          r.started,
          r.published,
          r.points,
          "/schools/" + r.slug,
        ]),
      });
      for (const key of ["country", "city"] as const) {
        const groups = new Map<
          string,
          {
            points: number;
            published: number;
            started: number;
            ts: string;
            id: string;
          }
        >();
        for (const r of ranking) {
          const g = groups.get(r[key]) ?? {
            points: 0,
            published: 0,
            started: 0,
            ts: r.ts,
            id: r[key],
          };
          groups.set(r[key], {
            ...g,
            points: g.points + r.points,
            published: g.published + r.published,
            started: g.started + r.started,
            ts: g.ts < r.ts ? g.ts : r.ts,
          });
        }
        v.tables.push({
          title: key === "country" ? "Страны|Countries" : "Города|Cities",
          columns: [
            "#",
            "Название|Name",
            "Начаты|Started",
            "Опубликованы|Published",
            "Баллы|Points",
          ],
          rows: rank([...groups.values()]).map((r, i) => [
            i + 1,
            r.id,
            r.started,
            r.published,
            r.points,
          ]),
        });
      }
    }
  }
  async function exportCsv(_reportId?: string) {
    return csv(await leagueRanking(db));
  }
  return { mutate: leagueMutate, view: leagueView, exportCsv };
}
