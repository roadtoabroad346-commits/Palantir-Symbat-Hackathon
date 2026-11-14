import {
  countries,
  MockAiStartifyClient,
  assertPublic,
  csv,
  rank,
  challengeScore,
  rubricScore,
  badges,
  validateTeam,
} from "../index";
import type { AiStartifyClient } from "../index";
import {
  uid,
  now,
  field,
  required,
  number,
  choose,
  publicText,
  add,
  get,
} from "./common";
import type { Database, Row, View } from "./types";
export async function challengeRanking(
  tx: Database,
  id: string,
): Promise<Row[]> {
  const c = await get(tx, "challenge", id);
  if (c.status === "closed" && c.frozenJson) return JSON.parse(c.frozenJson);
  const teams = await tx.team.findMany({ where: { challengeId: id } });
  const weights = JSON.parse(c.weightsJson);
  const rows: Row[] = [];
  for (const team of teams) {
    const p = await tx.progressSnapshot.findFirst({
      where: { teamId: team.id },
      orderBy: { ts: "desc" },
    });
    const judges = await tx.judgeScore.findMany({ where: { teamId: team.id } });
    const judge = judges.length
      ? judges.reduce((n, s) => n + s.total, 0) / judges.length
      : 0;
    rows.push({
      ...team,
      points: challengeScore(
        p?.started ?? 0,
        p?.published ?? 0,
        p?.avgStage ?? 0,
        judge,
        weights.auto,
      ),
      published: p?.published ?? 0,
      ts: new Date(team.createdAt).toISOString(),
    });
  }
  return rank(rows as any);
}
export async function awardBadges(tx: Database, teamId: string) {
  const snaps = await tx.progressSnapshot.findMany({
    where: { teamId },
    orderBy: { ts: "asc" },
  });
  const p = snaps.at(-1);
  const members = await tx.teamMember.findMany({ where: { teamId } });
  const earned = badges({
    started: p?.started ?? 0,
    published: p?.published ?? 0,
    countries: members.map((m) => m.country),
    days: snaps.map((s) => new Date(s.ts).toISOString().slice(0, 10)),
  });
  for (const key of earned) {
    if (!(await tx.teamBadge.findFirst({ where: { teamId, badgeId: key } })))
      await add(tx, "teamBadge", {
        id: `${teamId}:${key}`,
        teamId,
        badgeId: key,
        ts: p?.ts ?? now(),
      });
  }
}
export function createChallenge(db: Database, platform: AiStartifyClient) {
  async function challengeMutate(op: string, d: Row, role: string) {
    if (op === "createChallenge") {
      if (role !== "admin") throw new Error("Select admin role");
      const start = new Date(required(d, "startAt")),
        end = new Date(required(d, "endAt"));
      if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start)
        throw new Error(
          "End must follow start / Дата окончания должна быть позже начала",
        );
      const rubric = required(d, "rubric")
        .split(",")
        .map((s) => s.trim());
      rubric.forEach((s) => assertPublic(s));
      const rw = required(d, "rubricWeights").split(",").map(Number);
      rubricScore(
        rubric.map(() => 50),
        rw,
      );
      const id = uid();
      await add(db, "challenge", {
        id,
        title: publicText(d, "title"),
        theme: publicText(d, "theme"),
        startAt: start,
        endAt: end,
        status: "open",
        rubricJson: JSON.stringify(rubric),
        weightsJson: JSON.stringify({
          auto: number(d, "autoWeight", 0, 1),
          rubric: rw,
        }),
      });
      return { redirect: "/challenges/" + id };
    }
    if (op === "createTeam") {
      if (!["student", "teacher", "admin"].includes(role))
        throw new Error("Select student or teacher role");
      const c = await get(db, "challenge", required(d, "challengeId"));
      if (c.status !== "open")
        throw new Error("Challenge is not open / Набор закрыт");
      const code = required(d, "schoolCode");
      if (!(await platform.verifySchoolCode(code)).valid)
        throw new Error(
          "Invalid school code / Проверьте код школы (демо: START-001)",
        );
      const members = required(d, "members")
        .split("\n")
        .filter(Boolean)
        .map((s) => {
          const [nick, country] = s.split(",").map((s) => s.trim());
          if (!countries.some((c) => c.code === country))
            throw new Error(
              "Use nickname,ISO per line / Формат строки: никнейм,KZ",
            );
          return { studentRef: uid(), nickname: nick, country };
        });
      validateTeam(members);
      const id = uid();
      await db.$transaction(async (tx) => {
        await add(tx, "team", {
          id,
          challengeId: c.id,
          name: publicText(d, "name"),
          schoolCode: code,
          country: members[0].country,
        });
        for (const m of members)
          await add(tx, "teamMember", { id: uid(), teamId: id, ...m });
        await awardBadges(tx, id);
      });
      return { redirect: "/teams/" + id };
    }
    if (op === "simulate") {
      if (!["teacher", "admin"].includes(role))
        throw new Error("Select teacher or admin role");
      const teams = await db.team.findMany();
      let advanced = 0;
      for (const team of teams) {
        const c = await get(db, "challenge", team.challengeId);
        if (c.status === "closed") continue;
        const members = await db.teamMember.findMany({
          where: { teamId: team.id },
        });
        const last = await db.progressSnapshot.findFirst({
          where: { teamId: team.id },
          orderBy: { ts: "desc" },
        });
        const published = Math.min(members.length, last?.published ?? 0);
        const remainingStage =
          members.length > published
            ? Math.min(
                9,
                Math.max(
                  0,
                  Math.round(
                    ((last?.avgStage ?? 0) * members.length - published * 10) /
                      (members.length - published),
                  ),
                ),
              )
            : 10;
        const students = members.map((m, i) => ({
          studentRef: m.studentRef,
          nickname: m.nickname,
          schoolCode: team.schoolCode,
          stage: i < published ? 10 : remainingStage,
          status:
            i < published
              ? ("published" as const)
              : remainingStage > 0
                ? ("started" as const)
                : ("none" as const),
        }));
        const mock = new MockAiStartifyClient(students);
        mock.advanceSchool(team.schoolCode);
        const client: AiStartifyClient = mock;
        const progress = await client.listProgressBySchool(team.schoolCode);
        await add(db, "progressSnapshot", {
          id: uid(),
          teamId: team.id,
          started: progress.filter((s) => s.stage > 0).length,
          published: progress.filter((s) => s.status === "published").length,
          avgStage: progress.reduce((n, s) => n + s.stage, 0) / progress.length,
          ts: new Date(Math.max(+now(), +new Date(last?.ts ?? 0) + 86400000)),
        });
        await awardBadges(db, team.id);
        advanced++;
      }
      return { message: `${advanced} teams advanced / команд продвинулись` };
    }
    if (op === "judge") {
      if (role !== "judge") throw new Error("Select judge role");
      const team = await get(db, "team", required(d, "teamId"));
      const c = await get(db, "challenge", team.challengeId);
      if (c.status === "closed")
        throw new Error("Results frozen / Результаты заморожены");
      const scores = required(d, "scores").split(",").map(Number);
      const w = JSON.parse(c.weightsJson);
      const total = rubricScore(scores, w.rubric);
      const judgeId = choose(d, "judgeId", ["judge-0", "judge-1", "judge-2"]);
      const old = await db.judgeScore.findFirst({
        where: { teamId: team.id, judgeId },
      });
      if (old)
        await db.judgeScore.update({
          where: { id: old.id },
          data: { criteriaJson: JSON.stringify(scores), total },
        });
      else
        await add(db, "judgeScore", {
          id: uid(),
          teamId: team.id,
          judgeId,
          criteriaJson: JSON.stringify(scores),
          total,
        });
      return { message: "Leaderboard recalculated / Рейтинг пересчитан" };
    }
    if (op === "close") {
      if (role !== "admin") throw new Error("Select admin role");
      return db.$transaction(async (tx) => {
        const c = await get(tx, "challenge", required(d, "challengeId"));
        if (c.status === "closed") throw new Error("Already closed");
        const ranking = await challengeRanking(tx, c.id);
        await tx.challenge.update({
          where: { id: c.id },
          data: { status: "closed", frozenJson: JSON.stringify(ranking) },
        });
        return { message: "Final results frozen / Итоги зафиксированы" };
      });
    }
    throw new Error("Unknown action");
  }
  async function challengeView(v: View) {
    const challenges = await db.challenge.findMany();
    const teams = await db.team.findMany();
    const snaps = await db.progressSnapshot.findMany();
    v.metrics = [
      { label: "Челленджи|Challenges", value: challenges.length },
      { label: "Команды|Teams", value: teams.length },
      { label: "Снимки прогресса|Progress snapshots", value: snaps.length },
      { label: "Награды|Badges", value: await db.teamBadge.count() },
    ];
    if (v.path.startsWith("/teams/")) {
      const team = await get(db, "team", v.path.split("/")[2]);
      v.title = team.name;
      const members = await db.teamMember.findMany({
        where: { teamId: team.id },
      });
      const earned = await db.teamBadge.findMany({
        where: { teamId: team.id },
      });
      v.cards = earned.map((b) => ({
        title: b.badgeId,
        text: "Заслужено командой|Earned together",
        tag: "✦",
      }));
      v.tables.push(
        {
          title: "Команда|Team members",
          columns: ["Никнейм|Nickname", "Страна|Country"],
          rows: members.map((m) => [m.nickname, m.country]),
        },
        {
          title: "История прогресса|Progress history",
          columns: [
            "Дата|Date",
            "Начаты|Started",
            "Опубликованы|Published",
            "Средний этап|Average stage",
          ],
          rows: snaps
            .filter((s) => s.teamId === team.id)
            .map((s) => [
              new Date(s.ts).toISOString().slice(0, 10),
              s.started,
              s.published,
              s.avgStage.toFixed(1),
            ]),
        },
      );
    } else if (v.path.startsWith("/challenges/")) {
      const c = await get(db, "challenge", v.path.split("/")[2]);
      v.title = c.title;
      const ranking = await challengeRanking(db, c.id);
      v.cards = [
        {
          title: "Правила|Rules",
          text: `${c.theme}\n2–5 nicknames · 10 stages · ${JSON.parse(c.weightsJson).auto * 100}% auto / ${(1 - JSON.parse(c.weightsJson).auto) * 100}% judge`,
          tag: "◇",
        },
        {
          title: "Даты|Timeline",
          text: `${new Date(c.startAt).toISOString().slice(0, 10)} → ${new Date(c.endAt).toISOString().slice(0, 10)}\n${c.status}`,
          tag: "◷",
        },
      ];
      v.tables.push({
        title: "Рейтинг команд|Team leaderboard",
        columns: [
          "#",
          "Команда|Team",
          "Страна|Country",
          "Баллы|Score",
          "Профиль|Profile",
        ],
        rows: ranking.map((r, i) => [
          i + 1,
          r.name,
          r.country,
          r.points.toFixed(1),
          "/teams/" + r.id,
        ]),
      });
      for (const key of ["schoolCode", "country"]) {
        const grouped = new Map<string, number>();
        for (const r of ranking)
          grouped.set(r[key], (grouped.get(r[key]) ?? 0) + r.points);
        v.tables.push({
          title: key === "country" ? "Страны|Countries" : "Школы|Schools",
          columns: ["Группа|Group", "Баллы|Score"],
          rows: [...grouped]
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => [k, n.toFixed(1)]),
        });
      }
      if (c.status === "open")
        v.forms.push({
          title: "Создать команду|Create a team",
          op: "createTeam",
          hidden: { challengeId: c.id },
          fields: [
            field("name", "Название команды|Team name"),
            field(
              "schoolCode",
              "Код школы|School code",
              "text",
              undefined,
              "START-001",
            ),
            {
              ...field(
                "members",
                "2–5 строк: никнейм,страна|2–5 lines: nickname,country",
                "textarea",
              ),
              value: "Nova77,KZ\nOrbit88,UZ",
              hint: "Только никнеймы и ISO-код страны.|Nicknames and ISO country codes only.",
            },
          ],
        });
    } else if (v.path === "/judge") {
      const active = teams.filter(
        (t) =>
          challenges.find((c) => c.id === t.challengeId)?.status !== "closed",
      );
      v.forms.push({
        title: "Оценка по критериям|Score the rubric",
        op: "judge",
        fields: [
          field(
            "teamId",
            "Команда|Team",
            "select",
            active.map((t) => t.id),
          ),
          field("judgeId", "Судья|Judge", "select", [
            "judge-0",
            "judge-1",
            "judge-2",
          ]),
          field(
            "scores",
            "Баллы 0–100 через запятую, по порядку критериев|Scores 0–100, comma-separated in rubric order",
            "text",
            undefined,
            "80,75,90",
          ),
        ],
      });
      v.tables.push({
        title: "Критерии челленджей|Challenge rubrics",
        columns: ["Челлендж|Challenge", "Критерии|Criteria", "Веса|Weights"],
        rows: challenges.map((c) => [
          c.title,
          JSON.parse(c.rubricJson).join(", "),
          JSON.parse(c.weightsJson).rubric.join(", "),
        ]),
      });
    } else if (v.path === "/admin") {
      v.forms.push({
        title: "Новый челлендж|Create a challenge",
        op: "createChallenge",
        fields: [
          field("title", "Название|Title"),
          field("theme", "Тема|Theme"),
          field("startAt", "Начало|Start", "date", undefined, "2026-11-14"),
          field("endAt", "Окончание|End", "date", undefined, "2027-02-01"),
          field(
            "rubric",
            "Критерии через запятую|Comma-separated criteria",
            "text",
            undefined,
            "impact,originality,feasibility",
          ),
          field(
            "rubricWeights",
            "Веса критериев|Rubric weights",
            "text",
            undefined,
            "0.4,0.3,0.3",
          ),
          field(
            "autoWeight",
            "Доля автоматического балла 0–1|Auto score weight 0–1",
            "number",
            undefined,
            0.5,
          ),
        ],
      });
      v.forms.push({
        title: "Зафиксировать результаты|Close and freeze results",
        op: "close",
        fields: [
          field(
            "challengeId",
            "Челлендж|Challenge",
            "select",
            challenges.filter((c) => c.status !== "closed").map((c) => c.id),
          ),
        ],
      });
    } else if (v.path === "/showcase") {
      for (const c of challenges.filter((c) => c.status === "closed"))
        for (const r of (await challengeRanking(db, c.id)).slice(0, 3))
          v.cards.push({
            title: r.name,
            text: `${c.title}\n${r.country} · ${r.points.toFixed(1)} points`,
            href: "/teams/" + r.id,
            tag: "✦",
          });
    } else {
      v.cards = challenges.map((c) => ({
        title: c.title,
        text: `${c.theme}\n${c.status} · ${Math.max(0, Math.ceil((+new Date(c.endAt) - Date.now()) / 86400000))} days / дней`,
        href: "/challenges/" + c.id,
        tag: c.status,
      }));
    }
  }
  async function exportCsv(_reportId?: string) {
    return csv(await challengeRanking(db, "challenge-0"));
  }
  return { mutate: challengeMutate, view: challengeView, exportCsv };
}
