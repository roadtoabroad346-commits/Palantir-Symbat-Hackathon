import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { insist } from "./types";

export function publicAddress(address: string) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(value) === 6)
    return (
      !value.startsWith("::") &&
      !value.startsWith("fc") &&
      !value.startsWith("fd") &&
      !value.startsWith("fe8") &&
      !value.startsWith("fe9") &&
      !value.startsWith("fea") &&
      !value.startsWith("feb") &&
      !value.startsWith("ff") &&
      !value.startsWith("2001:db8") &&
      !value.startsWith("64:ff9b:")
    );
  return false;
}
export function discoveryUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    insist(false, "invalid_url", "Invalid discovery URL");
  }
  insist(
    ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (!url.port || ["80", "443"].includes(url.port)),
    "blocked_url",
    "Public HTTP(S) on standard ports only",
  );
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  insist(
    hostname.includes(".") &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      hostname !== "metadata.google.internal" &&
      (!isIP(hostname) || publicAddress(hostname)),
    "blocked_url",
    "Private/loopback/metadata URLs are blocked",
  );
  url.hash = "";
  return url;
}
export async function fetchPublic(
  value: string,
  redirects = 0,
): Promise<{ url: string; text: string; contentType: string }> {
  insist(redirects <= 3, "redirect_limit", "Too many redirects");
  const url = discoveryUrl(value),
    host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true });
  insist(
    addresses.length && addresses.every((a) => publicAddress(a.address)),
    "blocked_address",
    "DNS resolved to a nonpublic address",
  );
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const call = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = call(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "StartifyResearch/2.0 (public-source review)",
          Accept: "text/html,application/json,text/csv,text/plain",
        },
        lookup: ((_hostname: any, _options: any, callback: any) => {
          if (_options?.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        }) as any,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
          res.resume();
          if (!res.headers.location) {
            reject(new Error("Missing redirect location"));
            return;
          }
          fetchPublic(
            new URL(res.headers.location, url).toString(),
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        const contentType = String(res.headers["content-type"] ?? "").split(
          ";",
        )[0];
        if (
          res.statusCode !== 200 ||
          !["text/html", "text/plain", "text/csv", "application/json"].includes(
            contentType,
          )
        ) {
          res.resume();
          reject(
            new Error(
              `Unsupported source: HTTP ${res.statusCode}, ${contentType}`,
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 512000) {
            req.destroy(new Error("Source too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            url: url.toString(),
            text: Buffer.concat(chunks).toString("utf8"),
            contentType,
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(4000, () => req.destroy(new Error("Source timeout")));
    req.on("error", reject);
    req.end();
  });
}
export function canonicalSource(value: string) {
  const url = discoveryUrl(value);
  url.hostname = url.hostname.replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^fbclid$|^gclid$/.test(key)) url.searchParams.delete(key);
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.toString();
}
