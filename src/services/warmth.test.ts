import { afterEach, describe, expect, it } from "vitest";
import { clearDyadStats, decayScoreLabel, meanModelScore, getDecayRisk, setDyadStats, warmthOf } from "./warmth";
import { makeContact } from "../test/factories";
import type { DyadStats } from "../types";

// Contract tests for the warmth cue and the decay seam. warmthOf thresholds and
// colors are design source of truth and must never change; getDecayRisk keeps its
// signature and ranges when the trained model swaps in.

describe("warmthOf thresholds", () => {
  it("maps >=70 to Warm", () => {
    expect(warmthOf(70).label).toBe("Warm");
    expect(warmthOf(100).label).toBe("Warm");
  });

  it("maps 45 to 69 to Steady", () => {
    expect(warmthOf(45).label).toBe("Steady");
    expect(warmthOf(69).label).toBe("Steady");
  });

  it("maps 25 to 44 to Cooling", () => {
    expect(warmthOf(25).label).toBe("Cooling");
    expect(warmthOf(44).label).toBe("Cooling");
  });

  it("maps <25 to Going cold", () => {
    expect(warmthOf(24).label).toBe("Going cold");
    expect(warmthOf(0).label).toBe("Going cold");
  });

  it("keeps the ember gradient for Warm", () => {
    expect(warmthOf(82)).toEqual({ c: "#E0864A", c2: "#F0B36A", label: "Warm" });
  });
});

describe("getDecayRisk", () => {
  it("returns risk in [0, 100]", () => {
    for (const warmth of [-10, 0, 25, 50, 82, 100, 140]) {
      const { risk } = getDecayRisk(makeContact({ warmth }));
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(100);
    }
  });

  it("labels from its own predicted warmth (label === warmthOf(100 - risk))", () => {
    // The real model predicts decay; its label must agree with its own risk,
    // not with the stored warmth number. The mock satisfies both today.
    for (const warmth of [11, 30, 54, 82]) {
      const { risk, label } = getDecayRisk(makeContact({ warmth }));
      expect(label).toBe(warmthOf(100 - risk).label);
    }
  });

  it("accepts the clock and dyad-stats inputs (amended contract)", () => {
    const contact = makeContact({ warmth: 44 });
    const now = Date.parse("2026-07-06T12:00:00.000Z");
    const withInputs = getDecayRisk(contact, now, {
      medianGapDays: 12,
      gapIqr: 4,
      lastInteractionAt: "2026-06-20T12:00:00.000Z",
      msgCount: 31,
      initiationRatio: 0.6,
    });
    expect(withInputs.risk).toBeGreaterThanOrEqual(0);
    expect(withInputs.risk).toBeLessThanOrEqual(100);
    expect(withInputs.label).toBe(warmthOf(100 - withInputs.risk).label);
  });

  it("is deterministic for the same contact and clock", () => {
    const contact = makeContact({ warmth: 44 });
    const now = Date.parse("2026-07-06T12:00:00.000Z");
    expect(getDecayRisk(contact, now)).toEqual(getDecayRisk(contact, now));
  });

  it("rises as warmth falls", () => {
    const warm = getDecayRisk(makeContact({ warmth: 82 })).risk;
    const cold = getDecayRisk(makeContact({ warmth: 11 })).risk;
    expect(cold).toBeGreaterThan(warm);
  });
});

