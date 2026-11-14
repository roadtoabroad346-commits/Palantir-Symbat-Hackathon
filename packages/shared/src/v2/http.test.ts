import { expect, it } from "vitest";
import { assertSameOrigin } from "./http";
it("compares browser Origin with the incoming Host when Next uses an internal URL", () => {
  const request = new Request("http://localhost:3007/api/v2/session", {
    method: "POST",
    headers: { Host: "127.0.0.1:3007", Origin: "http://127.0.0.1:3007" },
  });
  expect(() => assertSameOrigin(request)).not.toThrow();
});
it("rejects foreign ports, hosts, schemes and absent origins", () => {
  for (const origin of [
    "http://127.0.0.1:3008",
    "http://attacker.example",
    "https://127.0.0.1:3007",
    "",
  ]) {
    const request = new Request("http://localhost:3007/api/v2/session", {
      method: "POST",
      headers: {
        Host: "127.0.0.1:3007",
        ...(origin ? { Origin: origin } : {}),
      },
    });
    expect(() => assertSameOrigin(request)).toThrow("Same origin");
  }
});
