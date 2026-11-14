import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function relayOnce() {
  const secret =
    process.env.V2_BUS_SECRET ||
    "local-demo-transport-never-a-production-credential";
  return Promise.all(
    Array.from({ length: 7 }, async (_, index) => {
      const port = 3001 + index,
        body = "{}",
        time = String(Date.now());
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v2/relay`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hub-Time": time,
            "X-Hub-Signature": createHmac("sha256", secret)
              .update(time + "." + body)
              .digest("hex"),
          },
          body,
          signal: AbortSignal.timeout(30000),
        });
        return {
          port,
          ok: response.ok,
          ...(response.ok
            ? await response.json()
            : { status: response.status }),
        };
      } catch {
        return { port, ok: false, status: "source_unavailable" };
      }
    }),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(JSON.stringify(await relayOnce(), null, 2));
}
