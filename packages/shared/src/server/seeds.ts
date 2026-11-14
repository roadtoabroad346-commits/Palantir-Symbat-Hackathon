import {
  countries,
  nickname,
  schoolCode,
  seedStudents,
  points,
  messageVariants,
} from "../index";
import type { AiStartifyClient } from "../index";
import { date, add } from "./common";
import type { Database } from "./types";
import { challengeRanking, awardBadges } from "./challenge";
export async function seedApp(
  app: string,
  db: Database,
  platform: AiStartifyClient,
) {
  if (app === "growth-engine") {
    if (await db.campaign.count()) return;
    for (const key of ["adult", "pii", "mention"])
      await add(db, "complianceRule", {
        id: key,
        key,
        description: {
          adult: "Paid audiences must be 18+",
          pii: "No personal data or requests",
          mention: "Mention parent or teacher",
        }[key],
        enabled: true,
      });
    for (let i = 0; i < 10; i++) {
      const c = {
        id: `campaign-${i}`,
        name: `Launch ${i + 1}`,
        country: countries[i % 6].code,
        audience: i % 2 ? "parent" : "teacher",
        channel: ["instagram", "telegram", "youtube", "email", "school_chat"][
          i % 5
        ],
        language: i % 3 ? "ru" : "en",
        tone: "friendly",
        budgetUsd: 100 + i * 25,
        minAge: 18,
        status: i % 3 ? "running" : "ready",
        createdAt: date(i),
      };
      await add(db, "campaign", c);
      for (const v of messageVariants(c))
        await add(db, "messageVariant", {
          id: `v-${i}-${v.label}`,
          campaignId: c.id,
          ...v,
        });
      const link = await platform.createReferral(c.id, c.channel);
      await add(db, "referralLink", {
        id: `link-${i}`,
        campaignId: c.id,
        ...link,
        utm: `utm_source=${c.channel}&utm_campaign=${c.id}`,
      });
      for (let j = 0; j < 200; j++)
        await add(db, "trackedEvent", {
          id: `event-${i}-${j}`,
          linkCode: link.code,
          type:
            j < 110
              ? "visit"
              : j < 165
                ? "registered"
                : j < 192
                  ? "started"
                  : "published",
          country: c.country,
          ts: date(j % 12),
        });
    }
  }
  if (app === "ambassador-platform") {
    if (await db.ambassador.count()) return;
    for (let i = 0; i < 20; i++) {
      await add(db, "ambassador", {
        id: `amb-${i}`,
        nickname: nickname(i),
        country: countries[i % 6].code,
        city: `City ${(i % 6) + 1}`,
        age18Confirmed: true,
        level: "Bronze",
        createdAt: date(i),
      });
      await add(db, "pointsLedger", {
        id: `ledger-${i}`,
        ambassadorId: `amb-${i}`,
        delta: i === 0 ? 180 : i * 90,
        reason: "Demo contribution",
        refType: "seed",
        refId: `seed-${i}`,
      });
      await add(db, "referralLink", {
        id: `ref-${i}`,
        ambassadorId: `amb-${i}`,
        code: `AMB-${i + 1}`,
      });
    }
    for (let i = 0; i < 12; i++)
      await add(db, "task", {
        id: `task-${i}`,
        title: [
          "Invite a school / Пригласите школу",
          "Share club kit / Поделитесь набором",
          "Host a webinar / Проведите вебинар",
        ][i % 3],
        type: ["onboard_school", "content", "webinar", "invite_students"][
          i % 4
        ],
        points: 50 + i * 10,
        description:
          "Use public resources; never collect student personal data. / Используйте публичные материалы без данных учеников.",
        proofType: ["link", "text", "number"][i % 3],
      });
    for (let i = 0; i < 8; i++)
      await add(db, "reward", {
        id: `reward-${i}`,
        title: [
          "Mentor session / Встреча с наставником",
          "Workshop ticket / Билет на воркшоп",
          "Demo certificate / Демосертификат",
          "Club toolkit / Набор для клуба",
        ][i % 4],
        costPoints: 100 + i * 50,
        stock: 10,
      });
    for (let i = 0; i < 4; i++)
      await add(db, "submission", {
        id: `submission-${i}`,
        taskId: `task-${i}`,
        ambassadorId: "amb-0",
        proof: "https://example.org/demo-proof",
        status: "pending",
      });
  }
  if (app === "challenge-platform") {
    if (await db.challenge.count()) return;
    for (const key of [
      "First step",
      "Published",
      "Cross-border team",
      "Streak",
    ])
      await add(db, "badge", { id: key, key, title: key, description: key });
    for (let i = 0; i < 3; i++)
      await add(db, "challenge", {
        id: `challenge-${i}`,
        title: [
          "Make school better / Сделайте школу лучше",
          "Green neighborhood / Зелёный квартал",
          "Ideas across borders / Идеи без границ",
        ][i],
        theme: "AI for everyday impact / AI для полезных перемен",
        startAt: date(0),
        endAt: new Date("2027-02-01"),
        status: ["open", "judging", "closed"][i],
        rubricJson: JSON.stringify(["Impact", "Originality", "Feasibility"]),
        weightsJson: JSON.stringify({ auto: 0.5, rubric: [0.4, 0.3, 0.3] }),
      });
    for (let i = 0; i < 18; i++) {
      const teamId = `team-${i}`;
      await add(db, "team", {
        id: teamId,
        challengeId: `challenge-${i % 3}`,
        name: `Orbit-${i + 1}`,
        schoolCode: schoolCode(i % 8),
        country: countries[i % 6].code,
        createdAt: date(i),
      });
      for (let j = 0; j < 3; j++)
        await add(db, "teamMember", {
          id: `member-${i}-${j}`,
          teamId,
          studentRef: `stu-${i}-${j}`,
          nickname: nickname(i * 3 + j),
          country: countries[(i + (j % 2)) % 6].code,
        });
      for (let day = 0; day < 3; day++)
        await add(db, "progressSnapshot", {
          id: `snapshot-${i}-${day}`,
          teamId,
          started: 1 + day,
          published: i % 3 === 0 ? 1 : 0,
          avgStage: 3 + day,
          ts: date(day),
        });
      for (let j = 0; j < 3; j++)
        await add(db, "judgeScore", {
          id: `judge-score-${i}-${j}`,
          teamId,
          judgeId: `judge-${j}`,
          criteriaJson: "[70,80,75]",
          total: 75 + (i % 5),
        });
      await awardBadges(db, teamId);
    }
    const frozen = await challengeRanking(db, "challenge-2");
    await db.challenge.update({
      where: { id: "challenge-2" },
      data: { frozenJson: JSON.stringify(frozen) },
    });
  }
  if (app === "school-portal") {
    if (await db.school.count()) return;
    for (let i = 0; i < 12; i++) {
      const status = ["active", "pilot", "lead", "paused"][i % 4];
      await add(db, "school", {
        id: `school-${i}`,
        name: `School ${i + 1}`,
        country: countries[i % 6].code,
        city: `City ${(i % 6) + 1}`,
        type: "secondary",
        status,
        consentConfirmed: i % 4 < 2,
        createdAt: date(i),
      });
      await add(db, "teacher", {
        id: `teacher-${i}`,
        schoolId: `school-${i}`,
        displayName: `Mentor${i + 1}`,
        role: "school-admin",
      });
    }
    for (let i = 0; i < 30; i++)
      await add(db, "classGroup", {
        id: `class-${i}`,
        schoolId: `school-${i % 12}`,
        name: `Club ${i + 1}`,
        gradeRange: "7–11",
        code: `CLUB-${String(i + 1).padStart(3, "0")}`,
        active: (i % 12) % 4 < 2,
      });
    const students = seedStudents(300, 30);
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      await add(db, "studentEntry", {
        id: `entry-${i}`,
        classId: `class-${i % 30}`,
        nickname: s.nickname,
        studentRef: s.studentRef,
        stage: s.stage,
        status: s.status,
      });
    }
    const ru = [
        "Найдите проблему",
        "Проверьте идею",
        "Создайте прототип",
        "Расскажите о проекте",
      ],
      en = [
        "Find a problem",
        "Validate the idea",
        "Build a prototype",
        "Tell your story",
      ];
    for (let i = 0; i < 4; i++)
      await add(db, "lessonKit", {
        id: `lesson-${i}`,
        order: i + 1,
        title: `${ru[i]}|${en[i]}`,
        objectives: [
          "Назовите проблему и кому она мешает|Name a problem and who it affects",
          "Сформулируйте гипотезу и проверьте её без сбора личных данных|Test a hypothesis without collecting personal data",
          "Создайте простой макет и проверьте его с наставником|Build a small mockup and test it with a mentor",
          "Опубликуйте безопасное описание и подготовьте питч|Publish a safe project description and prepare a pitch",
        ][i],
        steps:
          "5 мин: обсуждение → 10 мин: пример → 20 мин: работа в команде → 10 мин: рефлексия|5 min: discuss → 10 min: example → 20 min: team work → 10 min: reflect",
        stageRange: ["1–2", "3–5", "6–8", "9–10"][i],
      });
  }
  if (app === "school-league") {
    if (await db.school.count()) return;
    await add(db, "season", {
      id: "season-0",
      title: "Builders without borders / Создатели без границ",
      startAt: date(0),
      endAt: new Date("2027-02-01"),
      active: true,
      frozen: false,
    });
    for (let i = 0; i < 20; i++) {
      await add(db, "school", {
        id: `school-${i}`,
        slug: `school-${i}`,
        name: `School ${i + 1}`,
        country: countries[i % 6].code,
        city: `City ${(i % 8) + 1}`,
        code: schoolCode(i),
      });
      await add(db, "pointsSnapshot", {
        id: `season-0:school-${i}`,
        seasonId: "season-0",
        schoolId: `school-${i}`,
        started: 0,
        published: 0,
        points: 0,
        ts: date(i),
      });
    }
    for (let i = 0; i < 400; i++) {
      const schoolId = `school-${i % 20}`;
      await add(db, "student", {
        id: `student-${i}`,
        schoolId,
        nickname: nickname(i),
        studentRef: `stu-${i}`,
      });
      const published = i % 3 === 0;
      await add(db, "project", {
        id: `project-${i}`,
        studentId: `student-${i}`,
        title: `eco-orbit-${i + 1}`,
        idea: "A greener school, one small idea at a time / Сделаем школу зеленее вместе",
        status: published ? "published" : "started",
        passportId: `DEMO-${i + 1}`,
        publishedAt: published ? date(i % 12) : null,
        createdAt: date(i % 12),
      });
      const snap = await db.pointsSnapshot.findFirst({
        where: { seasonId: "season-0", schoolId },
      });
      await db.pointsSnapshot.update({
        where: { id: snap!.id },
        data: {
          started: { increment: 1 },
          published: { increment: published ? 1 : 0 },
          points: { increment: points(1, published ? 1 : 0) },
        },
      });
    }
  }
}
