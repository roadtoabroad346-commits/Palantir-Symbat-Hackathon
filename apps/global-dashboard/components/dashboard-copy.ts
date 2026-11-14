import { DIRECTIONS } from "../config/directions";
import type { DirectionKey } from "../lib/types";
export const categories = [
  "localization",
  "translation",
  "content",
  "ux",
  "feature",
  "compliance",
  "offline",
];
export const statuses = ["new", "triaged", "planned", "shipped"];
export const authorNames: Record<string, [string, string]> = {
  ambassador: ["Амбассадор", "Ambassador"],
  student: ["Ученик", "Student"],
  teacher: ["Учитель", "Teacher"],
};
export const categoryNames: Record<string, [string, string]> = {
  localization: ["Локализация", "Localization"],
  translation: ["Перевод", "Translation"],
  content: ["Материалы", "Content"],
  ux: ["Удобство", "UX"],
  feature: ["Возможности", "Feature"],
  compliance: ["Правила и согласие", "Compliance"],
  offline: ["Без интернета", "Offline"],
};
export const statusNames: Record<string, [string, string]> = {
  new: ["Новое", "New"],
  triaged: ["Рассмотрено", "Triaged"],
  planned: ["В планах", "Planned"],
  shipped: ["Готово", "Shipped"],
};
export function shape(key: DirectionKey) {
  return DIRECTIONS.find((d) => d.key === key)!;
}
