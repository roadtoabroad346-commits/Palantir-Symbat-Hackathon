export type Language = "ru" | "en";
export type DirectionKey =
  | "growth"
  | "ambassador"
  | "challenge"
  | "portal"
  | "league";
export interface Country {
  iso: string;
  nameRu: string;
  nameEn: string;
  lat: number;
  lng: number;
  wave: number;
  primaryLang: string;
}
export interface Metric {
  iso: string;
  direction: DirectionKey;
  monthIndex: number;
  primaryMetric: number;
  secondaryMetric: number;
  capture: number;
}
export interface GlobalMonthly {
  monthIndex: number;
  users: number;
  publishedProjects: number;
  schools: number;
  ambassadors: number;
  activeCampaigns: number;
}
export type FeedbackCategory =
  | "localization"
  | "translation"
  | "content"
  | "ux"
  | "feature"
  | "compliance"
  | "offline";
export type AuthorType = "ambassador" | "student" | "teacher";
export type FeedbackStatus = "new" | "triaged" | "planned" | "shipped";
export interface Feedback {
  id: string;
  iso: string;
  direction: DirectionKey;
  authorType: AuthorType;
  nickname: string;
  category: FeedbackCategory;
  lang: string;
  textOriginal: string;
  textRu: string;
  textEn: string;
  sentiment: "positive" | "neutral" | "negative";
  votes: number;
  status: FeedbackStatus;
  createdAt: string;
}
export interface DashboardState {
  countries: Country[];
  metrics: Metric[];
  globals: GlobalMonthly[];
  feedback: Feedback[];
}
export interface Pulse {
  id: string;
  iso: string;
  direction: DirectionKey;
}
export interface FeedbackInput {
  iso: string;
  direction: DirectionKey;
  authorType: AuthorType;
  nickname: string;
  category: FeedbackCategory;
  lang: Language;
  text: string;
}
export interface Direction {
  key: DirectionKey;
  nameRu: string;
  nameEn: string;
  color: string;
  shape: "circle" | "triangle" | "square" | "diamond" | "hexagon";
  letter: string;
  primaryRu: string;
  primaryEn: string;
  secondaryRu: string;
  secondaryEn: string;
  weight: number;
}
