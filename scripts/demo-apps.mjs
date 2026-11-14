export const DEMO_APPS = [
  {
    key: "globe",
    name: "global-dashboard",
    port: 3006,
    route: "/",
    role: null,
    color: "#bfe887",
    title: ["3D-глобус · Global Impact", "3D globe · Global Impact"],
    summary: [
      "Рост по странам, пять направлений и голоса сообщества.",
      "Country growth, five directions and community voices.",
    ],
    steps: [
      "Нажмите Play под глобусом → выберите страну → добавьте отзыв. P — презентация.",
      "Press Play below the globe → choose a country → add feedback. P for presenter.",
    ],
    icon: "◎",
  },
  {
    key: "growth",
    name: "growth-engine",
    port: 3001,
    route: "/campaigns",
    role: "growth-manager",
    color: "#c5ee77",
    title: ["Привлечение · Growth Engine", "Growth engine"],
    summary: [
      "Кампании, три варианта текста, реферальные ссылки и аналитика.",
      "Campaigns, three copy variants, referral links and analytics.",
    ],
    steps: [
      "Создайте кампанию → симулируйте активность → откройте аналитику и CSV.",
      "Create a campaign → simulate activity → explore analytics and CSV.",
    ],
    icon: "↗",
  },
  {
    key: "ambassador",
    name: "ambassador-platform",
    port: 3002,
    route: "/dashboard",
    role: "ambassador",
    color: "#f7ca86",
    title: ["Амбассадоры", "Ambassador network"],
    summary: [
      "Задания, баллы, награды и проверка подозрительной активности.",
      "Tasks, points, rewards and suspicious-activity review.",
    ],
    steps: [
      "Отправьте задание → выберите роль admin и одобрите → заберите награду.",
      "Submit a task → switch to admin and approve it → redeem a reward.",
    ],
    icon: "◇",
  },
  {
    key: "challenge",
    name: "challenge-platform",
    port: 3003,
    route: "/challenges",
    role: "teacher",
    color: "#c9beff",
    title: ["Челленджи стартапов", "Startup challenges"],
    summary: [
      "Команды, прогресс, судейские оценки и итоговые рейтинги.",
      "Teams, progress, judge scores and final rankings.",
    ],
    steps: [
      "Откройте челлендж → создайте команду → симулируйте прогресс → оцените как judge.",
      "Open a challenge → create a team → simulate progress → score as judge.",
    ],
    icon: "✦",
  },
  {
    key: "portal",
    name: "school-portal",
    port: 3004,
    route: "/dashboard",
    role: "teacher",
    color: "#a8deef",
    title: ["Школьный портал", "School studio"],
    summary: [
      "Классы, безопасный импорт никнеймов, занятия и отчёты.",
      "Classes, safe nickname imports, lessons and reports.",
    ],
    steps: [
      "Откройте класс → импортируйте никнеймы → симулируйте прогресс → скачайте отчёт.",
      "Open a class → import nicknames → simulate progress → download a report.",
    ],
    icon: "▤",
  },
  {
    key: "league",
    name: "school-league",
    port: 3005,
    route: "/",
    role: "teacher",
    color: "#f1db77",
    title: ["Школьная лига", "School league"],
    summary: [
      "Рейтинг школ и стран, сезоны и карточка основателя в PNG.",
      "School and country rankings, seasons and founder card PNG.",
    ],
    steps: [
      "Найдите школу по START-001 → опубликуйте карточку → скачайте PNG → проверьте рейтинг.",
      "Find a school with START-001 → publish a card → download PNG → check the ranks.",
    ],
    icon: "⚑",
  },
  {
    key: "founder",
    name: "founder-studio",
    port: 3007,
    route: "/v2",
    role: null,
    v2: true,
    subjectId: "demo-ed29282c1588b038c3df9463",
    color: "#b8df9b",
    title: ["Студия фаундера", "Founder studio"],
    summary: [
      "Индивидуальный проект, обучение, прототип, SIGNAL и помощь.",
      "Individual project, learning, prototype, SIGNAL and support.",
    ],
    steps: [
      "Выберите NovaSolo → создайте проект → сохраните миссию → проверьте прототип.",
      "Choose NovaSolo → create a project → save a mission → check a prototype.",
    ],
    icon: "△",
  },
];
export function identifyApp(app, data) {
  if (!data || typeof data !== "object") return false;
  if (app.key === "globe" && data.schemaVersion === 2)
    return (
      data.app === app.name &&
      data.dataMode === "demo" &&
      Array.isArray(data.countries) &&
      data.countries.length > 0 &&
      Array.isArray(data.globals) &&
      data.globals.length > 0 &&
      Array.isArray(data.metrics) &&
      data.metrics.length === data.countries.length * data.globals.length * 5
    );
  return app.key === "globe"
    ? Array.isArray(data.countries) &&
        data.countries.length === 10 &&
        Array.isArray(data.globals) &&
        data.globals.length === 13 &&
        Array.isArray(data.metrics) &&
        data.metrics.length === 650
    : data.app === app.name;
}
export function appUrl(origin, port, path = "/") {
  const url = new URL(origin);
  url.port = String(port);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}
