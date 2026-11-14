import type { Country, DirectionKey } from "../lib/types";
export const COUNTRIES: Country[] = [
  {
    iso: "KZ",
    nameRu: "Казахстан",
    nameEn: "Kazakhstan",
    lat: 48.02,
    lng: 66.92,
    wave: 1,
    primaryLang: "kk",
  },
  {
    iso: "UZ",
    nameRu: "Узбекистан",
    nameEn: "Uzbekistan",
    lat: 41.38,
    lng: 64.58,
    wave: 1,
    primaryLang: "uz",
  },
  {
    iso: "KG",
    nameRu: "Кыргызстан",
    nameEn: "Kyrgyzstan",
    lat: 41.2,
    lng: 74.77,
    wave: 1,
    primaryLang: "ky",
  },
  {
    iso: "IN",
    nameRu: "Индия",
    nameEn: "India",
    lat: 22.59,
    lng: 78.96,
    wave: 2,
    primaryLang: "hi",
  },
  {
    iso: "NG",
    nameRu: "Нигерия",
    nameEn: "Nigeria",
    lat: 9.08,
    lng: 8.68,
    wave: 2,
    primaryLang: "en",
  },
  {
    iso: "PH",
    nameRu: "Филиппины",
    nameEn: "Philippines",
    lat: 12.88,
    lng: 121.77,
    wave: 2,
    primaryLang: "tl",
  },
  {
    iso: "KE",
    nameRu: "Кения",
    nameEn: "Kenya",
    lat: 0.02,
    lng: 37.91,
    wave: 2,
    primaryLang: "sw",
  },
  {
    iso: "TR",
    nameRu: "Турция",
    nameEn: "Turkey",
    lat: 38.96,
    lng: 35.24,
    wave: 3,
    primaryLang: "tr",
  },
  {
    iso: "VN",
    nameRu: "Вьетнам",
    nameEn: "Vietnam",
    lat: 14.05,
    lng: 108.27,
    wave: 3,
    primaryLang: "vi",
  },
  {
    iso: "ID",
    nameRu: "Индонезия",
    nameEn: "Indonesia",
    lat: -0.79,
    lng: 113.92,
    wave: 3,
    primaryLang: "id",
  },
];
export const MARKET_WEIGHTS: Record<string, number> = {
  KZ: 1.2,
  UZ: 1.5,
  KG: 0.6,
  IN: 7,
  NG: 3.2,
  PH: 2,
  KE: 1.3,
  TR: 2.2,
  VN: 2.4,
  ID: 4,
};
export const TARGETS: Record<
  string,
  Record<DirectionKey, number>
> = Object.fromEntries(
  COUNTRIES.map((c) => {
    const size = MARKET_WEIGHTS[c.iso];
    return [
      c.iso,
      {
        growth: Math.round(12000 * size),
        ambassador: Math.round(3000 * size),
        challenge: Math.round(1000 * size),
        portal: Math.round(5500 * size),
        league: Math.round(1600 * size),
      },
    ];
  }),
);
export const startMonth = (country: Country) =>
  country.wave === 1 ? 0 : country.wave === 2 ? 4 : 8;
