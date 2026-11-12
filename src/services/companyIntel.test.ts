import { describe, expect, it } from "vitest";
import { getCompanyIntel } from "./companyIntel";
import { makeContact } from "../test/factories";

const NOW = Date.parse("2026-07-02T12:00:00.000Z");
const ago = (days: number) => new Date(NOW - days * 86400000).toISOString();

describe("getCompanyIntel", () => {
  const contacts = [
    makeContact({ id: "a", name: "A", org: "Ramp", warmth: 90, met: "Demo Day", lastInteractionAt: ago(2) }),
    makeContact({ id: "b", name: "B", org: "Ramp", warmth: 12, met: "Demo Day", lastInteractionAt: ago(40) }),
    makeContact({ id: "c", name: "C", org: "ramp ", warmth: 50, met: "Career Fair", lastInteractionAt: ago(9) }),
    makeContact({ id: "d", name: "D", org: "USV", warmth: 70, lastInteractionAt: ago(1) }),
    makeContact({ id: "e", name: "E", org: "", warmth: 70, lastInteractionAt: ago(1) }),
  ];
  const intel = getCompanyIntel("Ramp", contacts, NOW);

  it("collects members case/whitespace-insensitively, warmest first", () => {
    expect(intel.people.map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(intel.count).toBe(3);
  });

  it("computes share against the employed network only", () => {
    expect(intel.share).toBeCloseTo(3 / 4);
  });

  it("fills all four bands in order", () => {
    expect(intel.bands.map((b) => b.label)).toEqual([
      "Warm",
      "Steady",
      "Cooling",
      "Going cold",
    ]);
    expect(intel.bands[0].count).toBe(1); // 90
    expect(intel.bands[1].count).toBe(1); // 50
    expect(intel.bands[3].count).toBe(1); // 12
  });

  it("names the warmest and the one to reconnect with first", () => {
    expect(intel.warmest?.id).toBe("a");
    expect(intel.atRisk?.id).toBe("b");
  });

  it("reports the freshest touch across members and the top rooms", () => {
    expect(intel.lastTouchDays).toBe(2);
    expect(intel.topEvents[0]).toEqual({ label: "Demo Day", count: 2 });
    expect(intel.topEvents[1]).toEqual({ label: "Career Fair", count: 1 });
  });

  it("stays calm for unknown companies", () => {
    const empty = getCompanyIntel("Nowhere", contacts, NOW);
    expect(empty.count).toBe(0);
    expect(empty.warmest).toBeUndefined();
    expect(empty.lastTouchDays).toBe(0);
  });
});
