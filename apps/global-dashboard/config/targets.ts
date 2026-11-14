import { countries as sharedCountries } from "@startify/shared";
import type { Country, DirectionKey } from "../lib/types";
const geography = [
  {
    iso: "KZ",
    lat: 48.02,
    lng: 66.92,
    primaryLang: "kk",
  },
  {
    iso: "UZ",
    lat: 41.38,
    lng: 64.58,
    primaryLang: "uz",
  },
  {
    iso: "KG",
    lat: 41.2,
    lng: 74.77,
    primaryLang: "ky",
  },
  {
    iso: "IN",
    lat: 22.59,
    lng: 78.96,
    primaryLang: "hi",
  },
  {
    iso: "NG",
    lat: 9.08,
    lng: 8.68,
    primaryLang: "en",
  },
  {
    iso: "PH",
    lat: 12.88,
    lng: 121.77,
    primaryLang: "tl",
  },
  {
    iso: "KE",
    lat: 0.02,
    lng: 37.91,
    primaryLang: "sw",
  },
  {
    iso: "TR",
    lat: 38.96,
    lng: 35.24,
    primaryLang: "tr",
  },
  {
    iso: "VN",
    lat: 14.05,
    lng: 108.27,
    primaryLang: "vi",
  },
  {
    iso: "ID",
    lat: -0.79,
    lng: 113.92,
    primaryLang: "id",
  },
];
export const COUNTRIES: Country[] = geography.map((c) => {
  const shared = sharedCountries.find((country) => country.code === c.iso);
  if (!shared) throw new Error(`Missing shared country ${c.iso}`);
  return { ...c, nameRu: shared.ru, nameEn: shared.en, wave: shared.wave };
});
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
