import { randomUUID } from "node:crypto";
import { countries, assertPublic } from "../index";
import type { Row, Database, Field } from "./types";
export const uid = () => randomUUID();
export const now = () => new Date();
export const date = (day: number) => new Date(Date.UTC(2026, 10, 1 + day));
export const field = (
  name: string,
  label: string,
  type = "text",
  options?: string[],
  value?: string | number,
): Field => ({ name, label, type, options, value, required: true });
export const optionsCountry = () =>
  field(
    "country",
    "Страна|Country",
    "select",
    countries.map((c) => c.code),
  );
export function required(d: Row, k: string) {
  const s = String(d[k] ?? "").trim();
  if (!s || s.length > 3000) throw new Error(`Required / Заполните: ${k}`);
  return s;
}
export function number(d: Row, k: string, min = 0, max = 1e6) {
  const n = Number(d[k]);
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error(`Invalid / Недопустимое значение: ${k}`);
  return n;
}
export function choose(d: Row, k: string, values: string[]) {
  const v = required(d, k);
  if (!values.includes(v)) throw new Error(`Invalid ${k}`);
  return v;
}
export const publicText = (d: Row, k: string) => {
  const s = required(d, k);
  assertPublic(s);
  return s;
};
export const add = (db: Database, model: string, data: Row) =>
  db[model].create({ data });
export const get = async (db: Database, model: string, id: string) => {
  const row = await db[model].findUnique({ where: { id } });
  if (!row) throw new Error("Record not found / Запись не найдена");
  return row;
};
