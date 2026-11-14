import {
  countries,
  nickname,
  MockAiStartifyClient,
  csv,
  rank,
  balance,
  levelFor,
  redeemBalance,
  fraudCheck,
} from "../index";
import type { AiStartifyClient } from "../index";
import {
  uid,
  field,
  optionsCountry,
  required,
  number,
  choose,
  publicText,
  add,
  get,
} from "./common";
import type { Database, Row, View } from "./types";

export function createAmbassador(db: Database, _platform: AiStartifyClient) {
  async function ambassadorMutate(op: string, d: Row, role: string) {
    if (op === "join") {
      if (d.adult !== "true" || d.conduct !== "true")
        throw new Error(
          "Confirm age 18+ and code of conduct / Подтвердите 18+ и правила программы",
        );
      const id = uid();
      await db.$transaction(async (tx) => {
        await add(tx, "ambassador", {
          id,
          nickname: publicText(d, "nickname"),
          country: choose(
            d,
            "country",
            countries.map((c) => c.code),
          ),
          city: publicText(d, "city"),
          age18Confirmed: true,
        });
        await add(tx, "referralLink", {
          id: uid(),
          ambassadorId: id,
          code: `AMB-${id.slice(0, 8)}`,
        });
      });
      return {
        message:
          "Welcome! Select your new ambassador in the dashboard / Выберите новый профиль в обзоре",
        redirect: "/dashboard?selection=" + id,
      };
    }
    const ambassadorId = String(d.ambassadorId ?? "amb-0");
    if (op === "simulate") {
      if (!["ambassador", "admin"].includes(role))
        throw new Error("Select ambassador or admin role");
      const n = number(d, "n", 1, 100);
      const ref = await db.referralLink.findFirst({ where: { ambassadorId } });
      if (!ref) throw new Error("Referral missing");
      const mock = new MockAiStartifyClient();
      const client: AiStartifyClient = mock;
      const events: Row[] = [];
      const off = client.subscribe((e) => events.push(e));
      mock.simulateRegistrations(n, ref.code);
      off();
      await db.$transaction(async (tx) => {
        for (const _e of events)
          await add(tx, "referralEvent", {
            id: uid(),
            ambassadorId,
            studentRef: uid(),
            nickname: nickname((await tx.referralEvent.count()) + 1),
            type: "registered",
          });
        const review = await tx.pointsLedger.findFirst({
          where: { ambassadorId, refType: "review" },
          orderBy: { ts: "desc" },
        });
        const recent = await tx.referralEvent.findMany({
          where: { ambassadorId, ...(review ? { ts: { gt: review.ts } } : {}) },
        });
        const flagged = fraudCheck(
          recent.map((r) => ({
            ts: new Date(r.ts).toISOString(),
            nickname: r.nickname,
          })),
        );
        if (
          flagged &&
          !(await tx.fraudFlag.findFirst({
            where: { ambassadorId, resolved: false },
          }))
        )
          await add(tx, "fraudFlag", {
            id: uid(),
            ambassadorId,
            reason:
              "20+ registrations in 60 seconds / Всплеск регистраций за 60 секунд",
          });
        if (
          !flagged &&
          !(await tx.fraudFlag.findFirst({
            where: { ambassadorId, resolved: false },
          }))
        )
          await add(tx, "pointsLedger", {
            id: uid(),
            ambassadorId,
            delta: n,
            reason: "Referred registrations",
            refType: "referral",
            refId: uid(),
          });
      });
      return {
        message:
          "Activity recorded. Check fraud queue / Активность записана. Проверьте очередь риска",
      };
    }
    if (op === "submitTask") {
      if (role !== "ambassador") throw new Error("Select ambassador role");
      await get(db, "ambassador", ambassadorId);
      const task = await get(db, "task", required(d, "taskId"));
      const proof = publicText(d, "proof");
      if (task.proofType === "number" && !/^\d+$/.test(proof))
        throw new Error("Provide a count / Укажите число");
      if (task.proofType === "link" && !/^https:\/\//.test(proof))
        throw new Error("Use an HTTPS proof link / Укажите HTTPS-ссылку");
      await add(db, "submission", {
        id: uid(),
        taskId: task.id,
        ambassadorId,
        proof,
        status: "pending",
      });
      return { message: "Submitted for review / Отправлено на проверку" };
    }
    if (op === "review") {
      if (role !== "admin") throw new Error("Select admin role");
      const status = choose(d, "status", ["approved", "rejected"]);
      return db.$transaction(async (tx) => {
        const s = await get(tx, "submission", required(d, "submissionId"));
        if (s.status !== "pending")
          throw new Error("Already reviewed / Уже рассмотрено");
        if (
          await tx.fraudFlag.findFirst({
            where: { ambassadorId: s.ambassadorId, resolved: false },
          })
        )
          throw new Error(
            "Resolve fraud review before awarding points / Сначала рассмотрите флаг риска",
          );
        const task = await get(tx, "task", s.taskId);
        await tx.submission.update({
          where: { id: s.id },
          data: { status, reviewedBy: "demo-admin" },
        });
        if (status === "approved")
          await add(tx, "pointsLedger", {
            id: uid(),
            ambassadorId: s.ambassadorId,
            delta: task.points,
            reason: task.title,
            refType: "submission",
            refId: s.id,
          });
        return {
          message:
            "Review saved; level recalculated / Решение сохранено, уровень пересчитан",
        };
      });
    }
    if (op === "redeem") {
      if (role !== "ambassador") throw new Error("Select ambassador role");
      return db.$transaction(async (tx) => {
        const reward = await get(tx, "reward", required(d, "rewardId"));
        const ledger = await tx.pointsLedger.findMany({
          where: { ambassadorId },
        });
        redeemBalance(balance(ledger as any), reward.costPoints, reward.stock);
        const id = uid();
        await add(tx, "redemption", {
          id,
          rewardId: reward.id,
          ambassadorId,
          status: "requested",
        });
        await add(tx, "pointsLedger", {
          id: uid(),
          ambassadorId,
          delta: -reward.costPoints,
          reason: reward.title,
          refType: "redemption",
          refId: id,
        });
        await tx.reward.update({
          where: { id: reward.id },
          data: { stock: { decrement: 1 } },
        });
        return { message: "Reward requested / Награда заказана" };
      });
    }
    if (op === "resolve") {
      if (role !== "admin") throw new Error("Select admin role");
      await db.$transaction(async (tx) => {
        const f = await get(tx, "fraudFlag", required(d, "flagId"));
        if (f.resolved) throw new Error("Already reviewed");
        await tx.fraudFlag.update({
          where: { id: f.id },
          data: { resolved: true },
        });
        await add(tx, "pointsLedger", {
          id: uid(),
          ambassadorId: f.ambassadorId,
          delta: 0,
          reason: "Fraud review completed",
          refType: "review",
          refId: f.id,
        });
      });
      return {
        message:
          "Flag reviewed. Future points resumed / Флаг рассмотрен. Новые начисления разрешены",
      };
    }
    if (op === "fulfill") {
      if (role !== "admin") throw new Error("Select admin role");
      await db.redemption.update({
        where: { id: required(d, "redemptionId") },
        data: { status: "fulfilled" },
      });
      return { message: "Fulfilled / Выдано" };
    }
    throw new Error("Unknown action");
  }
  async function ambassadorView(v: View) {
    const ambassadors = await db.ambassador.findMany();
    const ledger = await db.pointsLedger.findMany();
    const events = await db.referralEvent.findMany();
    const selected = v.extra?.selection ?? "amb-0";
    const a = ambassadors.find((a) => a.id === selected) ?? ambassadors[0];
    const current = balance(
      ledger.filter((l) => l.ambassadorId === a.id) as any,
    );
    const level = levelFor(current);
    v.metrics = [
      { label: "Баллы|Points", value: current },
      {
        label: "Уровень|Level",
        value: level.name,
        note:
          current < 200
            ? "До Silver:|Until Silver: " + (200 - current)
            : "Продолжайте создавать|Keep creating",
      },
      {
        label: "Регистрации|Registered",
        value: events.filter((e) => e.ambassadorId === a.id).length,
      },
      { label: "Участники программы|Ambassadors", value: ambassadors.length },
    ];
    if (v.path === "/join")
      v.forms.push({
        title: "Ваше влияние начинается здесь|Your impact starts here",
        op: "join",
        fields: [
          field("nickname", "Публичный никнейм|Public nickname"),
          optionsCountry(),
          field("city", "Город (без адреса)|City (no address)"),
          field("adult", "Мне исполнилось 18 лет|I am at least 18", "checkbox"),
          field(
            "conduct",
            "Принимаю правила: никакого сбора личных данных учеников|I accept the code of conduct: no student personal data",
            "checkbox",
          ),
        ],
      });
    else if (v.path === "/tasks") {
      const tasks = await db.task.findMany();
      v.cards = tasks.map((r) => ({
        title: r.title,
        text: `${r.description}\n${r.points} points · ${r.proofType}`,
        tag: "✦",
      }));
      v.forms.push({
        title: "Подтвердите выполненное задание|Submit task proof",
        op: "submitTask",
        fields: [
          field(
            "taskId",
            "Задание (ID из таблицы)|Task ID",
            "select",
            tasks.map((t) => t.id),
          ),
          field(
            "proof",
            "Публичное подтверждение без личных данных|Public proof without personal data",
            "textarea",
          ),
        ],
        hidden: { ambassadorId: a.id },
      });
      v.tables.push({
        title: "Задания|Tasks",
        columns: ["ID", "Задание|Task", "Баллы|Points", "Формат|Proof format"],
        rows: tasks.map((t) => [t.id, t.title, t.points, t.proofType]),
      });
    } else if (v.path === "/rewards") {
      const rewards = await db.reward.findMany();
      v.tables.push({
        title: "Награды|Rewards",
        columns: ["ID", "Название|Title", "Стоимость|Cost", "Осталось|Stock"],
        rows: rewards.map((r) => [r.id, r.title, r.costPoints, r.stock]),
      });
      v.forms.push({
        title: "Выберите награду|Redeem a reward",
        op: "redeem",
        fields: [
          field(
            "rewardId",
            "Награда|Reward",
            "select",
            rewards.map((r) => r.id),
          ),
        ],
        hidden: { ambassadorId: a.id },
      });
    } else if (v.path === "/leaderboard") {
      const ranking = rank(
        ambassadors.map((a) => {
          const n = balance(
            ledger.filter((l) => l.ambassadorId === a.id) as any,
          );
          return {
            ...a,
            nickname: String(a.nickname),
            country: String(a.country),
            points: n,
            published: 0,
            ts: new Date(a.createdAt).toISOString(),
            id: a.id,
          };
        }),
      );
      v.tables.push({
        title:
          "Глобальный рейтинг · фильтр по коду страны|Global ranking · filter by country code",
        columns: [
          "#",
          "Никнейм|Nickname",
          "Страна|Country",
          "Баллы|Points",
          "Уровень|Level",
        ],
        rows: ranking.map((a, i) => [
          i + 1,
          a.nickname,
          a.country,
          a.points,
          levelFor(a.points).name,
        ]),
      });
    } else if (v.path === "/admin") {
      if (v.role !== "admin") {
        v.cards.push({
          title: "Нужна роль администратора|Admin role needed",
          text: "Выберите admin в меню ролей.|Select admin in the role menu.",
        });
        return;
      }
      const submissions = await db.submission.findMany();
      const flags = await db.fraudFlag.findMany();
      const redemptions = await db.redemption.findMany();
      v.tables.push(
        {
          title: "Очередь заданий|Submission queue",
          columns: [
            "ID",
            "Участник|Ambassador",
            "Задание|Task",
            "Подтверждение|Proof",
            "Статус|Status",
          ],
          rows: submissions.map((s) => [
            s.id,
            s.ambassadorId,
            s.taskId,
            s.proof,
            s.status,
          ]),
        },
        {
          title: "Флаги риска|Fraud flags",
          columns: [
            "ID",
            "Участник|Ambassador",
            "Причина|Reason",
            "Рассмотрен|Resolved",
          ],
          rows: flags.map((f) => [
            f.id,
            f.ambassadorId,
            f.reason,
            String(f.resolved),
          ]),
        },
        {
          title: "Выдача наград|Redemptions",
          columns: ["ID", "Награда|Reward", "Статус|Status"],
          rows: redemptions.map((r) => [r.id, r.rewardId, r.status]),
        },
      );
      const pending = submissions.filter((s) => s.status === "pending");
      if (pending.length)
        v.forms.push({
          title: "Рассмотреть задание|Review submission",
          op: "review",
          fields: [
            field(
              "submissionId",
              "Заявка|Submission",
              "select",
              pending.map((s) => s.id),
            ),
            field("status", "Решение|Decision", "select", [
              "approved",
              "rejected",
            ]),
          ],
        });
      if (flags.some((f) => !f.resolved))
        v.forms.push({
          title: "Рассмотреть флаг|Resolve flag",
          op: "resolve",
          fields: [
            field(
              "flagId",
              "ID флага|Flag ID",
              "select",
              flags.filter((f) => !f.resolved).map((f) => f.id),
            ),
          ],
        });
      if (redemptions.some((r) => r.status === "requested"))
        v.forms.push({
          title: "Выдать награду|Fulfill reward",
          op: "fulfill",
          fields: [
            field(
              "redemptionId",
              "ID заказа|Redemption ID",
              "select",
              redemptions
                .filter((r) => r.status === "requested")
                .map((r) => r.id),
            ),
          ],
        });
    } else {
      const link = await db.referralLink.findFirst({
        where: { ambassadorId: a.id },
      });
      v.title = `${a.nickname} · ${level.name}`;
      v.cards.push(
        {
          title: "Ваша ссылка|Your referral",
          text: `/r/${link?.code}`,
          href: `/r/${link?.code}`,
          tag: "↗",
        },
        {
          title: "Код школы · демо|School code · demo",
          text: "START-001",
          tag: "◇",
        },
        {
          title: "Следующий уровень|Next level",
          text:
            current < 200
              ? `${current} / 200 · Silver`
              : `${current} points · ${level.name}`,
          tag: "✦",
        },
      );
      v.tables.push({
        title: "Журнал баллов · только добавление|Append-only points ledger",
        columns: ["Изменение|Delta", "Причина|Reason", "Дата|Date"],
        rows: ledger
          .filter((l) => l.ambassadorId === a.id)
          .map((l) => [
            l.delta,
            l.reason,
            new Date(l.ts).toISOString().slice(0, 10),
          ]),
      });
      v.extra = { ...v.extra, ambassadorId: a.id };
    }
  }
  async function exportCsv(_reportId?: string) {
    return csv(await db.pointsLedger.findMany());
  }
  return { mutate: ambassadorMutate, view: ambassadorView, exportCsv };
}
