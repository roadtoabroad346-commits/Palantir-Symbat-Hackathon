import {
  countries,
  MockAiStartifyClient,
  points,
  csv,
  parseNicknameCsv,
  codeActive,
  activationHealth,
} from "../index";
import type { AiStartifyClient } from "../index";
import {
  uid,
  field,
  optionsCountry,
  required,
  choose,
  publicText,
  add,
  get,
} from "./common";
import type { Database, Row, View } from "./types";
export async function schoolStudents(tx: Database, id: string) {
  const classes = await tx.classGroup.findMany({ where: { schoolId: id } });
  return tx.studentEntry.findMany({
    where: { classId: { in: classes.map((c) => c.id) } },
  });
}
export function createPortal(db: Database, _platform: AiStartifyClient) {
  async function portalMutate(op: string, d: Row, role: string) {
    if (op === "registerSchool") {
      if (role !== "teacher") throw new Error("Select teacher role");
      const id = uid(),
        consent = d.consent === "true";
      await add(db, "school", {
        id,
        name: publicText(d, "name"),
        country: choose(
          d,
          "country",
          countries.map((c) => c.code),
        ),
        city: publicText(d, "city"),
        type: choose(d, "type", ["secondary", "club", "other"]),
        status: consent ? "pilot" : "lead",
        consentConfirmed: consent,
      });
      return {
        redirect: "/dashboard?selection=" + id,
        message: "School registered / Школа добавлена",
      };
    }
    if (op === "partnerUpdate") {
      if (role !== "partner-manager")
        throw new Error("Select partner-manager role");
      const id = required(d, "schoolId");
      await get(db, "school", id);
      const status = choose(d, "status", ["lead", "pilot", "active", "paused"]);
      await db.$transaction(async (tx) => {
        const s = await tx.school.update({ where: { id }, data: { status } });
        await tx.classGroup.updateMany({
          where: { schoolId: id },
          data: { active: codeActive(s.consentConfirmed, status) },
        });
        if (String(d.note ?? "").trim())
          await add(tx, "partnerNote", {
            id: uid(),
            schoolId: id,
            note: publicText(d, "note"),
          });
      });
      return { message: "Pipeline updated / Статус школы обновлён" };
    }
    if (role !== "teacher") throw new Error("Select teacher role");
    if (op === "consent") {
      const id = required(d, "schoolId");
      if (d.consent !== "true")
        throw new Error(
          "Confirm parental consent / Подтвердите согласие родителей",
        );
      await db.$transaction(async (tx) => {
        const s = await tx.school.update({
          where: { id },
          data: { consentConfirmed: true },
        });
        await tx.classGroup.updateMany({
          where: { schoolId: id },
          data: { active: codeActive(true, s.status) },
        });
      });
      return {
        message:
          "Consent recorded; eligible codes activated / Согласие записано, доступные коды активированы",
      };
    }
    if (op === "createClass") {
      const s = await get(db, "school", required(d, "schoolId"));
      const id = uid();
      await add(db, "classGroup", {
        id,
        schoolId: s.id,
        name: publicText(d, "name"),
        gradeRange: publicText(d, "gradeRange"),
        code: "CLUB-" + id.slice(0, 8).toUpperCase(),
        active: codeActive(s.consentConfirmed, s.status),
      });
      return { redirect: "/classes/" + id };
    }
    if (op === "import") {
      const c = await get(db, "classGroup", required(d, "classId"));
      const s = await get(db, "school", c.schoolId);
      if (!c.active || !s.consentConfirmed)
        throw new Error(
          "Confirm parental consent before importing / Перед импортом подтвердите согласие родителей",
        );
      const parsed = parseNicknameCsv(required(d, "csv"));
      if (parsed.errors.length)
        throw new Error(
          parsed.errors
            .map((e) => `Row / Строка ${e.row}: ${e.message}`)
            .join("\n"),
        );
      if (!parsed.valid.length) throw new Error("No nicknames / Нет никнеймов");
      const existing = await db.studentEntry.findMany({
        where: { classId: c.id },
      });
      if (parsed.valid.some((n) => existing.some((e) => e.nickname === n)))
        throw new Error(
          "Nickname already in class / Никнейм уже есть в классе",
        );
      await db.$transaction(async (tx) => {
        for (const nick of parsed.valid)
          await add(tx, "studentEntry", {
            id: uid(),
            classId: c.id,
            nickname: nick,
            studentRef: uid(),
            stage: 0,
            status: "none",
          });
      });
      return {
        message: `${parsed.valid.length} nicknames imported / никнеймов добавлено`,
      };
    }
    if (op === "simulate") {
      const classes = await db.classGroup.findMany({ where: { active: true } });
      for (const c of classes) {
        const s = await get(db, "school", c.schoolId);
        if (!codeActive(s.consentConfirmed, s.status)) continue;
        const entries = await db.studentEntry.findMany({
          where: { classId: c.id },
        });
        const mock = new MockAiStartifyClient(
          entries.map((e) => ({
            studentRef: e.studentRef,
            nickname: e.nickname,
            schoolCode: c.code,
            stage: e.stage,
            status: e.status,
          })),
        );
        mock.advanceSchool(c.code);
        const client: AiStartifyClient = mock;
        for (const p of await client.listProgressBySchool(c.code))
          await db.studentEntry.update({
            where: { studentRef: p.studentRef },
            data: { stage: p.stage, status: p.status },
          });
      }
      return {
        message:
          "Class progress synchronized from demo adapter / Прогресс классов обновлён через демоадаптер",
      };
    }
    if (op === "report") {
      const s = await get(db, "school", required(d, "schoolId"));
      const period = required(d, "period");
      if (!/^\d{4}-\d{2}$/.test(period))
        throw new Error("Use YYYY-MM / Формат ГГГГ-ММ");
      const entries = await schoolStudents(db, s.id);
      await add(db, "report", {
        id: uid(),
        schoolId: s.id,
        period,
        dataJson: JSON.stringify(
          entries.map((e) => ({
            nickname: e.nickname,
            stage: e.stage,
            status: e.status,
          })),
        ),
      });
      return {
        message:
          "Current progress snapshot saved for selected period / Снимок текущего прогресса сохранён за выбранный период",
      };
    }
    throw new Error("Unknown action");
  }
  async function portalView(v: View) {
    const schools = await db.school.findMany();
    const owning = v.path.startsWith("/classes/")
      ? await get(db, "classGroup", v.path.split("/")[2])
      : null;
    const selected =
      schools.find((s) => s.id === (owning?.schoolId ?? v.extra?.selection)) ??
      schools[0];
    const classes = await db.classGroup.findMany({
      where: { schoolId: selected.id },
    });
    const students = await schoolStudents(db, selected.id);
    const health = activationHealth(students as any);
    v.metrics = [
      { label: "Школы|Schools", value: schools.length },
      { label: "Ученики школы|School students", value: health.total },
      { label: "Начаты|Started", value: health.started },
      { label: "Опубликованы|Published", value: health.published },
      {
        label: "Баллы школы|School points",
        value: points(health.started, health.published),
      },
      {
        label: "Активация|Activation",
        value: Math.round(100 * health.startedShare) + "%",
      },
    ];
    v.extra = { ...v.extra, selection: selected.id };
    if (v.path === "/register")
      v.forms.push({
        title: "Откройте клуб в вашей школе|Bring a club to your school",
        op: "registerSchool",
        fields: [
          field("name", "Название школы|School name"),
          optionsCountry(),
          field("city", "Город (без адреса)|City (no address)"),
          field("type", "Тип|Type", "select", ["secondary", "club", "other"]),
          {
            ...field(
              "consent",
              "Подтверждаю, что школа собрала согласия родителей|I confirm the school has collected parental consent",
              "checkbox",
            ),
            required: false,
          },
        ],
      });
    else if (v.path.startsWith("/classes/")) {
      const c = await get(db, "classGroup", v.path.split("/")[2]);
      const roster = await db.studentEntry.findMany({
        where: { classId: c.id },
      });
      v.title = c.name;
      v.cards.push({
        title: "Код класса|Class code",
        text: c.active
          ? `${c.code}\nПрисоединяйтесь к клубу с учителем.|${c.code}\nJoin the startup club with your teacher.`
          : "Код неактивен. Подтвердите согласие родителей в обзоре школы.|Code inactive. Confirm parental consent on the school dashboard.",
        tag: c.active ? "✓" : "◇",
      });
      v.tables.push({
        title: "Прогресс по никнеймам|Nickname roster",
        columns: [
          "Никнейм|Nickname",
          "Этап 0–10|Stage 0–10",
          "Прогресс|Progress",
          "Статус|Status",
        ],
        rows: roster.map((e) => [
          e.nickname,
          e.stage,
          "●".repeat(e.stage) + "○".repeat(10 - e.stage),
          e.status,
        ]),
      });
      v.forms.push({
        title: "Импорт CSV с никнеймами|Import nickname CSV",
        op: "import",
        hidden: { classId: c.id },
        fields: [
          {
            ...field(
              "csv",
              "Один никнейм в строке, заголовок nickname необязателен|One nickname per line, optional nickname header",
              "textarea",
            ),
            value: "nickname\nOrbit42\nComet77",
            hint: "Email, телефоны и ФИО отклоняются с номерами строк.|Emails, phones and full names are rejected with row numbers.",
          },
        ],
      });
    } else if (v.path === "/lesson-kit") {
      v.cards = (
        await db.lessonKit.findMany({ orderBy: { order: "asc" } })
      ).map((l) => ({
        title: `${l.order}. ${l.title}`,
        text: `${l.objectives.split("|")[0]}\n${l.steps.split("|")[0]}\nЭтапы ${l.stageRange} · 45 минут|${l.objectives.split("|")[1]}\n${l.steps.split("|")[1]}\nStages ${l.stageRange} · 45 minutes`,
        tag: String(l.order),
      }));
    } else if (v.path === "/partner") {
      if (v.role !== "partner-manager") {
        v.cards.push({
          title: "Вид менеджера партнёрств|Partner manager view",
          text: "Выберите partner-manager в меню ролей.|Select partner-manager in the role menu.",
        });
        return;
      }
      v.chart = ["lead", "pilot", "active", "paused"].map((label) => ({
        label,
        value: schools.filter((s) => s.status === label).length,
      }));
      const rows = [];
      for (const s of schools) {
        const h = activationHealth((await schoolStudents(db, s.id)) as any);
        rows.push([
          s.id,
          s.name,
          s.country,
          s.status,
          Math.round(100 * h.startedShare) + "%",
          Math.round(100 * h.publishedShare) + "%",
        ]);
      }
      v.tables.push({
        title: "Партнёрские школы|School pipeline",
        columns: [
          "ID",
          "Школа|School",
          "Страна|Country",
          "Статус|Status",
          "Начали|Started",
          "Опубликовали|Published",
        ],
        rows,
      });
      v.forms.push({
        title: "Обновить статус и заметку|Update status and note",
        op: "partnerUpdate",
        fields: [
          field(
            "schoolId",
            "Школа|School",
            "select",
            schools.map((s) => s.id),
          ),
          field("status", "Статус|Status", "select", [
            "lead",
            "pilot",
            "active",
            "paused",
          ]),
          {
            ...field(
              "note",
              "Заметка без персональных данных|Note without personal data",
              "textarea",
            ),
            required: false,
          },
        ],
      });
      const notes = await db.partnerNote.findMany();
      v.tables.push({
        title: "Заметки|Notes",
        columns: ["Школа|School", "Заметка|Note"],
        rows: notes.map((n) => [n.schoolId, n.note]),
      });
    } else if (v.path === "/reports") {
      v.forms.push({
        title:
          "Сохранить текущий снимок прогресса|Save current progress snapshot",
        op: "report",
        hidden: { schoolId: selected.id },
        fields: [
          field(
            "period",
            "Период отчёта|Report period",
            "month",
            undefined,
            "2026-11",
          ),
        ],
      });
      const reports = await db.report.findMany({
        where: { schoolId: selected.id },
      });
      v.tables.push({
        title: "Сохранённые отчёты|Saved reports",
        columns: ["Период|Period", "Создан|Generated", "CSV"],
        rows: reports.map((r) => [
          r.period,
          new Date(r.generatedAt).toISOString().slice(0, 10),
          "/api/export?report=" + r.id,
        ]),
      });
      v.tables.push({
        title: "Текущий прогресс|Current progress",
        columns: ["Никнейм|Nickname", "Этап|Stage", "Статус|Status"],
        rows: students.map((s) => [s.nickname, s.stage, s.status]),
      });
    } else {
      v.title = selected.name;
      v.cards.push({
        title: "Следующее занятие|Next best action",
        text: `${health.total - health.started} учеников ещё не начали. Проведите занятие 1.|${health.total - health.started} students have not started. Run lesson 1.`,
        href: "/lesson-kit",
        tag: "↗",
      });
      v.tables.push({
        title: "Классы школы|School classes",
        columns: [
          "Класс|Class",
          "Возрастная группа|Grade range",
          "Код|Code",
          "Открыть|Open",
        ],
        rows: classes.map((c) => [
          c.name,
          c.gradeRange,
          c.active ? c.code : "inactive",
          "/classes/" + c.id,
        ]),
      });
      if (!selected.consentConfirmed)
        v.forms.push({
          title: "Активировать коды|Activate class codes",
          op: "consent",
          hidden: { schoolId: selected.id },
          fields: [
            field(
              "consent",
              "Школа собрала согласия родителей|The school has collected parental consent",
              "checkbox",
            ),
          ],
        });
      v.forms.push({
        title: "Создать класс|Create a class",
        op: "createClass",
        hidden: { schoolId: selected.id },
        fields: [
          field("name", "Название класса|Class name"),
          field(
            "gradeRange",
            "Классы обучения|Grade range",
            "text",
            undefined,
            "7–11",
          ),
        ],
      });
      v.cards.push(
        ...schools.map((s) => ({
          title: s.name,
          text: `${s.country} · ${s.status}`,
          href: "/dashboard?selection=" + s.id,
          tag: "◇",
        })),
      );
    }
  }
  async function exportCsv(reportId?: string) {
    if (reportId) {
      const r = await get(db, "report", reportId);
      return csv(JSON.parse(r.dataJson));
    }
    return csv(
      (await db.studentEntry.findMany()).map((s) => ({
        nickname: s.nickname,
        stage: s.stage,
        status: s.status,
      })),
    );
  }
  return { mutate: portalMutate, view: portalView, exportCsv };
}
