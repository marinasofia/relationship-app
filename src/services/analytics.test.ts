import { describe, expect, it } from "vitest";
import {
  focusReason,
  getContactRhythm,
  getEventRoi,
  getFocusQueue,
  getMomentum,
  getNetworkHealth,
  getTopCompanies,
  TRAJECTORY_WEEKS,
} from "./analytics";
import { makeContact } from "../test/factories";
import { daysAgoIso } from "../lib/dates";
import type { Contact, Interaction, PastEvent } from "../types";

// Contract tests for the analytics seam. Everything here is deterministic from
// state, so the dashboard can trust the numbers.

function hist(
  entries: Array<[Interaction["kind"], number]>,
): Pick<Contact, "interactions" | "lastInteractionAt"> {
  const interactions = entries
    .map(([kind, daysAgo], i): Interaction => ({
      id: `t${i}`,
      kind,
      at: daysAgoIso(daysAgo),
      summary: kind,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  return { interactions, lastInteractionAt: interactions[interactions.length - 1].at };
}

describe("getNetworkHealth", () => {
  it("counts contacts per warmth band and totals the cooling side", () => {
    const contacts = [
      makeContact({ id: "a", warmth: 82 }),
      makeContact({ id: "b", warmth: 66 }),
      makeContact({ id: "c", warmth: 30 }),
      makeContact({ id: "d", warmth: 10 }),
    ];
    const h = getNetworkHealth(contacts);
    expect(h.bands).toEqual({ Warm: 1, Steady: 1, Cooling: 1, "Going cold": 1 });
    expect(h.cooling).toBe(2);
  });

  it("computes the follow-up rate as the share of contacts followed up", () => {
    const contacts = [
      makeContact({ id: "a", ...hist([["met", 10], ["followup", 8]]) }),
      makeContact({ id: "b", ...hist([["met", 10]]) }),
    ];
    expect(getNetworkHealth(contacts).followUpRate).toBe(0.5);
  });

  it("counts a contact as reconnected when the latest follow-up broke a long silence", () => {
    const reconnected = makeContact({
      id: "a",
      // gaps 5, 5, then a 50-day silence broken by a follow-up (median gap 5)
      ...hist([["met", 100], ["followup", 95], ["note", 90], ["followup", 40]]),
    });
    const steady = makeContact({
      id: "b",
      // regular cadence: the follow-up broke no unusual silence
      ...hist([["met", 30], ["followup", 25], ["note", 20]]),
    });
    const h = getNetworkHealth([reconnected, steady]);
    expect(h.reconnected).toBe(1);
  });

  it("builds a 12-week trajectory, clamped 0 to 100, that decays for an idle contact", () => {
    const idle = makeContact({ id: "a", ...hist([["met", 90]]) });
    const { trajectory, delta } = getNetworkHealth([idle]);
    expect(trajectory).toHaveLength(TRAJECTORY_WEEKS);
    for (const v of trajectory) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(trajectory[TRAJECTORY_WEEKS - 1]).toBeLessThan(trajectory[0]);
    // the "vs a month ago" delta is now minus four weeks back, from the trajectory
    expect(delta).toBeCloseTo(
      trajectory[TRAJECTORY_WEEKS - 1] - trajectory[TRAJECTORY_WEEKS - 5],
      1,
    );
    expect(delta).toBeLessThan(0);
  });

  it("returns zeros and empty bands for an empty rolodex", () => {
    const h = getNetworkHealth([]);
    expect(h.followUpRate).toBe(0);
    expect(h.cooling).toBe(0);
    expect(h.reconnected).toBe(0);
    expect(h.trajectory).toEqual(new Array(TRAJECTORY_WEEKS).fill(0));
    expect(h.delta).toBe(0);
  });
});

describe("getEventRoi", () => {
  const past: PastEvent[] = [
    { id: "p1", name: "Demo Day", at: daysAgoIso(10), met: 8, followed: 6 },
    { id: "p2", name: "Ghost Town", at: daysAgoIso(20), met: 0, followed: 0 },
  ];

  it("computes the follow rate per event", () => {
    const roi = getEventRoi(past, []);
    expect(roi[0]).toMatchObject({ name: "Demo Day", met: 8, followed: 6, followRate: 0.75 });
    expect(roi[1].followRate).toBe(0); // no division by zero
  });

  it("counts contacts from the event who are Warm right now, case-insensitively", () => {
    const contacts = [
      makeContact({ id: "a", met: "demo day", warmth: 80 }),
      makeContact({ id: "b", met: "Demo Day", warmth: 40 }),
      makeContact({ id: "c", met: "Career Fair", warmth: 90 }),
    ];
    expect(getEventRoi(past, contacts)[0].warmNow).toBe(1);
  });
});

describe("getContactRhythm", () => {
  it("returns gaps, their median, current silence, and the gap ratio", () => {
    const c = makeContact({ ...hist([["met", 30], ["note", 20], ["followup", 5]]) });
    const r = getContactRhythm(c);
    expect(r.gaps).toEqual([10, 15]);
    expect(r.medianGap).toBe(12.5);
    expect(r.silenceDays).toBe(5);
    expect(r.ratio).toBe(0.4); // 5 days quiet vs a 12.5-day usual gap
  });

  it("has no baseline with a single touchpoint", () => {
    const c = makeContact({ ...hist([["met", 12]]) });
    const r = getContactRhythm(c);
    expect(r.gaps).toEqual([]);
    expect(r.medianGap).toBeNull();
    expect(r.ratio).toBeNull();
    expect(r.silenceDays).toBe(12);
  });
});

describe("focusReason", () => {
  it("says going cold for the coldest label, even when just met", () => {
    expect(focusReason(makeContact({ warmth: 10, ...hist([["met", 2]]) }))).toBe("going cold");
  });

  it("says met this week for fresh contacts", () => {
    expect(focusReason(makeContact({ warmth: 80, ...hist([["met", 2]]) }))).toBe("met this week");
  });

  it("says no follow-up yet when history has none", () => {
    expect(focusReason(makeContact({ warmth: 80, ...hist([["met", 30]]) }))).toBe(
      "no follow-up yet",
    );
  });

  it("says cooling off for a Cooling contact already followed up", () => {
    expect(
      focusReason(makeContact({ warmth: 30, ...hist([["met", 30], ["followup", 28]]) })),
    ).toBe("cooling off");
  });

  it("says keep it warm when nothing is wrong", () => {
    expect(
      focusReason(makeContact({ warmth: 80, ...hist([["met", 30], ["followup", 28]]) })),
    ).toBe("keep it warm");
  });
});

describe("getTopCompanies", () => {
  const contacts = [
    makeContact({ id: "a", org: "Ramp", warmth: 80 }),
    makeContact({ id: "b", org: "Ramp", warmth: 40 }),
    makeContact({ id: "c", org: "Figma", warmth: 90 }),
    makeContact({ id: "d", org: "Stripe", warmth: 30 }),
  ];

  it("ranks companies by headcount, ties broken alphabetically", () => {
    expect(getTopCompanies(contacts).map((t) => t.org)).toEqual(["Ramp", "Figma", "Stripe"]);
  });

  it("counts heads and Warm contacts per company", () => {
    const top = getTopCompanies(contacts);
    expect(top[0]).toMatchObject({ org: "Ramp", count: 2, warmCount: 1 });
    expect(top[1]).toMatchObject({ org: "Figma", count: 1, warmCount: 1 });
    expect(top[2]).toMatchObject({ org: "Stripe", count: 1, warmCount: 0 });
  });

  it("shares sum to 1 across all companies", () => {
    const shares = getTopCompanies(contacts).map((t) => t.share);
    expect(shares).toEqual([0.5, 0.25, 0.25]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("skips empty orgs and excludes them from the share base", () => {
    const top = getTopCompanies([
      makeContact({ id: "a", org: "Ramp", warmth: 80 }),
      makeContact({ id: "b", org: "" }),
      makeContact({ id: "c", org: "   " }),
    ]);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ org: "Ramp", count: 1, share: 1 });
  });

  it("caps the list at n", () => {
    expect(getTopCompanies(contacts, 2)).toHaveLength(2);
  });

  it("returns nothing for an empty rolodex", () => {
    expect(getTopCompanies([])).toEqual([]);
  });
});

describe("getMomentum", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // A fixed clock so window boundaries are exact, not flaky.
  const NOW = Date.parse("2026-07-01T12:00:00.000Z");
  const at = (daysBefore: number) => new Date(NOW - daysBefore * DAY_MS).toISOString();
  const withHistory = (id: string, entries: Array<[Interaction["kind"], number]>): Contact =>
    makeContact({
      id,
      interactions: entries.map(([kind, daysBefore], i) => ({
        id: `${id}-${i}`,
        kind,
        at: at(daysBefore),
        summary: kind,
      })),
      lastInteractionAt: at(Math.min(...entries.map(([, d]) => d))),
    });

  it("splits met and follow-ups into the trailing 30 days vs the 30 before", () => {
    const c = withHistory("a", [
      ["met", 1], // current window
      ["met", 29], // current window
      ["met", 31], // previous window
      ["followup", 5], // current window
      ["followup", 45], // previous window
      ["met", 61], // older than both, ignored
    ]);
    const m = getMomentum([c], NOW);
    expect(m.met30).toBe(2);
    expect(m.met30Prev).toBe(1);
    expect(m.followups30).toBe(1);
    expect(m.followups30Prev).toBe(1);
  });

  it("puts the exact 30-day boundary in the previous window and ignores the future and the 60-day edge", () => {
    const c = withHistory("a", [
      ["met", 30], // exactly on the boundary → previous window
      ["met", 60], // exactly 60 days ago → outside
      ["met", -1], // tomorrow → ignored
    ]);
    const m = getMomentum([c], NOW);
    expect(m.met30).toBe(0);
    expect(m.met30Prev).toBe(1);
  });

  it("estimates replies at 44% of each window's follow-ups", () => {
    const c = withHistory("a", [
      ["followup", 2],
      ["followup", 4],
      ["followup", 6],
      ["followup", 8],
      ["followup", 10],
      ["followup", 35],
    ]);
    const m = getMomentum([c], NOW);
    expect(m.followups30).toBe(5);
    expect(m.replies30).toBe(2); // round(5 × 0.44)
    expect(m.replies30Prev).toBe(0); // round(1 × 0.44)
  });

  it("aggregates across contacts and returns zeros for an empty rolodex", () => {
    const a = withHistory("a", [["met", 3]]);
    const b = withHistory("b", [["met", 7]]);
    expect(getMomentum([a, b], NOW).met30).toBe(2);
    expect(getMomentum([], NOW)).toEqual({
      met30: 0,
      met30Prev: 0,
      followups30: 0,
      followups30Prev: 0,
      replies30: 0,
      replies30Prev: 0,
    });
  });
});

describe("getFocusQueue", () => {
  it("ranks by focus score, caps at n, and attaches a reason to each entry", () => {
    const contacts = [
      makeContact({ id: "low", warmth: 10, ...hist([["met", 40]]) }),
      makeContact({ id: "high", warmth: 90, ...hist([["met", 2]]) }),
      makeContact({ id: "mid", warmth: 50, ...hist([["met", 20]]) }),
    ];
    const queue = getFocusQueue(contacts, 2);
    expect(queue).toHaveLength(2);
    expect(queue[0].contact.id).toBe("high");
    expect(queue[0].score).toBeGreaterThanOrEqual(queue[1].score);
    for (const entry of queue) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });
});
