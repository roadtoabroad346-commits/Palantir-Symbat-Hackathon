import { expect, it } from "vitest";
import { screenMarkerFan } from "./marker-layout";
it("lays out five focusable marker buttons without overlaps at any globe zoom", () => {
  const fan = screenMarkerFan(5);
  expect(fan).toHaveLength(5);
  for (let i = 0; i < fan.length; i++)
    for (let j = i + 1; j < fan.length; j++)
      expect(
        Math.hypot(fan[i].x - fan[j].x, fan[i].y - fan[j].y),
      ).toBeGreaterThanOrEqual(32);
});
it("is deterministic and rejects unsupported counts", () => {
  expect(screenMarkerFan(5)).toEqual(screenMarkerFan(5));
  expect(screenMarkerFan(0)).toEqual([]);
  expect(() => screenMarkerFan(201)).toThrow();
});
