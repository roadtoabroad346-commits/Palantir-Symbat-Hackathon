export const names: Record<string, string> = {
  "growth-engine": "Growth engine",
  "ambassador-platform": "Ambassador network",
  "challenge-platform": "Startup challenges",
  "school-portal": "School studio",
  "school-league": "School league",
};
export const menus: Record<string, [string, string][]> = {
  "growth-engine": [
    ["/campaigns", "Кампании|Campaigns"],
    ["/campaigns/new", "Новая кампания|New campaign"],
    ["/analytics", "Аналитика|Analytics"],
    ["/compliance", "Безопасность|Compliance"],
  ],
  "ambassador-platform": [
    ["/dashboard", "Обзор|Dashboard"],
    ["/join", "Стать амбассадором|Join"],
    ["/tasks", "Задания|Tasks"],
    ["/rewards", "Награды|Rewards"],
    ["/leaderboard", "Рейтинг|Leaderboard"],
    ["/admin", "Управление|Admin"],
  ],
  "challenge-platform": [
    ["/challenges", "Челленджи|Challenges"],
    ["/judge", "Оценить|Judge"],
    ["/admin", "Управление|Admin"],
    ["/showcase", "Финалисты|Showcase"],
  ],
  "school-portal": [
    ["/dashboard", "Обзор|Dashboard"],
    ["/register", "Добавить школу|Register school"],
    ["/lesson-kit", "Четыре занятия|Lesson kit"],
    ["/reports", "Отчёты|Reports"],
    ["/partner", "Партнёрства|Partners"],
  ],
  "school-league": [
    ["/", "Рейтинг|Leaderboard"],
    ["/join", "Найти школу|Join school"],
    ["/card", "Карточка основателя|Founder card"],
    ["/admin", "Сезоны|Seasons"],
  ],
};
export const roleMap: Record<string, string[]> = {
  "growth-engine": ["viewer", "growth-manager"],
  "ambassador-platform": ["visitor", "ambassador", "admin"],
  "challenge-platform": ["student", "teacher", "judge", "admin"],
  "school-portal": ["teacher", "partner-manager"],
  "school-league": ["visitor", "student", "teacher"],
};
