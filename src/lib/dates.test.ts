import { describe, expect, it } from "vitest";
import { agoLabel } from "./dates";

const NOW = Date.parse("2026-09-10T12:00:00Z");
const before = (ms: number) => new Date(NOW - ms).toISOString();

describe("agoLabel", () => {
  it("steps from just now through minutes, hours, and days", () => {
    expect(agoLabel(before(20_000), NOW)).toBe("just now");
    expect(agoLabel(before(5 * 60_000), NOW)).toBe("5 min ago");
    expect(agoLabel(before(3 * 3_600_000), NOW)).toBe("3h ago");
    expect(agoLabel(before(30 * 3_600_000), NOW)).toBe("yesterday");
    expect(agoLabel(before(6 * 86_400_000), NOW)).toBe("6 days ago");
  });

  it("falls back to a calendar date once it is weeks old", () => {
    expect(agoLabel("2026-08-01T10:00:00Z", NOW)).toMatch(/^Aug 1$/);
  });

  it("returns an empty label for an unparseable timestamp", () => {
    expect(agoLabel("not a date", NOW)).toBe("");
  });
});
