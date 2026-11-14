import {
  field as f,
  type Actor,
  type Data,
  type FieldV2,
  type FormV2,
  type Workspace,
} from "./types";
import type { HubService } from "./service";
import { MISSIONS, CHECKS } from "./learning";
import { hasRole } from "./access";
import { timestamp } from "./store";
import { integrationStatus } from "./integrations";

export const NAV = {
  "founder-studio": [
    ["today", "Сегодня|Today"],
    ["project", "Проект|Project"],
    ["learning", "Учёба|Learning"],
    ["prototype", "Прототип|Prototype"],
    ["signal", "Проверки|SIGNAL"],
    ["experts", "Специалисты|Experts"],
    ["bookings", "Помощь и кредиты|Bookings & credits"],
    ["results", "Результаты|Results"],
    ["settings", "Настройки|Settings"],
  ],
  "growth-engine": [
    ["campaigns", "Кампании|Campaigns"],
    ["discovery", "Исследование|Discovery"],
    ["leads", "Заявки|Leads"],
    ["content", "Reels и контент|Reels & content"],
    ["analytics", "Результаты|Results"],
  ],
  "school-portal": [
    ["overview", "Организации|Institutions"],
    ["pilot", "Пилот|Pilot"],
    ["people", "Люди|People"],
    ["program", "Потоки|Cohorts"],
    ["documents", "Документы|Documents"],
    ["reports", "Отчёты|Reports"],
    ["club", "Клуб|Club"],
  ],
  "school-league": [
    ["projects", "Проекты|Projects"],
    ["evidence", "Доказательства|Evidence"],
    ["metrics", "Метрики|Metrics"],
    ["rankings", "Рейтинги|Rankings"],
    ["delegations", "Сборные|Delegations"],
    ["appeals", "Апелляции|Appeals"],
  ],
  "global-dashboard": [
    ["countries", "Страны|Countries"],
    ["evidence", "Evidence Room|Evidence Room"],
    ["verification", "Проверка|Verification"],
  ],
  "ambassador-platform": [
    ["contribution", "Подтверждённый вклад|Verified contribution"],
    ["internship", "Стажировка|Internship"],
    ["continuation", "Продолжение|Continuation"],
  ],
  "challenge-platform": [
    ["events", "События|Events"],
    ["opportunities", "Первое ДА|First YES"],
    ["commitments", "Договорённости|Commitments"],
  ],
};
const TITLES = {
  "founder-studio": "Студия фаундера|Founder studio",
  "growth-engine": "Marketing Lab|Marketing Lab",
  "school-portal": "Программы организаций|Institution programs",
  "school-league": "Лига доказательств|Evidence league",
  "global-dashboard": "Evidence Room|Evidence Room",
  "ambassador-platform": "Вклад и развитие|Contribution & growth",
  "challenge-platform": "События и возможности|Events & opportunities",
};
const defaultDate = (days: number) =>
  new Date(Date.now() + days * 86400000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
const choiceField = (
  name: string,
  label: string,
  options: string[],
  value?: string,
) => f(name, label, "select", value ?? options[0], options);
const yes = (name: string, label: string, value = "false") =>
  choiceField(name, label, ["false", "true"], value);
const optional = (field: FieldV2) => ({
  ...field,
  required: false,
  ...(field.type === "select" ? { value: "" } : {}),
});
export function buildWorkspace(
  service: HubService,
  actor: Actor | null,
  requested: string,
  selected?: string,
): Workspace {
  const app = service.store.app,
    nav = NAV[app].map(([key, label]) => ({ key, label })),
    section = nav.some((n) => n.key === requested) ? requested : nav[0].key;
  const forms: FormV2[] = [],
    records: Workspace["records"] = [],
    cards: Workspace["cards"] = [];
  const add = (op: string, title: string, fields: FieldV2[], hidden?: Data) =>
    forms.push({ op, title, fields, hidden });
  const show = (kind: string, title: string) => {
    const items = service.records(actor, kind, 100);
    records.push({
      title,
      items: items.map((r) => ({
        id: r.id,
        kind: r.kind,
        visibility: r.visibility,
        dataMode: r.mode,
        revision: r.revision,
        updatedAt: r.updatedAt,
        ...r.data,
      })),
    });
    return items;
  };
  const ids = (
    kind: string,
    name: string,
    label: string,
    allowEmpty = false,
  ) => {
    const rs = service.records(actor, kind, 200);
    return {
      ...choiceField(name, label, [
        ...(allowEmpty ? [""] : []),
        ...rs.map((r) => r.id),
      ]),
      required: !allowEmpty,
      optionLabels: Object.fromEntries(
        rs.map((r) => [
          r.id,
          `${r.data.title ?? r.data.nickname ?? r.kind} · ${r.id.slice(-6)}`,
        ]),
      ),
    };
  };
  const people = (name: string, label: string) => ({
    ...choiceField(
      name,
      label,
      service.people().map((p) => p.id),
    ),
    hint: "Выберите ID из списка профилей ниже|Select an ID from the demo profiles below",
    optionLabels: Object.fromEntries(
      service.people().map((p) => [p.id, p.label]),
    ),
  });
  const status = (values: string[]) =>
    choiceField("status", "Статус|Status", values);
  const scope = f("scope", "Область полномочий|Scope", "text", "*");
  const reason = f("reason", "Основание решения|Reason"),
    evidence = f("evidence", "Материал, подтверждающий действие|Evidence"),
    projectId = ids("project", "projectId", "Проект|Project");
  const isAdmin =
    !!actor &&
    hasRole(actor, ["platform_admin", "moderator", "coordinator"], "*");
  const globalProjects = service
    .projections(actor)
    .filter((e) => e.type === "project.updated");
  const projectionId = (type: string, name: string, label: string) =>
    choiceField(
      name,
      label,
      service
        .projections(actor)
        .filter(
          (e) =>
            e.type === type ||
            (type === "project.updated" && e.type === "project.revoked"),
        )
        .map((e) => e.entityRef),
    );
  const externalProject = () =>
    projectionId(
      "project.updated",
      "projectId",
      "Проект из студии|Project from studio",
    );
  const periodFields = () => [
    f(
      "periodStart",
      "Начало периода UTC|Period start UTC",
      "text",
      "2026-11-01T00:00:00Z",
    ),
    f(
      "periodEnd",
      "Конец периода UTC|Period end UTC",
      "text",
      "2026-12-01T00:00:00Z",
    ),
  ];
  const formDocFields = () =>
    [
      "parties|Стороны|Parties",
      "authority|Полномочия|Authority",
      "goal|Цель|Goal",
      "format|Формат|Format",
      "dates|Сроки|Dates",
      "resources|Ресурсы|Resources",
      "cost|Стоимость|Cost",
      "dataPolicy|Данные|Data policy",
      "publication|Публикации|Publication",
      "workRights|Права на работы|Work rights",
      "reschedule|Переносы|Reschedule",
      "termination|Прекращение|Termination",
      "reporting|Отчётность|Reporting",
      "responsible|Ответственные|Responsible",
    ].map((s) => {
      const [name, ...labels] = s.split("|");
      return f(name, labels.join("|"), "textarea");
    });
  if (!actor) {
    cards.push({
      title: "Начните с полезного шага|Start with a useful step",
      text: "Выберите локальный демопрофиль. Команда и школа необязательны. Для настоящих пользователей провайдер входа ещё не подключён.|Choose a local demo profile. Team and school are optional. A real identity provider is not connected yet.",
    });
    if (app === "founder-studio")
      add(
        "identity.register",
        "Новый индивидуальный демопрофиль|New individual demo profile",
        [
          f("nickname", "Никнейм|Nickname"),
          choiceField("country", "Страна|Country", [
            "KZ",
            "UZ",
            "KG",
            "IN",
            "NG",
            "PH",
            "KE",
            "TR",
            "VN",
            "ID",
          ]),
          choiceField("language", "Язык|Language", ["ru", "en"]),
        ],
      );
    return {
      app,
      actor,
      people: service.people(),
      section,
      nav,
      title: TITLES[app],
      summary: "Сначала выберите демопрофиль|Choose a demo profile to begin",
      forms,
      records,
      cards,
      providers: providers(),
      updatedAt: timestamp(),
    };
  }
  if (app === "founder-studio") {
    const projects = service
        .records(actor, "project", 100)
        .filter((p) => p.owner === actor.id),
      p = projects.find((p) => p.id === selected) ?? projects[0];
    if (p)
      cards.push({
        title: p.data.title,
        text: `${p.data.problem} · ${p.data.stage} · ${p.mode}`,
        href: `/v2?section=project&selected=${p.id}`,
      });
    if (section === "today") {
      cards.push({
        title:
          "Что поможет продвинуть проект сейчас?|What helps your project move forward?",
        text: p
          ? `Следующий шаг: ${MISSIONS.find((m) => m.id === p.data.nextMission)?.title ?? "Выберите продолжение|Choose continuation"}`
          : "Сохраните знакомую проблему. Школа и команда не требуются.|Save a familiar problem. No school or team required.",
        href: "/v2?section=" + (p ? "learning" : "project"),
      });
      show("help_request", "Запросы помощи|Help requests");
      show("action_plan", "Следующие действия|Next actions");
      show("continuation", "Где вы остановились|Where you left off");
      if (p)
        add(
          "help.request",
          "Я застрял|I'm stuck",
          [
            choiceField("reason", "Как помочь?|How can we help?", [
              "explain",
              "example",
              "start",
              "review",
              "stuck",
              "workshop",
              "coordinator",
            ]),
            f("question", "Затруднение|Question", "textarea"),
          ],
          { projectId: p.id },
        );
      add(
        "participation.continue",
        "Выберите продолжение|Choose continuation",
        [
          choiceField("choice", "Следующий маршрут|Next route", [
            "continue",
            "change_hypothesis",
            "pilot",
            "test_others",
            "help_institution",
            "pause",
            "complete",
          ]),
          reason,
          f("nextStep", "Посильный следующий шаг|Small next step"),
          f(
            "remindAt",
            "Когда вернуться UTC|Reminder UTC",
            "text",
            defaultDate(7),
          ),
          choiceField("frequency", "Частота|Frequency", [
            "off",
            "weekly",
            "monthly",
          ]),
        ],
      );
    }
    if (section === "project") {
      show("project", "Мои проекты|My projects");
      show("team_v2", "Необязательные команды|Optional teams");
      add(
        "team.create",
        "Пригласить команду из 2–5 участников|Invite a team of 2–5",
        [
          f("title", "Название команды|Team title"),
          f(
            "memberIds",
            "ID приглашённых, включая себя, через запятую|Invited profile IDs including yourself, comma-separated",
          ),
        ],
      );
      add("team.accept", "Принять приглашение|Accept a team invitation", [
        ids("team_v2", "teamId", "Команда|Team"),
      ]);
      if (p) {
        add(
          "project.team",
          "Связать проект с принятой командой|Link a project to an accepted team",
          [
            optional(
              ids(
                "team_v2",
                "teamId",
                "Команда — необязательно|Team — optional",
                true,
              ),
            ),
          ],
          { projectId: p.id },
        );
        add(
          "project.affiliation",
          "Уточнить связи с организациями|Update institution affiliations",
          [
            f(
              "affiliations",
              "Глобальные ID организаций через запятую|Global institution IDs, comma-separated",
            ),
            optional(
              f(
                "primaryInstitutionId",
                "Основная организация для зачёта|Primary institution for scoring",
              ),
            ),
            reason,
          ],
          { projectId: p.id },
        );
      }

      add(
        "project.create",
        "Начать индивидуальный проект|Start an individual project",
        [
          f("title", "Название проекта|Project title"),
          f("problem", "Знакомая проблема|Problem", "textarea"),
          f("audience", "Для кого?|Audience"),
          choiceField("stage", "Стадия|Stage", [
            "no_idea",
            "idea",
            "mockup",
            "prototype",
            "product",
          ]),
          choiceField("country", "Страна|Country", [
            "KZ",
            "UZ",
            "KG",
            "IN",
            "NG",
            "PH",
            "KE",
            "TR",
            "VN",
            "ID",
          ]),
          optional(
            projectionId(
              "institution.updated",
              "institutionId",
              "Организация — необязательно|Institution — optional",
            ),
          ),
          optional(
            projectionId(
              "cohort.updated",
              "cohortId",
              "Поток — необязательно|Cohort — optional",
            ),
          ),
        ],
      );
      if (p) {
        add(
          "project.update",
          "Обновить проект с сохранением истории|Update project, preserving history",
          [
            f("title", "Название|Title", "text", p.data.title),
            f("problem", "Проблема|Problem", "textarea", p.data.problem),
            f("audience", "Аудитория|Audience", "text", p.data.audience),
            choiceField(
              "stage",
              "Стадия|Stage",
              ["no_idea", "idea", "mockup", "prototype", "product"],
              p.data.stage,
            ),
          ],
          { projectId: p.id },
        );
        add(
          "project.visibility",
          "Управление публичностью|Manage visibility",
          [
            choiceField(
              "visibility",
              "Кто видит проект?|Who can see the project?",
              ["private", "cohort", "institution", "public"],
              p.visibility,
            ),
            yes(
              "consent",
              "Разрешаю публикацию выбранных материалов|Permission to publish selected materials",
              String(p.data.consent),
            ),
          ],
          { projectId: p.id },
        );
      }
    }
    if (section === "learning") {
      for (const mission of MISSIONS)
        cards.push({
          title: `${mission.week} · ${mission.title}`,
          text: [0, 1]
            .map(
              (i) =>
                `${mission.minutes} ${i === 0 ? "мин" : "min"} · ${[mission.goal, mission.example, mission.criterion].map((v) => v.split("|")[i]).join("\n")}`,
            )
            .join("|"),
        });
      show("submission", "Сохранённые материалы|Saved materials");
      if (p)
        add(
          "mission.submit",
          "Сохранить действие|Save an action",
          [
            choiceField(
              "missionId",
              "Миссия|Mission",
              MISSIONS.map((m) => m.id),
              p.data.nextMission,
            ),
            f("artifact", "Ваш материал|Your artifact", "textarea"),
            f("source", "Откуда наблюдение?|Source"),
            f("limitations", "Ограничения|Limitations"),
          ],
          { projectId: p.id },
        );
    }
    if (section === "prototype") {
      cards.push({
        title:
          "Одна задача → одно изменение → проверка|One task → one change → a check",
        text: "Генератор кода и гараж AI Startify не подключены. Подключите собственный прототип; проверки выполняет человек и сохраняет наблюдения. Код на сервере не исполняется.|Code generation and AI Startify garage are not connected. Attach your prototype and record human checks. Code is not executed on this server.",
      });
      show("prototype_version", "Версии прототипа|Prototype versions");
      show("prototype_check", "Функциональные проверки|Functional checks");
      show("bug", "Ошибки и исправления|Bugs and fixes");
      if (p) {
        add(
          "prototype.save",
          "Сохранить мини-ТЗ и версию|Save mini brief and version",
          [
            choiceField("route", "Маршрут|Route", [
              "no_code",
              "guided",
              "existing",
            ]),
            ...[
              "user|Кто будет пользоваться?|Who will use it?",
              "task|Одна задача пользователя|One user task",
              "actions|Шаги основного сценария|Main flow steps",
              "data|Какие данные сохраняются?|What data is saved?",
              "constraints|Ограничения|Constraints",
              "errors|Пустой ввод и ошибки|Empty input and errors",
              "acceptance|Как проверить готовность?|How to verify it?",
            ].map((value) => {
              const [key, ...label] = value.split("|");
              return f("brief." + key, label.join("|"), "textarea");
            }),
            f("url", "Адрес вашего прототипа|Your prototype URL", "url"),
            f("change", "Что изменилось?|What changed?"),
          ],
          { projectId: p.id },
        );
        add(
          "prototype.check",
          "Записать проверку человека|Record a human check",
          [
            ids("prototype_version", "prototypeId", "Версия|Version"),
            ...CHECKS.flatMap((key, index) => [
              choiceField(
                `checks.${key}.status`,
                `${index + 1}. ${["Основной путь|Main flow", "Пустой ввод|Empty input", "Неверный ввод|Invalid input", "Сохранение|Save", "Повторное открытие|Reopen", "Недоступность|Unavailability", "Восстановление|Recovery"][index]}`,
                ["blocked", "passed", "failed"],
              ),
              f(`checks.${key}.expected`, "Ожидалось|Expected"),
              f(`checks.${key}.observed`, "Наблюдалось|Observed"),
              f(`checks.${key}.reproduce`, "Как повторить|Reproduction"),
            ]),
          ],
          { projectId: p.id },
        );
        add(
          "bug.report",
          "Описать ошибку|Report a bug",
          [
            f("expected", "Ожидалось|Expected"),
            f("observed", "Произошло|Observed"),
            f("reproduce", "Как повторить|Reproduction", "textarea"),
            optional(f("error", "Сообщение ошибки|Error message")),
            f("lastChange", "Последнее изменение|Last change"),
          ],
          { projectId: p.id },
        );
        add(
          "bug.resolve",
          "Подтвердить исправление|Confirm a fix",
          [
            ids("bug", "bugId", "Ошибка|Bug"),
            ids(
              "prototype_check",
              "checkId",
              "Новая успешная проверка|New passing check",
            ),
            f("change", "Исправление|Fix"),
          ],
          { projectId: p.id },
        );
      }
    }
    if (section === "signal") {
      show("experiment", "Эксперименты и решения|Experiments & decisions");
      show("tester_application", "Подходящие заявки|Eligible applications");
      show("response", "Исходные ответы|Original responses");
      if (p)
        add(
          "experiment.create",
          "Подготовить проверку|Prepare an experiment",
          [
            f("hypothesis", "Гипотеза|Hypothesis"),
            f("target", "Целевая группа|Target group"),
            f("role", "Кто подходит?|Screening role", "text", "teacher"),
            choiceField("language", "Язык|Language", ["ru", "en"]),
            f("minAge", "Минимальный возраст|Minimum age", "number", 18),
            f("maxAge", "Максимальный возраст|Maximum age", "number", 100),
            f("task", "Задание|Task", "textarea"),
            choiceField("format", "Формат|Format", [
              "problem",
              "concept",
              "usability",
              "comparison",
            ]),
            f("deadline", "Срок UTC|Deadline UTC", "text", defaultDate(7)),
          ],
          { projectId: p.id },
        );
      add("tester.profile", "Мой профиль тестировщика|My tester profile", [
        f("role", "Роль|Role", "text", "teacher"),
        choiceField("language", "Язык|Language", ["ru", "en"]),
        f("age", "Возраст|Age", "number", 18),
        f("interests", "Темы через запятую|Interests, comma-separated"),
        f("experience", "Релевантный опыт|Relevant experience"),
        yes("consent", "Добровольное участие|Voluntary participation"),
      ]);
      const experiments = service.store
        .list("experiment", actor.mode)
        .filter((e) => e.data.status === "recruiting")
        .map((e) => ({
          id: e.id,
          hypothesis: e.data.hypothesis,
          target: e.data.target,
          screening: e.data.screening,
          task: e.data.task,
        }));
      records.push({
        title: "Открытые проверки|Open experiments",
        items: experiments,
      });
      const eids = choiceField(
        "experimentId",
        "Эксперимент|Experiment",
        experiments.map((e) => e.id),
      );
      add("experiment.apply", "Пройти screening|Check eligibility", [eids]);
      add(
        "experiment.respond",
        "Сохранить исходный ответ|Save an original response",
        [
          eids,
          f("original", "Ваш исходный ответ|Original response", "textarea"),
          yes("completed", "Задание удалось выполнить?|Task completed?"),
          f("difficulty", "Что затруднило?|Difficulty"),
          yes(
            "permission",
            "Разрешаю использование ответа в исследовании|Permission to use in research",
          ),
        ],
      );
      add(
        "experiment.decide",
        "Принять решение по ответам|Decide from responses",
        [
          ids("experiment", "experimentId", "Мой эксперимент|My experiment"),
          choiceField("decision", "Решение|Decision", [
            "change",
            "refine_audience",
            "more_data",
            "continue",
            "stop",
          ]),
          f("assumed", "Предполагал|Assumed"),
          f("learned", "Выяснил|Learned"),
          f("changed", "Изменил|Changed"),
          f("limitations", "Ограничения выборки|Sample limitations"),
          f("nextStep", "Следующий шаг|Next step"),
        ],
      );
    }
    if (section === "experts") {
      show("expert", "Паспорта специалистов|Expert passports");
      show("service_offer", "Услуги|Service offers");
      show("availability", "Доступность|Availability");
      show("expert_match", "Подбор с объяснением|Matches with explanations");
      if (p)
        add(
          "expert.match",
          "Подобрать помощь под задачу|Match support to your task",
          [
            f("skill", "Задача|Task", "text", "research"),
            choiceField("language", "Язык|Language", ["ru", "en"]),
            f(
              "budgetMinor",
              "Максимальная цена, сотые credit|Maximum price, credit minor units",
              "number",
              5000,
            ),
          ],
          { projectId: p.id },
        );
      add("expert.apply", "Подать паспорт специалиста|Submit expert passport", [
        f("nickname", "Публичный никнейм|Public nickname"),
        f("skills", "Сферы через запятую|Skills, comma-separated"),
        f("stages", "Стадии|Stages"),
        f("languages", "Языки|Languages", "text", "ru,en"),
        f("timezone", "Часовой пояс|Timezone", "text", "Asia/Qyzylorda"),
        f("experience", "Опыт|Experience", "textarea"),
        f("sources", "Источники проверки|Verification sources"),
        f("cases", "Кейсы|Cases"),
        f("beginnerExperience", "Опыт с начинающими|Beginner experience"),
        f("limitations", "Ограничения|Limitations"),
        yes(
          "consent",
          "Публичный паспорт после проверки|Public passport after review",
        ),
      ]);
      if (isAdmin)
        add("expert.review", "Проверить специалиста|Review expert", [
          ids("expert", "expertProfileId", "Паспорт|Passport"),
          status(["reviewing", "approved", "limited", "suspended"]),
          f("reviewEvidence", "Основание проверки|Review evidence"),
        ]);
      if (actor.roles.some((r) => r.role === "expert")) {
        add("offer.create", "Предложить услугу|Offer a service", [
          f("title", "Название|Title"),
          f("skill", "Задача|Skill"),
          f("stage", "Стадия|Stage", "text", "prototype"),
          choiceField("language", "Язык|Language", ["ru", "en"]),
          choiceField("format", "Формат|Format", [
            "short_session",
            "async_review",
            "group_workshop",
            "supported_experiment",
          ]),
          f(
            "priceMinor",
            "Цена в сотых service credit|Price in credit minor units",
            "number",
            0,
          ),
          f("capacity", "Количество мест|Capacity", "number", 1),
        ]);
        add("availability.create", "Открыть слот|Open a slot", [
          ids("service_offer", "offerId", "Услуга|Offer"),
          f("startAt", "Начало UTC|Start UTC", "text", defaultDate(2)),
          f(
            "endAt",
            "Конец UTC|End UTC",
            "text",
            new Date(Date.parse(defaultDate(2)) + 1800000).toISOString(),
          ),
          f("timezone", "Часовой пояс|Timezone", "text", "Asia/Qyzylorda"),
        ]);
      }
    }
    if (section === "bookings") {
      records.push({
        title:
          "Кредиты на услуги — не баллы и не USD|Service credits — separate from points and USD",
        items: service.walletState(actor).map((w) => ({
          id: w.id,
          ...w.data,
          ...w.balance,
          ledger: w.ledger,
        })),
      });
      show("booking", "Бронирования|Bookings");
      show("action_plan", "Действия и follow-up|Actions & follow-up");
      show("sponsorship", "Поддержка|Sponsorship");
      show("reschedule_request", "Согласование переноса|Reschedule requests");
      add("booking.reschedule", "Предложить перенос|Propose a reschedule", [
        ids("booking", "bookingId", "Бронирование|Booking"),
        ids(
          "availability",
          "slotId",
          "Новый слот той же услуги|New slot for the same service",
        ),
        reason,
      ]);
      add(
        "booking.reschedule.confirm",
        "Подтвердить перенос второй стороной|Counterparty reschedule confirmation",
        [
          ids(
            "reschedule_request",
            "requestId",
            "Запрос переноса|Reschedule request",
          ),
          yes("approved", "Согласен с переносом|Approve reschedule"),
          reason,
        ],
      );
      add(
        "wallet.demo_credit",
        "Пополнить демокошелёк|Add demo service credits",
        [
          f(
            "amountMinor",
            "Сотые service credit|Credit minor units",
            "number",
            5000,
          ),
          f(
            "reference",
            "Уникальная метка|Unique reference",
            "text",
            crypto.randomUUID(),
          ),
        ],
      );
      add(
        "booking.hold",
        "Подготовить и зарезервировать помощь|Prepare and reserve support",
        [
          projectId,
          ids("availability", "slotId", "Свободный слот|Available slot"),
          f(
            "timezone",
            "Ваш часовой пояс|Your timezone",
            "text",
            "Asia/Qyzylorda",
          ),
          f(
            "brief",
            "Что создаю и что пробовал|Project and attempts",
            "textarea",
          ),
          f("question", "Вопрос|Question"),
          optional(f("materials", "Материалы|Materials")),
          choiceField("funding", "Оплата|Funding", [
            "service_credit",
            "sponsor_entitlement",
          ]),
          optional(
            ids(
              "sponsorship",
              "sponsorId",
              "Спонсор — если выбран|Sponsor — if selected",
              true,
            ),
          ),
        ],
      );
      add(
        "booking.confirm",
        "Подтвердить резерв и цену|Confirm hold and price",
        [ids("booking", "bookingId", "Бронирование|Booking")],
      );
      add(
        "booking.cancel",
        "Отменить по сохранённым правилам|Cancel under saved rules",
        [ids("booking", "bookingId", "Бронирование|Booking"), reason],
      );
      add(
        "booking.complete",
        "Завершить сессию планом|Complete session with a plan",
        [
          ids("booking", "bookingId", "Бронирование|Booking"),
          f("summary", "Итог|Summary"),
          f("action", "Согласованное действие|Agreed action"),
          f("dueAt", "Срок UTC|Due UTC", "text", defaultDate(7)),
          f(
            "followUpAt",
            "Follow-up UTC|Follow-up UTC",
            "text",
            defaultDate(14),
          ),
        ],
      );
      add(
        "action.complete",
        "Сохранить результат действия|Save action outcome",
        [
          ids("booking", "bookingId", "Бронирование|Booking"),
          f(
            "result",
            "Результат, включая отрицательный|Result, including negative",
            "textarea",
          ),
          f("limitations", "Ограничения|Limitations"),
        ],
      );
      add("action.review", "Разобрать результат|Review follow-up", [
        ids("booking", "bookingId", "Бронирование|Booking"),
        f("feedback", "Обратная связь|Feedback"),
        f("nextStep", "Следующий шаг|Next step"),
      ]);
      add("booking.dispute", "Открыть спор|Open dispute", [
        ids("booking", "bookingId", "Бронирование|Booking"),
        reason,
      ]);
      if (isAdmin) {
        add(
          "sponsorship.create",
          "Подготовить спонсорскую квоту|Prepare sponsor quota",
          [
            scope,
            f(
              "budgetMinor",
              "Объём в сотых credit|Budget in credit minor units",
              "number",
              10000,
            ),
            f(
              "eligibleIds",
              "Допустимые участники через запятую|Eligible subject IDs",
            ),
            optional(
              f("skills", "Допустимые услуги через запятую|Allowed skills"),
            ),
            f("expiresAt", "Срок UTC|Expiry UTC", "text", defaultDate(30)),
            f("fundingSource", "Подтверждение ресурса|Funding source"),
          ],
        );
        add(
          "sponsorship.confirm",
          "Подтвердить финансирование независимо|Independently confirm funding",
          [
            ids("sponsorship", "sponsorId", "Квота|Quota"),
            f("confirmation", "Подтверждение|Confirmation"),
          ],
        );
        add("booking.resolve", "Разрешить спор|Resolve dispute", [
          ids("booking", "bookingId", "Бронирование|Booking"),
          f(
            "refundMinor",
            "Возврат minor units|Refund minor units",
            "number",
            0,
          ),
          f("resolution", "Решение|Resolution"),
        ]);
      }
    }
    if (section === "results") {
      show("portfolio", "Портфолио|Portfolio");
      show("project_version", "История изменений|Change history");
      records.push({
        title: "Межмодульные результаты|Cross-app results",
        items: service
          .projections(actor)
          .filter((e) => e.type !== "project.updated")
          .map((e) => ({
            id: e.entityRef,
            type: e.type,
            dataMode: e.dataMode,
            verification: e.verification,
            asOf: e.occurredAt,
            ...e.payload,
          })),
      });
      if (p)
        add(
          "portfolio.issue",
          "Сохранить портфолио материалов|Save artifact portfolio",
          [
            f("criteria", "Критерии|Criteria"),
            f(
              "evidenceRefs",
              "ID материалов через запятую|Artifact IDs, comma-separated",
            ),
          ],
          { projectId: p.id },
        );
    }
    if (section === "settings") {
      if (p)
        add(
          "notification.settings",
          "Частота уведомлений|Notification frequency",
          [
            choiceField("frequency", "Частота|Frequency", [
              "off",
              "daily",
              "weekly",
            ]),
          ],
          { projectId: p.id },
        );
      add("privacy.request", "Запрос по данным|Data request", [
        choiceField("type", "Запрос|Request", ["export", "delete"]),
        reason,
      ]);
      show("privacy_request", "Запросы по данным|Data requests");
    }
  }
  if (app === "growth-engine") {
    if (section === "campaigns") {
      show("marketing_campaign", "Кампании|Campaigns");
      add("campaign.create", "Создать кампанию|Create campaign", [
        f("title", "Название|Title"),
        optional(externalProject()),
        choiceField("country", "Страна|Country", [
          "KZ",
          "UZ",
          "KG",
          "IN",
          "NG",
          "PH",
          "KE",
          "TR",
          "VN",
          "ID",
        ]),
        choiceField("goal", "Цель|Goal", [
          "interviews",
          "testers",
          "applications",
          "subscriptions",
          "meetings",
          "pilots",
          "customers",
          "cohort",
        ]),
        choiceField("audience", "Аудитория|Audience", [
          "founder",
          "teacher",
          "parent",
          "partner",
          "student",
        ]),
        f("minAge", "Минимальный возраст|Minimum age", "number", 18),
        choiceField("language", "Язык|Language", ["ru", "en"]),
        f("description", "Предложение|Description", "textarea"),
        f(
          "advantages",
          "Подтверждённая польза|Supported advantages",
          "textarea",
        ),
        f("limitations", "Ограничения|Limitations"),
        f("cta", "Следующий шаг|CTA"),
        f("channels", "Каналы через запятую|Channels", "text", "manual_export"),
        f("dailyLimit", "Дневной лимит|Daily limit", "number", 10),
        f(
          "spendLimitMinor",
          "Лимит расходов minor units|Spend limit minor units",
          "number",
          0,
        ),
      ]);
      add("campaign.approve", "Утвердить кампанию|Approve campaign", [
        ids("marketing_campaign", "campaignId", "Кампания|Campaign"),
        optional(
          f(
            "approvedRecipients",
            "Проверенные взрослые адресаты, через запятую|Reviewed adult recipients, comma-separated",
          ),
        ),
      ]);
      add("campaign.pause", "Пауза или продолжение|Pause or resume", [
        ids("marketing_campaign", "campaignId", "Кампания|Campaign"),
        yes("paused", "Приостановить|Pause", "true"),
      ]);
    }
    if (section === "discovery") {
      show(
        "prospect",
        "Найденные записи — ещё не лиды|Prospects — not interested leads",
      );
      show(
        "discovery_source",
        "Исходные недоверенные материалы|Original untrusted sources",
      );
      show("job", "Задания и ошибки|Jobs & errors");
      add(
        "discovery.fetch",
        "Прочитать разрешённую публичную страницу|Read a permitted public page",
        [
          ids("marketing_campaign", "campaignId", "Кампания|Campaign"),
          f("url", "Публичный URL|Public URL", "url"),
        ],
      );
      add(
        "prospect.import",
        "Сохранить проверенный источник|Save a reviewed source",
        [
          ids("marketing_campaign", "campaignId", "Кампания|Campaign"),
          f("url", "Canonical URL|Canonical URL", "url"),
          optional(
            f(
              "organizationId",
              "ID организации — необязательно|Organization ID — optional",
            ),
          ),
          f("title", "Название|Title"),
          f("description", "Описание|Description"),
          choiceField(
            "confidence",
            "Уверенность извлечения|Extraction confidence",
            ["low", "medium", "high"],
          ),
          evidence,
          f("knownUnknowns", "Что ещё неизвестно?|Known unknowns"),
        ],
      );
      add(
        "prospect.merge",
        "Объединить дубликаты с историей|Merge duplicates with history",
        [
          ids("prospect", "primaryId", "Основная запись|Primary"),
          ids("prospect", "duplicateId", "Дубликат|Duplicate"),
          reason,
        ],
      );
    }
    if (section === "leads") {
      show(
        "lead",
        "Заявки и подтверждённые переходы|Leads & supported transitions",
      );
      show("attribution", "Сохранённый источник|Retained attribution");
      add(
        "lead.from_prospect",
        "Начать исследование контакта|Start prospect review",
        [ids("prospect", "prospectId", "Найденная запись|Prospect")],
      );
      add(
        "lead.transition",
        "Сохранить реальный следующий шаг|Record an actual next step",
        [
          ids("lead", "leadId", "Заявка|Lead"),
          status([
            "researched",
            "fit_reviewed",
            "outreach_prepared",
            "contacted",
            "responded",
            "interested",
            "qualified",
            "scheduled",
            "completed",
            "outcome",
            "not_fit",
            "opted_out",
            "duplicate",
            "archived",
          ]),
          reason,
          evidence,
          optional(
            f(
              "recipient",
              "Утверждённый адресат для contacted|Approved recipient for contacted",
            ),
          ),
        ],
      );
      for (const c of service.records(actor, "marketing_campaign", 50))
        cards.push({
          title: c.data.title,
          text: "Открыть форму добровольной заявки|Open voluntary application form",
          href: `/api/v2/landing/${c.id}?source=${c.data.source}`,
        });
    }
    if (section === "content") {
      show("content_plan", "Контент-планы|Content plans");
      show("content", "Сценарии Reels|Reels storyboards");
      show(
        "job",
        "Generation/export — реальные статусы|Generation/export — actual status",
      );
      show(
        "publication",
        "Публикации, сообщённые вручную|Manually reported publications",
      );
      add("content.plan", "План на 7–30 дней|Plan for 7–30 days", [
        ids("marketing_campaign", "campaignId", "Кампания|Campaign"),
        f("days", "Дней|Days", "number", 7),
        f("tone", "Тон|Tone"),
        f("proofs", "Основания утверждений|Proofs"),
        f("rights", "Права на материалы|Media rights"),
      ]);
      add("content.create", "Подготовить Reels 9:16|Prepare a 9:16 Reel", [
        ids("marketing_campaign", "campaignId", "Кампания|Campaign"),
        f("title", "Название|Title"),
        ...[
          "hook|Зацепка|Hook",
          "script|Сценарий|Script",
          "shots|Кадры|Shots",
          "onScreen|Текст на экране|On-screen text",
          "subtitles|Субтитры|Subtitles",
          "cover|Обложка|Cover",
          "caption|Описание|Caption",
          "cta|Следующий шаг|Call to action",
        ].map((value) => {
          const [key, ...label] = value.split("|");
          return f("storyboard." + key, label.join("|"), "textarea");
        }),
        f("rights", "Основание использования медиа|Media usage rights"),
        optional(
          f(
            "snapshotId",
            "Сезонный snapshot — если упомянут|Season snapshot — if mentioned",
          ),
        ),
      ]);
      add(
        "content.transition",
        "Отправить на проверку / утвердить|Review / approve content",
        [
          ids("content", "contentId", "Материал|Content"),
          status(["review", "approved", "scheduled", "draft"]),
          optional(
            f(
              "scheduledAt",
              "Время ручной публикации UTC|Manual publication time UTC",
              "text",
              defaultDate(2),
            ),
          ),
        ],
      );
      add(
        "content.export",
        "Скачать монтажный пакет — не MP4|Download storyboard package — not MP4",
        [ids("content", "contentId", "Материал|Content")],
      );
      add(
        "content.render",
        "Проверить доступность видеорендера|Check video renderer availability",
        [ids("content", "contentId", "Материал|Content")],
      );
      add(
        "publication.manual",
        "Отметить свою ручную публикацию|Record your manual publication",
        [
          ids("content", "contentId", "Материал|Content"),
          f("externalPostId", "ID реального поста|Actual external post ID"),
          f("url", "Ссылка на пост|Post URL", "url"),
          f(
            "publishedAt",
            "Дата публикации UTC|Published UTC",
            "text",
            timestamp(),
          ),
          evidence,
        ],
      );
    }
    if (section === "analytics") {
      const leads = service.records(actor, "lead", 1000);
      const count = (states: string[]) =>
        leads.filter((l) => states.includes(l.data.status)).length;
      records.push({
        title:
          "Воронка — определения зафиксированы до опыта|Funnel — definitions fixed before experiment",
        items: [
          {
            applications: leads.length,
            responded: count([
              "responded",
              "interested",
              "qualified",
              "scheduled",
              "completed",
              "outcome",
            ]),
            qualified: count([
              "qualified",
              "scheduled",
              "completed",
              "outcome",
            ]),
            outcomes: count(["outcome"]),
            abConclusion:
              leads.length < 100
                ? "Недостаточно данных / Insufficient data"
                : "No randomized A/B test configured",
            verification:
              "manual or voluntary inbound; not upstream activation",
          },
        ],
      });
      show(
        "content_metric",
        "Метрики контента с источником|Content metrics & provenance",
      );
    }
  }
  if (app === "school-portal") {
    const institutionId = ids(
      "institution",
      "institutionId",
      "Организация|Institution",
    );
    if (section === "overview") {
      show(
        "institution",
        "Единый реестр организаций|Canonical institution registry",
      );
      add(
        "institution.create",
        "Подготовить паспорт организации|Prepare institution passport",
        [
          f("title", "Название|Title"),
          choiceField("type", "Тип|Type", ["school", "college", "university"]),
          choiceField("country", "Страна|Country", [
            "KZ",
            "UZ",
            "KG",
            "IN",
            "NG",
            "PH",
            "KE",
            "TR",
            "VN",
            "ID",
          ]),
          optional(f("website", "Сайт|Website", "url")),
          choiceField("language", "Язык|Language", ["ru", "en"]),
          f("timezone", "Часовой пояс|Timezone", "text", "Asia/Qyzylorda"),
          f("resources", "Ресурсы|Resources"),
          yes(
            "consent",
            "Разрешение на публичный паспорт|Permission for public institution profile",
          ),
        ],
      );
      add(
        "institution.status",
        "Следующий фактический этап|Next actual stage",
        [
          institutionId,
          status([
            "interested",
            "discussion",
            "pilot_agreed",
            "scheduled",
            "started",
            "completed",
            "repeat",
            "archived",
          ]),
          optional(reason),
        ],
      );
      if (isAdmin)
        add(
          "institution.verify",
          "Независимая проверка организации|Independent institution review",
          [
            institutionId,
            choiceField("verificationStatus", "Решение|Decision", [
              "verified",
              "rejected",
              "revoked",
            ]),
            f("source", "Основание|Source"),
          ],
        );
    }
    if (section === "pilot") {
      show("partnership", "Планы ограниченных пилотов|Limited pilot plans");
      add("partnership.create", "Согласовать пилот|Prepare pilot agreement", [
        institutionId,
        choiceField("format", "Формат|Format", [
          "trial",
          "bootcamp",
          "residency",
          "workshop",
          "club",
        ]),
        f("audience", "Аудитория|Audience"),
        f("resources", "Ресурсы|Resources"),
        f("budgetMinor", "Бюджет minor units|Budget minor units", "number", 0),
        f("currency", "Валюта|Currency", "text", "KZT"),
        f("criteria", "Критерии завершения|Completion criteria"),
      ]);
      cards.push({
        title: "Пакет доверия|Trust pack",
        text: "До запуска согласуйте организатора, контакт ответственного, ведущих, нагрузку, стоимость, ресурсы, условия данных и отчёт. Черновик не является подписанным соглашением.|Agree organizer, responsible contact, facilitators, workload, cost, resources, data terms and report. A draft is not a signed agreement.",
        href: "/v2?section=documents",
      });
    }
    if (section === "people") {
      show("representative", "Назначения и история|Appointments & history");
      show("enrollment", "Участники потоков|Cohort enrollments");
      add(
        "representative.nominate",
        "Предложить уполномоченного представителя|Nominate representative",
        [
          institutionId,
          people("subjectId", "Профиль представителя|Representative profile"),
          f("authoritySource", "Основание полномочий|Authority source"),
          f("expiresAt", "Срок UTC|Expiry UTC", "text", defaultDate(90)),
          yes("consent", "Публичная карточка|Public card"),
        ],
      );
      if (isAdmin)
        add(
          "representative.review",
          "Подтвердить назначение независимо|Independently confirm appointment",
          [
            ids("representative", "representativeId", "Назначение|Appointment"),
            status(["verified", "rejected", "revoked"]),
            f("confirmation", "Подтверждение|Confirmation"),
          ],
        );
      add(
        "cohort.enroll",
        "Записать участника с согласием|Enroll with consent",
        [
          ids("cohort", "cohortId", "Поток|Cohort"),
          people("subjectId", "Участник|Participant"),
          yes(
            "consent",
            "Необходимые согласия получены|Required consent obtained",
          ),
        ],
      );
    }
    if (section === "documents") {
      show(
        "document",
        "Документы и текущие ревизии|Documents & current revisions",
      );
      show("document_revision", "История условий|Terms history");
      add(
        "document.create",
        "Подготовить черновик по шаблону|Prepare template draft",
        [
          institutionId,
          choiceField("type", "Документ|Document", [
            "proposal",
            "program",
            "responsibilities",
            "memorandum",
            "contract",
            "pilot_appendix",
            "report",
          ]),
          ...formDocFields(),
        ],
      );
      add(
        "document.transition",
        "Передать на согласование / подтвердить|Review / confirm document",
        [
          ids("document", "documentId", "Документ|Document"),
          status([
            "internal_review",
            "institution_review",
            "agreed",
            "signed",
            "active",
            "completed",
            "terminated",
            "draft",
          ]),
          optional(
            f(
              "signedEvidence",
              "Подтверждение уполномоченной стороны для signed|Authorized counterparty confirmation for signed",
            ),
          ),
        ],
      );
      add(
        "document.revise",
        "Создать ревизию согласованных условий|Revise agreed terms",
        [
          ids("document", "documentId", "Документ|Document"),
          reason,
          ...formDocFields().map(optional),
        ],
      );
    }
    if (section === "program") {
      show("cohort", "Потоки и реальный запуск|Cohorts & actual start");
      add(
        "cohort.create",
        "Назначить согласованный поток|Schedule agreed cohort",
        [
          institutionId,
          ids(
            "document",
            "documentId",
            "Подтверждённый документ|Confirmed document",
          ),
          f("title", "Название|Title"),
          choiceField("program", "Программа|Program", [
            "trial-45",
            "bootcamp-2x45",
            "residency-4w",
            "club",
          ]),
          f("startAt", "Начало UTC|Start UTC", "text", defaultDate(2)),
          f("endAt", "Конец UTC|End UTC", "text", defaultDate(30)),
          people("coordinatorId", "Координатор|Coordinator"),
          people("teacherId", "Ведущий|Teacher"),
          f("loadMinutes", "Нагрузка, минуты|Workload, minutes", "number", 360),
          f(
            "budgetMinor",
            "Бюджет minor units|Budget minor units",
            "number",
            0,
          ),
          f("currency", "Валюта|Currency", "text", "KZT"),
          f("criteria", "Критерии|Criteria"),
          yes("consent", "Согласия программы|Program consent"),
        ],
      );
      add(
        "cohort.start",
        "Подтвердить фактическое начало|Confirm actual start",
        [
          ids("cohort", "cohortId", "Поток|Cohort"),
          f("confirmation", "Основание запуска|Start confirmation"),
        ],
      );
      add("cohort.project", "Добавить проект участника|Link enrolled project", [
        ids("cohort", "cohortId", "Поток|Cohort"),
        externalProject(),
      ]);
      add("cohort.complete", "Завершить с отчётом|Complete with a report", [
        ids("cohort", "cohortId", "Поток|Cohort"),
        f("report", "Фактический результат|Actual result", "textarea"),
        f(
          "teacherMinutes",
          "Фактическая нагрузка, минуты|Actual workload minutes",
          "number",
          360,
        ),
        f("nextStep", "Следующий запуск|Next step"),
      ]);
    }
    if (section === "reports") {
      show(
        "institution_report",
        "Снимки текущего состояния|Current state snapshots",
      );
      add("institution.report", "Сохранить отчёт|Save report", [
        institutionId,
        f("nextStep", "Продолжение|Next step"),
      ]);
    }
    if (section === "club") {
      show("club", "Продолжение после потока|Continuation after cohort");
      add("club.create", "Подготовить стартап-клуб|Prepare startup club", [
        institutionId,
        f("title", "Название|Title"),
        people("responsibleId", "Ответственный|Responsible adult"),
        f("resources", "Подтверждённые ресурсы|Confirmed resources"),
        f("rhythm", "Ритм встреч|Meeting rhythm"),
        f(
          "nextMeeting",
          "Следующая встреча UTC|Next meeting UTC",
          "text",
          defaultDate(7),
        ),
      ]);
    }
  }
  if (app === "school-league") {
    if (section === "projects") {
      records.push({
        title: "Разрешённые проекты из студии|Permitted projects from studio",
        items: globalProjects
          .filter((e) => e.payload.consent)
          .map((e) => ({
            id: e.entityRef,
            dataMode: e.dataMode,
            verification: e.verification,
            ...e.payload,
          })),
      });
      cards.push({
        title:
          "Нет подтверждённых данных — отдельное состояние|Missing verified data is a separate state",
        text: "Оплаты, лайки и купленные кредиты не входят в score. Старые сезоны V1 остаются по формуле started + 10×published.|Payments, likes and purchased credits do not enter the score. V1 seasons retain started + 10×published.",
        href: "/",
      });
    }
    if (section === "evidence") {
      show(
        "evidence",
        "Материалы и решения проверки|Evidence & review decisions",
      );
      add("evidence.submit", "Представить доказательство|Submit evidence", [
        externalProject(),
        f("title", "Название|Title"),
        f("description", "Что подтверждает?|What does it support?", "textarea"),
        choiceField("sourceType", "Метод|Source type", [
          "first_party_event",
          "authenticated_upstream",
          "document_review",
          "reviewer_confirmation",
          "external_reference",
        ]),
        f("sourceRef", "Ссылка на источник|Source reference"),
        optional(f("url", "Разрешённый URL|Permitted URL", "url")),
        yes("consent", "Разрешаю публикацию|Publication permission"),
        yes("sensitive", "Содержит закрытые сведения|Contains sensitive data"),
      ]);
      add(
        "evidence.visibility",
        "Разрешить или отозвать публикацию материала|Grant or revoke evidence publication",
        [
          ids("evidence", "evidenceId", "Материал|Evidence"),
          yes("consent", "Разрешение на публикацию|Publication permission"),
        ],
      );
      if (isAdmin)
        add(
          "evidence.review",
          "Независимая проверка материала|Independent evidence review",
          [
            ids("evidence", "evidenceId", "Материал|Evidence"),
            choiceField("verificationStatus", "Решение|Decision", [
              "verified",
              "rejected",
              "revoked",
            ]),
            reason,
            choiceField("method", "Метод проверки|Verification method", [
              "document_review",
              "reviewer_confirmation",
              "external_reference",
              "authenticated_upstream",
              "first_party_event",
            ]),
          ],
        );
    }
    if (section === "metrics") {
      show(
        "metric",
        "Наблюдения с периодом и источником|Observations with period & source",
      );
      add("metric.submit", "Сохранить наблюдение|Record observation", [
        externalProject(),
        ids("evidence", "evidenceId", "Материал|Evidence"),
        choiceField("metricKey", "Метрика|Metric", [
          "interviews",
          "tests",
          "pilots",
          "applications",
          "qualified_applications",
          "users",
          "customers",
          "revenue",
          "expenses",
          "conversion",
          "projects_created",
          "projects_checked",
          "projects_published",
          "program_completion",
        ]),
        f("value", "Значение|Value", "number", 0),
        f("unit", "Единица|Unit", "text", "count"),
        ...periodFields(),
        optional(
          f("numerator", "Числитель для доли|Numerator for ratio", "number", 0),
        ),
        optional(
          f(
            "denominator",
            "Знаменатель для доли|Denominator for ratio",
            "number",
            1,
          ),
        ),
        optional(
          f(
            "currency",
            "Валюта для финансов|Currency for finance",
            "text",
            "KZT",
          ),
        ),
        choiceField("aggregation", "Тип значения|Aggregation", [
          "period",
          "cumulative",
        ]),
        choiceField("visibility", "Видимость|Visibility", [
          "private",
          "institution",
          "public",
        ]),
        yes("consent", "Разрешение на публикацию|Publication permission"),
      ]);
      if (isAdmin)
        add("metric.review", "Проверить наблюдение|Review observation", [
          ids("metric", "metricId", "Наблюдение|Observation"),
          choiceField("verificationStatus", "Решение|Decision", [
            "verified",
            "rejected",
            "revoked",
          ]),
          reason,
        ]);
    }
    if (section === "rankings") {
      show("season_v2", "Сезоны V2|V2 seasons");
      if (isAdmin)
        add(
          "institution.rank",
          "Зафиксировать рейтинг организации с размерами выборки|Freeze institution score and sample sizes",
          [
            projectionId(
              "institution.updated",
              "institutionId",
              "Организация|Institution",
            ),
            ids("season_v2", "seasonId", "Замороженный сезон|Frozen season"),
            f("asOf", "Дата расчёта UTC|As of UTC", "text", timestamp()),
            reason,
          ],
        );
      show("season_entry", "Заявки сезона|Season entries");
      show("evaluation_v2", "Оценки проверяющих|Reviewer evaluations");
      show("ranking_snapshot", "Неизменяемые результаты|Immutable results");
      records.push({
        title:
          "Организации: размер группы и provisional|Institutions: sample size & provisional",
        items: service.institutions(actor),
      });
      if (isAdmin) {
        add(
          "season.create",
          "Подготовить сезон с опубликованной политикой|Prepare season with published policy",
          [
            scope,
            f("title", "Название|Title"),
            ...periodFields(),
            f(
              "eligibilityPolicy",
              "Правила отбора до старта|Eligibility rules before start",
            ),
            choiceField("category", "Категория|Category", [
              "individual",
              "team",
              "delegation",
              "school",
              "college",
              "university",
            ]),
            choiceField("stage", "Стадия|Stage", [
              "idea",
              "mockup",
              "prototype",
              "product",
            ]),
            optional(f("country", "Страна — необязательно|Country — optional")),
          ],
        );
        add(
          "season.transition",
          "Открыть / завершить этап|Advance season phase",
          [
            ids("season_v2", "seasonId", "Сезон|Season"),
            status(["registration", "active", "review", "archived"]),
          ],
        );
        add(
          "evaluation.submit",
          "Оценить 5 критериев по evidence|Score five evidence criteria",
          [
            ids("season_entry", "entryId", "Заявка|Entry"),
            f(
              "ratings",
              "Пять оценок 0–4 через запятую|Five 0–4 ratings, comma-separated",
              "text",
              "0,0,0,0,0",
            ),
            f(
              "evidenceRefs",
              "Проверенные ID материалов|Verified evidence IDs",
            ),
            reason,
            yes(
              "noConflict",
              "Конфликта интересов нет|No conflict of interest",
            ),
          ],
        );
        add("season.freeze", "Зафиксировать результаты|Freeze results", [
          ids("season_v2", "seasonId", "Сезон|Season"),
        ]);
      }
      add(
        "season.enter",
        "Заявить свой проект в категорию|Enter your project",
        [ids("season_v2", "seasonId", "Сезон|Season"), externalProject()],
      );
    }
    if (section === "delegations") {
      show("delegation", "Сезонные сборные|Seasonal delegations");
      add(
        "delegation.create",
        "Создать сборную организации|Create institution delegation",
        [
          projectionId(
            "institution.updated",
            "institutionId",
            "Организация|Institution",
          ),
          f("title", "Название|Title"),
          ids("season_v2", "seasonId", "Сезон|Season"),
          f("criteria", "Прозрачные критерии|Transparent selection criteria"),
          yes("consent", "Разрешение на публикацию|Publication permission"),
        ],
      );
      add("delegation.add", "Добавить отдельный проект|Add a project", [
        ids("delegation", "delegationId", "Сборная|Delegation"),
        externalProject(),
      ]);
    }
    if (section === "appeals") {
      show("appeal", "Апелляции и ревизии|Appeals & revisions");
      add("appeal.create", "Обжаловать результат|Appeal result", [
        ids(
          "ranking_snapshot",
          "snapshotId",
          "Исходный snapshot|Original snapshot",
        ),
        externalProject(),
        reason,
        evidence,
      ]);
      if (isAdmin)
        add(
          "appeal.resolve",
          "Разрешить с сохранением оригинала|Resolve, retaining original",
          [
            ids("appeal", "appealId", "Апелляция|Appeal"),
            yes("accepted", "Принять|Accept"),
            f(
              "ratings",
              "Новые 5 оценок 0–4, если принята|New five 0–4 ratings if accepted",
              "text",
              "0,0,0,0,0",
            ),
            reason,
          ],
        );
    }
  }
  if (app === "global-dashboard") {
    if (section === "countries") {
      const p = service.countries(actor);
      records.push({
        title:
          "Текущая проекция — не историческая кривая|Current projection — separate from historical demo curve",
        items: p.countries.map((c) => ({ ...c, id: c.country })),
      });
      records.push({
        title: "Уникальные глобальные итоги|Unique global totals",
        items: [
          {
            ...p.global,
            dataMode: p.dataMode,
            definitions: p.definitions,
            limitations: p.limitations,
          },
        ],
      });
      records.push({
        title: "Актуальность и пропуски источников|Source freshness & gaps",
        items: p.health,
      });
      cards.push({
        title:
          "Offline globe и таблица демосценария|Offline demo globe & table",
        text: "Историческая синтетическая кривая доступна отдельно и не входит в реальные KPI.|The historical synthetic curve remains separate from real KPIs.",
        href: "/",
      });
    }
    if (section === "evidence") {
      const packs = show(
        "evidence_pack",
        "Пакеты доказательств|Evidence packs",
      );
      for (const p of packs) {
        cards.push({
          title: p.data.title,
          text: `${p.mode} · ${p.data.periodStart} — ${p.data.periodEnd}`,
          href: `/api/v2/evidence-packs/${p.id}?format=html`,
        });
        cards.push({
          title: "JSON / CSV|JSON / CSV",
          text: "Скачать JSON|Download JSON",
          href: `/api/v2/evidence-packs/${p.id}?format=json`,
        });
        cards.push({
          title: "CSV|CSV",
          text: "Скачать CSV|Download CSV",
          href: `/api/v2/evidence-packs/${p.id}?format=csv`,
        });
      }
      add(
        "evidence_pack.create",
        "Сформировать честный proof pack|Create a truthful proof pack",
        [
          f("country", "Страна|Country", "text", "KZ"),
          ...periodFields(),
          choiceField("dataMode", "Режим|Mode", [actor.mode]),
          yes(
            "acknowledgeDemo",
            "Понимаю, что demo не реальные результаты|Acknowledge demo is not real results",
          ),
          f("teacherWorkload", "Нагрузка и источник|Workload & source"),
          f("resources", "Ресурсы|Resources"),
          f(
            "pilotPlan",
            "План ограниченного пилота|Limited pilot plan",
            "textarea",
          ),
          f("limitations", "Пропуски и ограничения|Gaps & limitations"),
          yes(
            "consent",
            "Публичный проверяемый пакет|Publicly verifiable pack",
          ),
        ],
      );
    }
    if (section === "verification") {
      show(
        "evidence_pack",
        "Статус и целостность пакетов|Pack status & integrity",
      );
      add(
        "evidence_pack.revoke",
        "Отозвать публичный пакет|Revoke public pack",
        [ids("evidence_pack", "packId", "Пакет|Pack"), reason],
      );
    }
  }
  if (app === "ambassador-platform") {
    if (section === "contribution") {
      show(
        "ambassador_identity",
        "Связи с существующим ledger|Existing ledger identity links",
      );
      show("contribution", "Подтверждённые запуски|Confirmed cohort launches");
      if (isAdmin) {
        add(
          "ambassador.link",
          "Связать проверенного взрослого амбассадора|Link verified adult ambassador",
          [
            f(
              "ambassadorId",
              "Legacy ambassador ID|Legacy ambassador ID",
              "text",
              "amb-0",
            ),
            people("subjectId", "Профиль|Profile"),
            f("source", "Основание связи|Mapping source"),
          ],
        );
        add(
          "ambassador.review",
          "Независимо зачесть запуск|Independently credit cohort launch",
          [
            ids("contribution", "claimId", "Заявка|Claim"),
            yes("approved", "Одобрить|Approve"),
            reason,
          ],
        );
      }
      add(
        "ambassador.claim",
        "Подать доказательство вклада|Claim contribution",
        [
          projectionId(
            "cohort.updated",
            "cohortId",
            "Подтверждённый поток|Confirmed cohort",
          ),
          evidence,
          yes("consent", "Разрешить публикацию|Publication permission"),
        ],
      );
    }
    if (section === "internship") {
      show(
        "intern_task",
        "Задачи с назначенным руководителем|Tasks with assigned supervisor",
      );
      if (isAdmin)
        add(
          "intern.assign",
          "Назначить ограниченную задачу|Assign a scoped task",
          [
            scope,
            people("subjectId", "Стажёр|Intern"),
            choiceField("direction", "Направление|Direction", [
              "marketing",
              "support",
              "research",
              "partnerships",
              "events",
              "prototypes",
            ]),
            f("task", "Задача|Task"),
            f("deliverable", "Результат|Deliverable"),
            f("dueAt", "Срок UTC|Due UTC", "text", defaultDate(7)),
            f("hours", "Часов|Hours", "number", 2),
            f("criteria", "Критерии|Criteria"),
          ],
        );
      add("intern.submit", "Сдать свою задачу|Submit assigned task", [
        ids("intern_task", "taskId", "Задача|Task"),
        f("artifact", "Материал|Artifact", "textarea"),
        f("limitations", "Ограничения|Limitations"),
      ]);
      add("intern.review", "Разобрать с руководителем|Supervisor review", [
        ids("intern_task", "taskId", "Задача|Task"),
        status(["accepted", "changes_requested"]),
        f("feedback", "Разбор|Feedback"),
        f("nextTask", "Следующая задача|Next task"),
      ]);
    }
    if (section === "continuation") {
      show("continuation", "Возвращение|Return");
      add(
        "participation.continue",
        "Следующий посильный шаг|Next manageable step",
        [
          choiceField("choice", "Выбор|Choice", [
            "continue",
            "change_hypothesis",
            "pilot",
            "test_others",
            "help_institution",
            "pause",
            "complete",
          ]),
          reason,
          f("nextStep", "Следующий шаг|Next step"),
          f("remindAt", "Когда UTC|When UTC", "text", defaultDate(14)),
          choiceField("frequency", "Частота|Frequency", [
            "off",
            "weekly",
            "monthly",
          ]),
        ],
      );
    }
  }
  if (app === "challenge-platform") {
    if (section === "events") {
      show("event_v2", "События|Events");
      show(
        "entrant",
        "Индивидуалы, проекты и команды|Individuals, projects & teams",
      );
      if (isAdmin)
        add("event.create", "Подготовить событие|Prepare an event", [
          scope,
          f("title", "Название|Title"),
          choiceField("format", "Формат|Format", [
            "problem_battle",
            "prototype_battle",
            "experiment_battle",
            "progress_battle",
            "school_challenge",
            "international_test_exchange",
            "prototype_lab",
            "clinic",
            "reverse_pitch",
            "first_yes",
          ]),
          f("audience", "Аудитория|Audience"),
          choiceField("stage", "Стадия|Stage", [
            "idea",
            "mockup",
            "prototype",
            "product",
          ]),
          f("rules", "Правила|Rules"),
          f("rubric", "Рубрика|Rubric"),
          f("startAt", "Начало UTC|Start UTC", "text", defaultDate(2)),
          f("endAt", "Конец UTC|End UTC", "text", defaultDate(3)),
          f(
            "entrantTypes",
            "Форматы через запятую|Entrant types",
            "text",
            "individual,project,team",
          ),
          f("resources", "Подтверждённые ресурсы|Confirmed resources"),
        ]);
      add(
        "event.enter",
        "Участвовать без искусственной команды|Enter without a fake team",
        [
          ids("event_v2", "eventId", "Событие|Event"),
          choiceField("entrantType", "Формат участия|Entry type", [
            "individual",
            "project",
            "team",
          ]),
          optional(externalProject()),
          optional(
            f(
              "teamId",
              "Legacy team ID — для команды|Legacy team ID — for a team",
            ),
          ),
          f(
            "nextAction",
            "Следующий шаг после события|Next action after event",
          ),
        ],
      );
    }
    if (section === "opportunities") {
      show("opportunity", "Обратные питчи|Reverse pitches");
      add(
        "opportunity.create",
        "Предложить конкретный ресурс|Offer a concrete resource",
        [
          f("title", "Название|Title"),
          f("problem", "Задача партнёра|Partner problem"),
          f("resource", "Ресурс|Resource"),
          f("constraints", "Ограничения|Constraints"),
          f("places", "Мест|Places", "number", 1),
          f("deadline", "Срок UTC|Deadline UTC", "text", defaultDate(14)),
        ],
      );
      add(
        "commitment.request",
        "Попросить следующий ресурс|Request next resource",
        [
          ids("opportunity", "opportunityId", "Возможность|Opportunity"),
          externalProject(),
          f("resource", "Конкретный запрос|Specific request"),
          f("dueAt", "Когда UTC|When UTC", "text", defaultDate(7)),
          f("confirmationMethod", "Как подтвердить?|Confirmation method"),
          yes("consent", "Публичный результат|Public result"),
        ],
      );
    }
    if (section === "commitments") {
      show(
        "commitment",
        "Договорённости и второй выход|Commitments & follow-up",
      );
      add(
        "commitment.transition",
        "Сохранить действие стороны|Record a party's action",
        [
          ids("commitment", "commitmentId", "Договорённость|Commitment"),
          status([
            "accepted",
            "declined",
            "scheduled",
            "delivered",
            "reviewed",
          ]),
          evidence,
        ],
      );
    }
  }
  const primary =
    section === "project" && app === "founder-studio"
      ? "project.create"
      : section === "bookings" && app === "founder-studio"
        ? actor.roles.some((r) => r.role === "expert")
          ? "booking.complete"
          : "booking.hold"
        : null;
  if (primary)
    forms.sort((a, b) => Number(b.op === primary) - Number(a.op === primary));
  return {
    app,
    actor,
    people: service.people(),
    section,
    nav,
    title: TITLES[app],
    summary:
      "Реальное действие → материал → проверка → следующий шаг|Action → artifact → review → next step",
    forms,
    records,
    cards,
    providers: providers(),
    updatedAt: timestamp(),
  };
}
function providers() {
  return {
    configuration: integrationStatus(),
    aiStartify: "not_connected",
    authentication: "local_demo_only",
    payments: "not_connected",
    videoRenderer: "not_connected",
    publishing: "manual_export",
    signing: "manual_authorized_confirmation",
    codeExecution: "not_connected",
    language: "RU/EN manual dictionaries",
  };
}
