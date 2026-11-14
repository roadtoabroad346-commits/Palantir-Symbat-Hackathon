import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("ships the Windows double-click launcher as ASCII with only CRLF line endings", () => {
  const bytes = readFileSync("START_DEMO.cmd");
  expect([...bytes].every((byte) => byte < 128)).toBe(true);
  const text = bytes.toString("ascii");
  expect(text.startsWith("@echo off\r\n")).toBe(true);
  expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  expect(text).toContain("call pnpm install --frozen-lockfile\r\n");
  expect(text).toContain("call pnpm demo\r\n");
});
