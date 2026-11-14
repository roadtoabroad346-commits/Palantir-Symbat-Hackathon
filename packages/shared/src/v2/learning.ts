import { APPS, insist, type Actor, type Data, type RecordV2 } from "./types";
import { Store, timestamp } from "./store";
import { own, readable, requireRole } from "./access";
import {
  bool,
  choice,
  integer,
  jsonObject,
  list,
  publicText,
  safeUrl,
  text,
} from "./validation";
import { projection } from "./events";

export const MISSIONS = [
  {
    id: "trial",
    week: 0,
    title: "Экспедиция в проблему|Problem expedition",
    minutes: 15,
    goal: "Назовите человека и одно затруднение|Name one person and one difficulty",
    example:
      "Педагогу трудно собрать обратную связь|A teacher struggles to collect feedback",
    criterion:
      "Пользователь, ситуация, наблюдение|User, situation, observation",
    next: "research",
  },
  {
    id: "research",
    week: 1,
    title: "Исследование|Research",
    minutes: 45,
    goal: "Составьте нейтральные вопросы, сохраните настоящие наблюдения|Prepare neutral questions and save real observations",
    example:
      "Расскажите о последнем таком случае|Tell me about the last time this happened",
    criterion: "Вопросы, источник, ограничения|Questions, source, limitations",
    next: "brief",
  },
  {
    id: "brief",
    week: 2,
    title: "Мини-ТЗ|Mini brief",
    minutes: 45,
    goal: "Один сценарий, данные, ошибки и критерий|One flow, data, errors and acceptance",
    example:
      "Создать запись; пустой ввод даёт ошибку; запись видна после перезагрузки|Create an entry; empty input errors; entry survives reload",
    criterion: "Сценарий можно проверить|The flow is testable",
    next: "prototype",
  },
  {
    id: "prototype",
    week: 2,
    title: "Прототип|Prototype",
    minutes: 45,
    goal: "Подключите свой прототип и проверьте его|Connect and check your own prototype",
    example: "Изменяйте по одной функции|Change one function at a time",
    criterion: "Сохранённая версия и проверки|Saved version and checks",
    next: "test",
  },
  {
    id: "test",
    week: 3,
    title: "Пользовательская проверка|User test",
    minutes: 45,
    goal: "Дайте релевантному участнику конкретное задание|Give a relevant participant a concrete task",
    example: "Найдите действие без подсказки|Find the action without a hint",
    criterion:
      "Исходные ответы и затруднения|Original responses and difficulties",
    next: "change",
  },
  {
    id: "change",
    week: 3,
    title: "Изменение|Change",
    minutes: 45,
    goal: "Исправьте одну проблему и проверьте снова|Fix one problem and retest",
    example:
      "Нулевой результат — основание улучшить гипотезу|A negative result is a reason to improve the hypothesis",
    criterion: "До, после, основание|Before, after, reason",
    next: "pilot",
  },
  {
    id: "pilot",
    week: 4,
    title: "План пилота|Pilot plan",
    minutes: 45,
    goal: "Согласуйте маленький следующий шаг|Agree a small next step",
    example:
      "Один класс, одно занятие, ответственный|One class, one lesson, one coordinator",
    criterion: "Кто, что, когда, ограничение|Who, what, when, limitation",
    next: "portfolio",
  },
  {
    id: "portfolio",
    week: 4,
    title: "История и продолжение|Story and continuation",
    minutes: 45,
    goal: "Покажите проверку, изменение и следующий эксперимент|Show the test, change and next experiment",
    example: "Предполагал → проверил → изменил|Assumed → tested → changed",
    criterion:
      "Материалы, ограничения, выбор продолжения|Artifacts, limits, continuation choice",
    next: "continue",
  },
];
export const CHECKS = [
  "main_path",
  "empty_input",
  "invalid_input",
  "save",
  "reopen",
  "unavailable",
  "recovery",
];
export function publishProject(store: Store, actor: Actor, project: RecordV2) {
  const d = project.data;
  const payload = {
    title: d.title,
    problem: d.problem,
    audience: d.audience,
    stage: d.stage,
    ownerFounderId: project.owner,
    ownerCountry: store.get(project.owner, "identity").data.country,
    entrantType: d.teamId ? "team" : "individual",
    teamId: d.teamId ?? null,
    country: d.country,
    institutionId: d.institutionId ?? null,
    cohortId: d.cohortId ?? null,
    affiliations: d.affiliations ?? [],
    consent: d.consent === true,
    prototypeUrl: d.consent ? (d.prototypeUrl ?? "") : "",
    evidenceRefs: d.consent ? (d.evidenceRefs ?? []) : [],
    localActivation: d.localActivation === true,
    activatedAt: d.activatedAt ?? null,
    meaningfulActionDates: d.meaningfulActionDates ?? [],
    upstreamActivation: false,
    upstreamPublication: false,
    revoked: d.consent !== true,
    visibility: project.visibility,
  };
  store.emit(
    d.consent ? "project.updated" : "project.revoked",
    actor,
    project,
    payload,
    Object.keys(APPS) as (keyof typeof APPS)[],
  );
}
export function learningMutate(
  store: Store,
  actor: Actor,
  op: string,
  d: Data,
): Data | undefined {
  if (op === "team.create") {
    requireRole(actor, ["founder"], actor.id);
    const memberIds = list(d, "memberIds", 5);
    insist(
      memberIds.includes(actor.id) && memberIds.length >= 2,
      "invalid_team",
      "Team needs 2–5 members including its owner",
    );
    for (const id of memberIds) store.get(id, "identity");
    return store.create("team_v2", actor, {
      title: publicText(d, "title"),
      memberIds,
      acceptedIds: [actor.id],
      status: "inviting",
      consent: false,
    });
  }
  if (op === "team.accept") {
    const team = store.get(text(d, "teamId", 160), "team_v2");
    insist(
      team.mode === actor.mode && team.data.memberIds.includes(actor.id),
      "forbidden",
      "Only invited member may accept",
      403,
    );
    const acceptedIds = [...new Set([...team.data.acceptedIds, actor.id])],
      updated = store.update(team, {
        ...team.data,
        acceptedIds,
        status: acceptedIds.length >= 2 ? "active" : "inviting",
      });
    store.emit(
      "team.updated",
      actor,
      updated,
      {
        title: updated.data.title,
        memberIds: acceptedIds,
        ownerFounderId: team.owner,
        consent: false,
        status: updated.data.status,
      },
      ["challenge-platform", "school-league"],
    );
    return updated;
  }
  if (op === "project.team") {
    const project = store.get(text(d, "projectId", 160), "project");
    own(actor, project);
    const teamId = text(d, "teamId", 160, true);
    if (teamId) {
      const team = store.get(teamId, "team_v2");
      insist(
        team.mode === actor.mode &&
          team.data.status === "active" &&
          team.data.acceptedIds.includes(actor.id),
        "team_ineligible",
        "Active team membership required",
        403,
      );
    }
    const updated = store.update(project, {
      ...project.data,
      teamId: teamId || null,
    });
    publishProject(store, actor, updated);
    return updated;
  }
  if (op === "project.affiliation") {
    const project = store.get(text(d, "projectId", 160), "project");
    own(actor, project);
    const affiliations = list(d, "affiliations", 20),
      primary = text(d, "primaryInstitutionId", 160, true);
    insist(
      !primary || affiliations.includes(primary),
      "invalid_affiliation",
      "Primary institution must be an affiliation",
    );
    for (const id of affiliations)
      projection(store, id, ["institution.updated"], actor.mode);
    const updated = store.update(project, {
      ...project.data,
      affiliations,
      institutionId: primary || null,
    });
    store.create("affiliation_history", actor, {
      projectId: project.id,
      previous: project.data.affiliations,
      current: affiliations,
      primaryInstitutionId: primary || null,
      reason: text(d, "reason"),
    });
    publishProject(store, actor, updated);
    return updated;
  }
  if (op === "project.create") {
    requireRole(actor, ["founder"], actor.id);
    const institutionId = text(d, "institutionId", 160, true),
      cohortId = text(d, "cohortId", 160, true);
    if (institutionId) {
      const org = projection(
        store,
        institutionId,
        ["institution.updated"],
        actor.mode,
      );
      insist(
        org.payload.status !== "archived",
        "invalid_institution",
        "Institution unavailable",
      );
    }
    if (cohortId) {
      const c = projection(store, cohortId, ["cohort.updated"], actor.mode);
      insist(
        c.payload.institutionId === institutionId &&
          c.payload.participantIds?.includes(actor.id),
        "forbidden",
        "Нет записи в поток / Not enrolled in cohort",
        403,
      );
    }
    const record = store.create("project", actor, {
      title: publicText(d, "title"),
      problem: publicText(d, "problem", 1000),
      audience: publicText(d, "audience"),
      stage: choice(d, "stage", [
        "no_idea",
        "idea",
        "mockup",
        "prototype",
        "product",
      ]),
      country: choice(d, "country", [
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
      institutionId: institutionId || null,
      cohortId: cohortId || null,
      affiliations: institutionId ? [institutionId] : [],
      nextMission: "trial",
      consent: false,
      localActivation: false,
      activatedAt: null,
      meaningfulActionDates: [],
      upstreamActivation: false,
      upstreamPublication: false,
      evidenceRefs: [],
    });
    publishProject(store, actor, record);
    return record;
  }
  if (
    [
      "project.update",
      "project.visibility",
      "mission.submit",
      "prototype.save",
      "prototype.check",
      "bug.report",
      "bug.resolve",
      "experiment.create",
      "help.request",
      "notification.settings",
      "portfolio.issue",
    ].includes(op)
  ) {
    const project = store.get(text(d, "projectId", 160), "project");
    own(actor, project);
    if (op === "project.update") {
      const data = {
        ...project.data,
        title: publicText(d, "title"),
        problem: publicText(d, "problem", 1000),
        audience: publicText(d, "audience"),
        stage: choice(d, "stage", [
          "no_idea",
          "idea",
          "mockup",
          "prototype",
          "product",
        ]),
      };
      const updated = store.update(project, data);
      store.create(
        "project_version",
        actor,
        { projectId: project.id, previous: project.data, current: data },
        { scope: project.scope },
      );
      publishProject(store, actor, updated);
      return updated;
    }
    if (op === "project.visibility") {
      const visibility = choice(d, "visibility", [
          "private",
          "cohort",
          "institution",
          "public",
        ]),
        consent = bool(d, "consent");
      insist(
        visibility !== "public" || consent,
        "consent_required",
        "Нужно разрешение на публикацию / Public permission required",
      );
      const updated = store.update(
        project,
        { ...project.data, consent: visibility === "public" && consent },
        visibility,
      );
      store.create("consent", actor, {
        projectId: project.id,
        visibility,
        granted: consent,
        version: updated.revision,
      });
      publishProject(store, actor, updated);
      return updated;
    }
    if (op === "mission.submit") {
      const missionId = choice(
          d,
          "missionId",
          MISSIONS.map((m) => m.id),
        ),
        mission = MISSIONS.find((m) => m.id === missionId)!;
      const submission = store.create(
        "submission",
        actor,
        {
          projectId: project.id,
          missionId,
          artifact: text(d, "artifact", 12000),
          source: text(d, "source", 2000),
          limitations: text(d, "limitations"),
          recommendation: "manual_rules",
          feedback:
            "Материал сохранён. Проверьте критерий миссии; это не доказательство внешнего действия / Saved. Check mission criteria; this is not proof of external action.",
        },
        { scope: project.scope },
      );
      const updated = store.update(project, {
        ...project.data,
        nextMission: mission.next,
        localActivation: true,
        activatedAt: project.data.activatedAt ?? timestamp(),
        meaningfulActionDates: [
          ...(project.data.meaningfulActionDates ?? []),
          timestamp(),
        ],
        evidenceRefs: [...project.data.evidenceRefs, submission.id],
      });
      publishProject(store, actor, updated);
      return submission;
    }
    if (op === "prototype.save") {
      const brief = jsonObject(d, "brief");
      for (const key of [
        "user",
        "task",
        "actions",
        "data",
        "constraints",
        "errors",
        "acceptance",
      ])
        text(brief, key, 4000);
      const record = store.create(
        "prototype_version",
        actor,
        {
          projectId: project.id,
          route: choice(d, "route", ["no_code", "guided", "existing"]),
          brief,
          prompt: `${brief.user}\n${brief.task}\n${brief.constraints}\n${brief.acceptance}`,
          url: safeUrl(d.url),
          change: text(d, "change"),
          provider: "manual",
          version:
            store
              .list("prototype_version", actor.mode)
              .filter((r) => r.data.projectId === project.id).length + 1,
        },
        { scope: project.scope },
      );
      const updated = store.update(project, {
        ...project.data,
        prototypeUrl: record.data.url,
        stage: "prototype",
      });
      publishProject(store, actor, updated);
      return record;
    }
    if (op === "prototype.check") {
      const version = store.get(
        text(d, "prototypeId", 160),
        "prototype_version",
      );
      insist(
        version.data.projectId === project.id,
        "invalid_reference",
        "Prototype belongs to another project",
      );
      const checks = jsonObject(d, "checks");
      for (const key of CHECKS) {
        insist(
          checks[key] && typeof checks[key] === "object",
          "invalid_check",
          `Missing ${key}`,
        );
        choice(checks[key], "status", ["passed", "failed", "blocked"]);
        text(checks[key], "expected");
        text(checks[key], "observed");
        text(checks[key], "reproduce");
      }
      return store.create(
        "prototype_check",
        actor,
        {
          projectId: project.id,
          prototypeId: version.id,
          checks,
          method: "human_check",
          passed: CHECKS.every((k) => checks[k].status === "passed"),
          verificationStatus: "self_reported",
        },
        { scope: project.scope },
      );
    }
    if (op === "bug.report")
      return store.create(
        "bug",
        actor,
        {
          projectId: project.id,
          expected: text(d, "expected"),
          observed: text(d, "observed"),
          reproduce: text(d, "reproduce"),
          error: text(d, "error", 4000, true),
          lastChange: text(d, "lastChange"),
          status: "open",
        },
        { scope: project.scope },
      );
    if (op === "bug.resolve") {
      const bug = store.get(text(d, "bugId", 160), "bug");
      insist(
        bug.data.projectId === project.id,
        "invalid_reference",
        "Bug belongs to another project",
      );
      const check = store.get(text(d, "checkId", 160), "prototype_check");
      insist(
        check.data.projectId === project.id &&
          check.data.passed &&
          check.createdAt >= bug.createdAt,
        "failed_retest",
        "Нужна новая успешная проверка / New passing check required",
      );
      return store.update(bug, {
        ...bug.data,
        status: "resolved",
        change: text(d, "change"),
        checkId: check.id,
      });
    }
    if (op === "experiment.create")
      return store.create(
        "experiment",
        actor,
        {
          projectId: project.id,
          hypothesis: text(d, "hypothesis"),
          target: text(d, "target"),
          screening: {
            role: text(d, "role", 80),
            language: choice(d, "language", ["ru", "en"]),
            minAge: integer(d, "minAge", 13, 100),
            maxAge: integer(d, "maxAge", 13, 100),
          },
          task: text(d, "task"),
          format: choice(d, "format", [
            "problem",
            "concept",
            "usability",
            "comparison",
          ]),
          deadline: text(d, "deadline", 40),
          status: "recruiting",
          decision: null,
        },
        { scope: project.scope },
      );
    if (op === "help.request")
      return store.create(
        "help_request",
        actor,
        {
          projectId: project.id,
          reason: choice(d, "reason", [
            "explain",
            "example",
            "start",
            "review",
            "stuck",
            "workshop",
            "coordinator",
          ]),
          question: text(d, "question"),
          status: "open",
          nextAction: "coordinator_review",
        },
        { scope: project.scope },
      );
    if (op === "notification.settings")
      return store.create("notification_preference", actor, {
        projectId: project.id,
        frequency: choice(d, "frequency", ["off", "daily", "weekly"]),
        channel: "in_app",
      });
    if (op === "portfolio.issue") {
      const evidenceRefs = list(d, "evidenceRefs");
      insist(evidenceRefs.length > 0, "evidence_required", "Evidence required");
      for (const id of evidenceRefs) {
        const evidence = store.get(id);
        own(actor, evidence);
        insist(
          evidence.data.projectId === project.id,
          "invalid_reference",
          "Evidence belongs to another project",
        );
      }
      return store.create("portfolio", actor, {
        projectId: project.id,
        issuer: "Growth Hub local demo",
        program: "residency-v2",
        criteria: text(d, "criteria"),
        evidenceRefs,
        issuedAt: timestamp(),
        status: "demo",
        official: false,
        verificationURL: "/v2?section=results",
      });
    }
  }
  if (op === "tester.profile")
    return store.create("tester_profile", actor, {
      role: text(d, "role", 80),
      language: choice(d, "language", ["ru", "en"]),
      age: integer(d, "age", 13, 100),
      interests: list(d, "interests"),
      consent: bool(d, "consent"),
      experience: text(d, "experience"),
    });
  if (
    ["experiment.apply", "experiment.respond", "experiment.decide"].includes(op)
  ) {
    const experiment = store.get(text(d, "experimentId", 160), "experiment");
    if (op === "experiment.apply") {
      const profile = store
        .list("tester_profile", actor.mode)
        .find((r) => r.owner === actor.id && r.data.consent);
      insist(
        profile,
        "screening_failed",
        "Заполните профиль тестировщика и согласие / Tester profile and consent required",
      );
      const s = experiment.data.screening;
      insist(
        experiment.mode === actor.mode &&
          experiment.data.status === "recruiting" &&
          experiment.owner !== actor.id &&
          profile.data.role === s.role &&
          profile.data.language === s.language &&
          profile.data.age >= s.minAge &&
          profile.data.age <= s.maxAge,
        "screening_failed",
        "Профиль не соответствует screening / Profile does not match screening",
      );
      const old = store
        .list("tester_application", actor.mode)
        .find(
          (r) => r.owner === actor.id && r.data.experimentId === experiment.id,
        );
      if (old) return old;
      return store.create("tester_application", actor, {
        experimentId: experiment.id,
        projectId: experiment.data.projectId,
        status: "eligible",
        reason: `role=${s.role}; language=${s.language}; age in [${s.minAge},${s.maxAge}]`,
      });
    }
    if (op === "experiment.respond") {
      const application = store
        .list("tester_application", actor.mode)
        .find(
          (r) =>
            r.owner === actor.id &&
            r.data.experimentId === experiment.id &&
            r.data.status === "eligible",
        );
      insist(
        application && experiment.data.status === "recruiting",
        "forbidden",
        "Нужна подходящая заявка / Eligible application required",
        403,
      );
      insist(
        bool(d, "permission"),
        "consent_required",
        "Разрешение на использование в исследовании обязательно / Research permission required",
      );
      const record = store.create(
        "response",
        actor,
        {
          experimentId: experiment.id,
          projectId: experiment.data.projectId,
          original: text(d, "original", 8000),
          completed: bool(d, "completed"),
          difficulty: text(d, "difficulty"),
          permission: bool(d, "permission"),
          founderId: experiment.owner,
          source: "voluntary_tester",
        },
        { scope: experiment.scope },
      );
      store.update(application, { ...application.data, status: "responded" });
      return record;
    }
    own(actor, experiment);
    const responses = store
      .list("response", actor.mode)
      .filter((r) => r.data.experimentId === experiment.id);
    insist(responses.length > 0, "no_responses", "Нет ответов / No responses");
    return store.update(experiment, {
      ...experiment.data,
      status: "completed",
      decision: choice(d, "decision", [
        "change",
        "refine_audience",
        "more_data",
        "continue",
        "stop",
      ]),
      assumed: text(d, "assumed"),
      learned: text(d, "learned"),
      changed: text(d, "changed"),
      limitations: text(d, "limitations"),
      nextStep: text(d, "nextStep"),
      summary: responses.map((r) => ({
        responseId: r.id,
        text: r.data.original,
        completed: r.data.completed,
      })),
      sampleSize: responses.length,
      sampleNote:
        "Предварительные наблюдения, не подтверждение рынка / Preliminary observations, not market proof",
    });
  }
  if (op === "help.reply") {
    const record = store.get(text(d, "helpId", 160), "help_request");
    requireRole(actor, ["coordinator", "teacher"], record.scope);
    return store.update(record, {
      ...record.data,
      reply: text(d, "reply"),
      action: text(d, "action"),
      dueAt: text(d, "dueAt", 40),
      status: "answered",
    });
  }
  if (op === "record.read")
    return readable(actor, store.get(text(d, "id", 160)));
  return undefined;
}
