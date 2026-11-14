import { assertPublic, piiGuard } from "../index";
import { insist, type Data } from "./types";
export function text(
  data: Data,
  key: string,
  max = 4000,
  optional = false,
): string {
  const value = data[key];
  insist(
    (value === undefined && optional) || typeof value === "string",
    "invalid_input",
    `Неверное поле / Invalid field: ${key}`,
  );
  const result = String(value ?? "").trim();
  insist(
    (optional || result.length > 0) && result.length <= max,
    "invalid_input",
    `Заполните / Required: ${key} (max ${max})`,
  );
  return result;
}
export function publicText(data: Data, key: string, max = 300) {
  const value = text(data, key, max);
  assertPublic(value);
  return value;
}
export function institutionTitle(data: Data, key = "title") {
  const value = text(data, key, 300),
    errors = piiGuard(value).filter((e) => !e.startsWith("Use a nickname"));
  insist(!errors.length, "invalid_public_text", errors.join("; "));
  return value;
}
export function choice<const T extends readonly string[]>(
  data: Data,
  key: string,
  options: T,
  fallback?: T[number],
) {
  const value = data[key] ?? fallback;
  insist(
    typeof value === "string" && options.includes(value),
    "invalid_input",
    `Недопустимое значение / Invalid ${key}`,
  );
  return value as T[number];
}
export function integer(data: Data, key: string, min = 0, max = 1e9) {
  const value =
    typeof data[key] === "number"
      ? data[key]
      : typeof data[key] === "string" && data[key].trim()
        ? Number(data[key])
        : NaN;
  insist(
    Number.isSafeInteger(value) && value >= min && value <= max,
    "invalid_input",
    `Нужно целое число / Integer required: ${key}`,
  );
  return value;
}
export function bool(data: Data, key: string) {
  insist(
    [true, false, "true", "false"].includes(data[key]),
    "invalid_input",
    `Invalid ${key}`,
  );
  return data[key] === true || data[key] === "true";
}
export function iso(data: Data, key: string) {
  const value = text(data, key, 40);
  insist(
    /^\d{4}-\d\d-\d\dT.*Z$/.test(value) && Number.isFinite(Date.parse(value)),
    "invalid_date",
    `${key}: ISO UTC required`,
  );
  return new Date(value).toISOString();
}
export function period(data: Data) {
  const start = iso(data, "periodStart"),
    end = iso(data, "periodEnd");
  insist(
    start < end,
    "invalid_period",
    "Начало должно быть раньше конца / Start must precede end",
  );
  return { periodStart: start, periodEnd: end };
}
export function timezone(value: unknown) {
  insist(
    typeof value === "string",
    "invalid_timezone",
    "IANA timezone required",
  );
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
  } catch {
    insist(false, "invalid_timezone", "Unknown IANA timezone");
  }
  return value;
}
export function safeUrl(value: unknown, optional = false): string {
  if (!value && optional) return "";
  insist(
    typeof value === "string" && value.length <= 2048,
    "invalid_url",
    "URL required",
  );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    insist(false, "invalid_url", "Invalid URL");
  }
  insist(
    ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password,
    "invalid_url",
    "Only HTTP(S), no credentials",
  );
  url.hash = "";
  return url.toString();
}
export function list(data: Data, key: string, max = 100): string[] {
  const values = Array.isArray(data[key])
    ? data[key]
    : String(data[key] ?? "").split(",");
  insist(values.length <= max, "invalid_input", `Too many ${key}`);
  return [
    ...new Set(
      values
        .map((s: unknown) => {
          insist(
            typeof s === "string" && s.trim().length <= 150,
            "invalid_input",
            `Invalid ${key}`,
          );
          return s.trim();
        })
        .filter(Boolean),
    ),
  ] as string[];
}
export function jsonObject(data: Data, key: string): Data {
  let value = data[key];
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      insist(false, "invalid_json", `Invalid JSON: ${key}`);
    }
  }
  insist(
    value && typeof value === "object" && !Array.isArray(value),
    "invalid_input",
    `Object required: ${key}`,
  );
  return value;
}
export function transition(
  current: string,
  next: string,
  graph: Record<string, string[]>,
) {
  insist(
    graph[current]?.includes(next),
    "invalid_transition",
    `${current} → ${next} недоступно / unavailable`,
    409,
  );
}
