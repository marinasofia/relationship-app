import { describe, expect, it } from "vitest";
import { getAttendeeIntel, getEventIntel } from "./eventIntel";
import { getConnectedCalendarEntries } from "./calendarSource";
import { makeContact } from "../test/factories";
import type { EventItem } from "../types";

const EVENT: EventItem = {
  id: "e-test",
  name: "Test Mixer",
  startsAt: "2026-07-10T22:00:00.000Z",
  endsAt: "2026-07-11T00:00:00.000Z",
  where: "SoHo Works",
  known: 3,
  goal: "",
  talkingPoints: [],
};

describe("getEventIntel", () => {
  it("is deterministic for the same event", () => {
    expect(getEventIntel(EVENT)).toEqual(getEventIntel({ ...EVENT }));
  });

  it("returns a scene, ordered moves, and spots with reasons", () => {
    const intel = getEventIntel(EVENT);
    expect(intel.scene.length).toBeGreaterThan(10);
    expect(intel.moves.length).toBeGreaterThanOrEqual(2);
    expect(intel.spots.length).toBeGreaterThanOrEqual(1);
    for (const s of intel.spots) {
      expect(s.name).toBeTruthy();
      expect(s.why).toBeTruthy();
    }
  });

  it("varies by event", () => {
    const other = getEventIntel({ ...EVENT, id: "e-other", name: "Different Night" });
    expect(JSON.stringify(other)).not.toEqual(JSON.stringify(getEventIntel(EVENT)));
  });
});

describe("getAttendeeIntel", () => {
  const contacts = Array.from({ length: 40 }, (_, i) =>
    makeContact({ id: `c${i}`, name: `Person ${i}`, warmth: (i * 13) % 100 }),
  );

  it("is deterministic and caps known people sensibly", () => {
    const a = getAttendeeIntel(EVENT, contacts);
    const b = getAttendeeIntel(EVENT, contacts);
    expect(a.known.map((c) => c.id)).toEqual(b.known.map((c) => c.id));
    expect(a.known.length).toBeGreaterThanOrEqual(1);
    expect(a.known.length).toBeLessThanOrEqual(5);
  });

  it("sorts known people warmest first and gives every lead a why", () => {
    const a = getAttendeeIntel(EVENT, contacts);
    const warmths = a.known.map((c) => c.warmth);
    expect([...warmths].sort((x, y) => y - x)).toEqual(warmths);
    expect(a.lookFor.length).toBeGreaterThanOrEqual(2);
    for (const l of a.lookFor) expect(l.why).toBeTruthy();
  });
});

describe("getConnectedCalendarEntries", () => {
  const NOW = Date.parse("2026-07-06T12:00:00.000Z");

  it("returns nothing when no calendar is connected", () => {
    expect(
      getConnectedCalendarEntries({ google: false, outlook: false, linkedin: false, slack: false, imessage: false }, NOW),
    ).toEqual([]);
  });

  it("returns a stable google feed when connected", () => {
    const on = { google: true, outlook: false, linkedin: false, slack: false, imessage: false };
    const a = getConnectedCalendarEntries(on, NOW);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.every((e) => e.source === "google")).toBe(true);
    expect(a).toEqual(getConnectedCalendarEntries(on, NOW));
    for (const e of a) expect(Date.parse(e.endsAt)).toBeGreaterThan(Date.parse(e.startsAt));
  });
});
