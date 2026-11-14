// Test-only competing process. Uses a temporary fixture DB passed by the suite.
import { HubService } from "../packages/shared/src/v2/service";
import { Store } from "../packages/shared/src/v2/store";
import { actorFrom } from "../packages/shared/src/v2/access";
import { randomUUID } from "node:crypto";
const [file, subject, payload] = process.argv.slice(2);
const store = new Store("founder-studio", file),
  service = new HubService(store);
process.send?.({ ready: true });
process.once("message", () => {
  try {
    const result = service.mutate(
      actorFrom(store, subject),
      "booking.hold",
      JSON.parse(payload),
      randomUUID(),
    );
    process.send?.({ ok: true, id: result.id });
  } catch (error) {
    process.send?.({
      ok: false,
      message: error instanceof Error ? error.message : "failed",
    });
  } finally {
    store.close();
    process.disconnect();
  }
});
