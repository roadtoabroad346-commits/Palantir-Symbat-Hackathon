import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { fetchPublic } from "./discovery";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("node:http", () => ({ request: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function response(
  statusCode = 200,
  contentType = "text/html",
  body = "public page",
  location?: string,
) {
  vi.mocked(request).mockImplementationOnce(((
    _url: any,
    options: any,
    handler: any,
  ) => {
    const req = new EventEmitter() as any;
    req.setTimeout = vi.fn();
    req.destroy = (error: Error) => req.emit("error", error);
    req.end = () => {
      const res = Readable.from([Buffer.from(body)]) as any;
      res.statusCode = statusCode;
      res.headers = {
        "content-type": contentType,
        ...(location ? { location } : {}),
      };
      handler(res);
    };
    const done = vi.fn();
    options.lookup("example.org", {}, done);
    expect(done.mock.calls[0][1]).toBe("8.8.8.8");
    return req;
  }) as any);
}
it("pins the validated public DNS address instead of resolving again when connecting", async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
  ] as any);
  response();
  expect((await fetchPublic("https://example.org")).text).toBe("public page");
  expect(lookup).toHaveBeenCalledTimes(1);
});
it("blocks a redirect whose second DNS resolution is private", async () => {
  vi.mocked(lookup)
    .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }] as any)
    .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }] as any);
  response(302, "text/html", "", "https://redirect.example.org");
  await expect(fetchPublic("https://example.org")).rejects.toThrow("nonpublic");
  expect(request).toHaveBeenCalledTimes(1);
});
it("rejects mixed public/private DNS, unsupported content, oversize sources and redirects", async () => {
  vi.mocked(lookup).mockResolvedValueOnce([
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ] as any);
  await expect(fetchPublic("https://example.org")).rejects.toThrow("nonpublic");
  vi.mocked(lookup).mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
  ] as any);
  response(200, "application/octet-stream");
  await expect(fetchPublic("https://example.org")).rejects.toThrow(
    "Unsupported source",
  );
  response(200, "text/plain", "x".repeat(512001));
  await expect(fetchPublic("https://example.org")).rejects.toThrow("too large");
  response(302);
  await expect(fetchPublic("https://example.org")).rejects.toThrow(
    "Missing redirect",
  );
  await expect(fetchPublic("https://example.org", 4)).rejects.toThrow(
    "Too many redirects",
  );
});