describe("getDecayRisk with real cadence (rhythm-relative heuristic)", () => {
  afterEach(() => clearDyadStats());

  const NOW = Date.parse("2026-08-05T12:00:00.000Z");
  const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
  const dyad = (overrides: Partial<DyadStats>): DyadStats => ({
    medianGapDays: 7,
    gapIqr: 3,
    lastInteractionAt: daysAgo(3),
    msgCount: 40,
    initiationRatio: 0.5,
    ...overrides,
  });

  it("silence within the dyad's own rhythm stays quiet regardless of warmth", () => {
    const { risk, label } = getDecayRisk(makeContact({ warmth: 10 }), NOW, dyad({}));
    expect(risk).toBeLessThanOrEqual(10);
    expect(label).toBe("Warm");
  });

  it("never alarms before 45 days of silence (guardrail)", () => {
    // 40 days quiet on a weekly rhythm is way past 3x the median gap, but
    // the guardrail keeps the label out of the alarm bands.
    const { risk, label } = getDecayRisk(
      makeContact({ warmth: 80 }),
      NOW,
      dyad({ lastInteractionAt: daysAgo(40) }),
    );
    expect(risk).toBeLessThanOrEqual(54);
    expect(["Warm", "Steady"]).toContain(label);
  });

  it("long silence past the window alarms", () => {
    const { risk, label } = getDecayRisk(
      makeContact({ warmth: 80 }),
      NOW,
      dyad({ lastInteractionAt: daysAgo(60) }),
    );
    expect(risk).toBeGreaterThan(70);
    expect(["Cooling", "Going cold"]).toContain(label);
  });

  it("a monthly correspondent is not cold after two quiet weeks", () => {
    const { risk } = getDecayRisk(
      makeContact({ warmth: 50 }),
      NOW,
      dyad({ medianGapDays: 30, lastInteractionAt: daysAgo(14) }),
    );
    expect(risk).toBeLessThanOrEqual(10);
  });

  it("a recent sentiment dip nudges risk up but cannot alarm alone", () => {
    const base = getDecayRisk(
      makeContact({ warmth: 50 }),
      NOW,
      dyad({ lastInteractionAt: daysAgo(10), sentMean: 0.3, sentRecentMean: 0.3 }),
    );
    const dipped = getDecayRisk(
      makeContact({ warmth: 50 }),
      NOW,
      dyad({ lastInteractionAt: daysAgo(10), sentMean: 0.3, sentRecentMean: -0.2 }),
    );
    expect(dipped.risk).toBeGreaterThan(base.risk);
    expect(dipped.risk).toBeLessThanOrEqual(54);
  });

  it("label always agrees with its own predicted warmth", () => {
    for (const days of [1, 10, 40, 60, 200]) {
      const { risk, label } = getDecayRisk(
        makeContact({ warmth: 33 }),
        NOW,
        dyad({ lastInteractionAt: daysAgo(days) }),
      );
      expect(label).toBe(warmthOf(100 - risk).label);
    }
  });

  it("stored model risk wins over the heuristic and keeps the label law", () => {
    // A stored model score wins: the rhythm heuristic (which would say ~8
    // here, the silence being inside the usual gap) must stand down.
    const scored = getDecayRisk(makeContact({ warmth: 90 }), NOW, dyad({ risk: 72 }));
    expect(scored.risk).toBe(72);
    expect(scored.label).toBe(warmthOf(100 - 72).label);
  });

  it("stored risk is clamped to the 0-100 contract", () => {
    expect(getDecayRisk(makeContact({}), NOW, dyad({ risk: 180 })).risk).toBe(100);
    expect(getDecayRisk(makeContact({}), NOW, dyad({ risk: -5 })).risk).toBe(0);
  });

  it("null and absent stored risk fall through to the heuristic", () => {
    const withNull = getDecayRisk(makeContact({ warmth: 50 }), NOW, dyad({ risk: null }));
    const without = getDecayRisk(makeContact({ warmth: 50 }), NOW, dyad({}));
    expect(withNull).toEqual(without);
  });

  it("the session registry supplies the dyad when callers pass none", () => {
    const contact = makeContact({ warmth: 90 });
    const withoutRegistry = getDecayRisk(contact, NOW);
    setDyadStats(new Map([[contact.id, dyad({ lastInteractionAt: daysAgo(60) })]]));
    const withRegistry = getDecayRisk(contact, NOW);
    expect(withoutRegistry.risk).toBe(10);
    expect(withRegistry.risk).toBeGreaterThan(70);
    // An explicit dyad argument still wins over the registry.
    const explicit = getDecayRisk(contact, NOW, dyad({ lastInteractionAt: daysAgo(1) }));
    expect(explicit.risk).toBeLessThanOrEqual(10);
  });
});


describe("decay score provenance", () => {
  const contact = makeContact({ warmth: 50 });
  const base: DyadStats = { medianGapDays: 7, gapIqr: 2, lastInteractionAt: "2026-01-01T00:00:00Z", msgCount: 30, initiationRatio: 0.5 };
  const now = Date.parse("2026-09-01T00:00:00Z");
  afterEach(clearDyadStats);
  it("does not turn the default warmth into a model score", () => {
    const result = getDecayRisk(contact, now);
    expect(result).toMatchObject({ risk: 50, source: "warmth_only", modelScore: null });
    expect(decayScoreLabel(result)).toBe("Not scored");
  });
  it("honors abstention over both stale stored risk and alarming heuristic cadence", () => {
    const result = getDecayRisk(contact, now, { ...base, risk: 98, decayConfidence: "insufficient_history" });
    expect(result).toMatchObject({ risk: 50, source: "insufficient_history", modelScore: null });
    expect(decayScoreLabel(result)).toBe("Not enough history");
  });
  it("labels cadence estimates separately from scored results", () => {
    const result = getDecayRisk(contact, now, base);
    expect(result).toMatchObject({ source: "cadence_estimate", modelScore: null });
    expect(decayScoreLabel(result)).toBe("Cadence estimate");
  });
  it.each([undefined, null])("does not promote legacy numeric values without model provenance %#", decayConfidence => {
    expect(getDecayRisk(contact, now, { ...base, risk: 80, decayConfidence }).modelScore).toBeNull();
  });
  it.each([NaN, Infinity, -1, 101])("excludes malformed model scores %#", risk => {
    expect(getDecayRisk(contact, now, { ...base, risk, decayConfidence: "model_scored" }).modelScore).toBeNull();
  });
  it("keeps valid zero model scores and expresses scores without a percent", () => {
    const result = getDecayRisk(contact, now, { ...base, risk: 0, decayConfidence: "model_scored" });
    expect(result.modelScore).toBe(0);
    expect(decayScoreLabel(result)).toBe("0/100");
  });
  it("averages measured scores only and distinguishes no measurement from zero", () => {
    expect(meanModelScore([null, 0, 80, null])).toBe(40);
    expect(meanModelScore([null, NaN])).toBeNull();
    expect(meanModelScore([0])).toBe(0);
  });
});
