import { MockAiStartifyClient, type AiStartifyClient } from "./index";
import { seedApp } from "./server/seeds";
import { names, menus, roleMap } from "./server/config";
import { uid, add, get } from "./server/common";
import type { Database, Row, View } from "./server/types";
export type { Database, Row, View, Field, Form } from "./server/types";
import { createGrowth } from "./server/growth";
import { createAmbassador } from "./server/ambassador";
import { createChallenge } from "./server/challenge";
import { createPortal } from "./server/portal";
import { createLeague } from "./server/league";
/** Bind one independent application's database to its demo workflows. */
export function makeService(app: string, db: Database) {
  const roles = roleMap[app];
  const platform: AiStartifyClient = new MockAiStartifyClient();
  const factories: Record<
    string,
    (
      db: Database,
      platform: AiStartifyClient,
    ) => {
      mutate: (op: string, data: Row, role: string) => Promise<Row>;
      view: (view: View) => Promise<void>;
      exportCsv: (reportId?: string) => Promise<string>;
    }
  > = {
    "growth-engine": createGrowth,
    "ambassador-platform": createAmbassador,
    "challenge-platform": createChallenge,
    "school-portal": createPortal,
    "school-league": createLeague,
  };
  const workflow = factories[app](db, platform);
  async function seed() {
    await seedApp(app, db, platform);
  }
  async function mutate(op: string, data: Row, role = roles[0]): Promise<Row> {
    return workflow.mutate(op, data, role);
  }
  async function view(
    path: string,
    role = roles[0],
    selection?: string,
  ): Promise<View> {
    const result: View = {
      app,
      path,
      role,
      roles,
      title: names[app],
      subtitle:
        "От идеи к глобальному движению|From an idea to a global movement",
      extra: { selection },
      nav: menus[app].map(([href, label]) => ({ href, label })),
      metrics: [],
      tables: [],
      forms: [],
      cards: [],
    };
    await workflow.view(result);
    return JSON.parse(JSON.stringify(result));
  }
  async function visit(code: string) {
    if (!db.referralLink) throw new Error("Unavailable");
    const l = await db.referralLink.findUnique({ where: { code } });
    if (!l) throw new Error("Unknown link");
    if (app === "growth-engine") {
      const c = await get(db, "campaign", l.campaignId);
      await add(db, "trackedEvent", {
        id: uid(),
        linkCode: code,
        type: "visit",
        country: c.country,
      });
    }
  }
  return { roles, seed, mutate, view, exportCsv: workflow.exportCsv, visit };
}
