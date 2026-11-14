import { NextRequest } from "next/server";
import { csv } from "@startify/shared";
import { source, failure } from "../../../lib/api";
import { localizationInsights } from "../../../lib/logic";
export async function GET(req: NextRequest) {
  try {
    const state = await source.read();
    const iso = req.nextUrl.searchParams.get("iso") ?? "KZ";
    const country = state.countries.find((c) => c.iso === iso);
    if (!country) throw new Error("Unknown country");
    const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "ru";
    if ((process.env.LLM_PROVIDER ?? "mock") !== "mock")
      throw new Error("LLM provider not implemented. Set LLM_PROVIDER=mock.");
    const insight = localizationInsights(country, state.feedback, lang);
    return new Response(
      csv([
        {
          country: country[lang === "ru" ? "nameRu" : "nameEn"],
          summary: insight.summary,
          ...insight.counts,
          ...Object.fromEntries(
            insight.themes.map((t, i) => [
              "theme" + (i + 1),
              `${t.theme}: ${t.count}`,
            ]),
          ),
        },
      ]),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=demo-insights-${iso}.csv`,
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
