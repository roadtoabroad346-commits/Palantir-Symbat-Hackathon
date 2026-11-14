export const APPS = {
  "growth-engine": 3001,
  "ambassador-platform": 3002,
  "challenge-platform": 3003,
  "school-portal": 3004,
  "school-league": 3005,
  "global-dashboard": 3006,
  "founder-studio": 3007,
} as const;
export type App = keyof typeof APPS;
export type Mode = "demo" | "pilot" | "production";
export type Verification =
  | "self_reported"
  | "pending"
  | "verified"
  | "rejected"
  | "revoked";
export type Data = Record<string, any>;
export type Actor = {
  id: string;
  label: string;
  mode: Mode;
  timezone?: string;
  roles: { role: string; scope: string }[];
};
export type RecordV2 = {
  id: string;
  kind: string;
  scope: string;
  owner: string;
  mode: Mode;
  visibility: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: Data;
};
export type EventV2 = {
  eventId: string;
  schemaVersion: 2;
  type: string;
  occurredAt: string;
  producer: App;
  subjectRef: string;
  entityRef: string;
  institutionRef?: string;
  cohortRef?: string;
  correlationId: string;
  causationId?: string;
  dataMode: Mode;
  verification: Verification;
  sequence: number;
  payload: Data;
};
export type FieldV2 = {
  name: string;
  label: string;
  type?: string;
  options?: string[];
  optionLabels?: Record<string, string>;
  value?: string | number;
  required?: boolean;
  hint?: string;
};
export type FormV2 = {
  op: string;
  title: string;
  fields: FieldV2[];
  hidden?: Data;
  button?: string;
};
export type Workspace = {
  app: App;
  actor: Actor | null;
  people: { id: string; label: string }[];
  section: string;
  nav: { key: string; label: string }[];
  title: string;
  summary: string;
  forms: FormV2[];
  records: { title: string; items: Data[] }[];
  cards: { title: string; text: string; href?: string }[];
  providers: Data;
  updatedAt: string;
};
export class HubError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function insist(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new HubError(code, message, status);
}
export const field = (
  name: string,
  label: string,
  type = "text",
  value?: string | number,
  options?: string[],
): FieldV2 => ({ name, label, type, value, options, required: true });
