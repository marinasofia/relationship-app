import { describe, expect, it } from "vitest";
import { makeContact } from "../test/factories";
import { DAY, isTodayHidden, normalizeTodayPreferences, rememberTodayChoice, selectTodaySuggestions } from "./today";
import type { DyadStats, EventItem } from "../types";

const now = Date.parse("2026-09-07T12:00:00Z");
function contact(id: string, days: number) {
  const at = new Date(now - days * DAY).toISOString();
  return makeContact({ id, name: `Person ${id}`, lastInteractionAt: at, interactions: [{ id: `ix-${id}`, kind: "met", at, summary: "Recorded meeting" }] });
}
const event: EventItem = { id: "e", name: "Founders Breakfast", startsAt: new Date(now + DAY).toISOString(), endsAt: new Date(now + DAY + 3_600_000).toISOString(), where: "Brooklyn", goal: "Meet a mentor", known: 0, talkingPoints: [] };
const base = { contacts: [contact("a", 45), contact("b", 60)], events: [event], now };

describe("Today selection", () => {
  it("selects three grounded actions and never repeats the same person", () => {
    const items = selectTodaySuggestions(base);
    expect(items.map(item => item.kind)).toEqual(["event", "reconnect", "reconnect"]);
    expect(items[1].reason).toContain("60 days ago");
    expect(items.filter(item => item.contact?.id === "a")).toHaveLength(1);
  });

  it("excludes recent interactions, including newer recorded outreach", () => {
    const person = contact("a", 60);
    person.interactions.push({ id: "new", kind: "followup", at: new Date(now - DAY).toISOString(), summary: "Confirmed sent" });
    expect(selectTodaySuggestions({ ...base, contacts: [person], events: [] })).toEqual([]);
  });

  it("uses recent connected history to suppress an obsolete nudge", () => {
    const dyad: DyadStats = { medianGapDays: 14, gapIqr: 2, msgCount: 100, initiationRatio: .5, lastInteractionAt: new Date(now - DAY).toISOString() };
    expect(selectTodaySuggestions({ ...base, contacts: [contact("a", 60)], events: [], dyads: new Map([["a", dyad]]) })).toEqual([]);
  });

  it("does not invent history from warmth, notes or a row creation timestamp", () => {
    const person = contact("a", 90);
    person.warmth = 0;
    person.interactions = [{ id: "n", kind: "note", at: person.lastInteractionAt, summary: "Imported contact" }];
    expect(selectTodaySuggestions({ ...base, contacts: [person], events: [] })).toEqual([]);
  });

  it("respects a slower conversation rhythm without treating an abstention as a score", () => {
    const dyad: DyadStats = { medianGapDays: 90, gapIqr: 10, msgCount: 10, initiationRatio: .5, lastInteractionAt: contact("a", 60).lastInteractionAt, decayConfidence: "insufficient_history", risk: 99 };
    expect(selectTodaySuggestions({ ...base, contacts: [contact("a", 60)], events: [], dyads: new Map([["a", dyad]]) })).toEqual([]);
  });

  it("excludes past, distant and invalid events and limits events to one slot", () => {
    const upcoming = { ...event, id: "next", startsAt: new Date(now + 2 * DAY).toISOString(), endsAt: new Date(now + 3 * DAY).toISOString() };
    const items = selectTodaySuggestions({ ...base, events: [event, upcoming, { ...event, id: "past", startsAt: new Date(now - DAY).toISOString() }, { ...event, id: "invalid", endsAt: "invalid" }, { ...event, id: "distant", startsAt: new Date(now + 10 * DAY).toISOString(), endsAt: new Date(now + 11 * DAY).toISOString() }] });
    expect(items.filter(item => item.kind === "event").map(item => item.event?.id)).toEqual(["e"]);
  });

  it("does not refill dismissed slots and renews a suggestion when its source changes", () => {
    const input = { ...base, contacts: [...base.contacts, contact("c", 40)] };
    const items = selectTodaySuggestions(input);
    const preferences = rememberTodayChoice([], items[1].key, "dismissed", now);
    expect(selectTodaySuggestions(input).filter(item => !isTodayHidden(item.key, preferences, now))).toHaveLength(2);
  });

  it("returns no filler for an empty network and ignores future history", () => {
    expect(selectTodaySuggestions({ ...base, contacts: [], events: [] })).toEqual([]);
    expect(selectTodaySuggestions({ ...base, contacts: [contact("a", -10)], events: [] })).toEqual([]);
  });

  it("makes room for different people on the day after a dismissal", () => {
    const input = { ...base, events: [], contacts: [contact("a", 100), contact("b", 90), contact("c", 80), contact("d", 70)] };
    const first = selectTodaySuggestions(input);
    const preferences = rememberTodayChoice([], first[0].key, "dismissed", now);
    expect(selectTodaySuggestions({ ...input, preferences }).filter(item => !isTodayHidden(item.key, preferences, now))).toHaveLength(2);
    const tomorrow = selectTodaySuggestions({ ...input, preferences, now: now + DAY });
    expect(tomorrow).toHaveLength(3);
    expect(tomorrow.some(item => item.key === first[0].key)).toBe(false);
    expect(tomorrow.some(item => item.contact?.id === "d")).toBe(true);
  });
});

describe("Today preferences", () => {
  it("snoozes until 9 AM on the next local day and expires at the boundary", () => {
    const prefs = rememberTodayChoice([], "a", "snoozed", now);
    const expected = new Date(now); expected.setDate(expected.getDate() + 1); expected.setHours(9, 0, 0, 0);
    expect(prefs[0].expiresAt).toBe(expected.getTime());
    expect(isTodayHidden("a", prefs, expected.getTime() - 1)).toBe(true);
    expect(isTodayHidden("a", prefs, expected.getTime())).toBe(false);
  });

  it("normalizes malformed settings and bounds retained choices", () => {
    expect(normalizeTodayPreferences({})).toEqual([]);
    expect(normalizeTodayPreferences([null, { key: "x", action: "dismissed" }, { key: "x", action: "other", recordedAt: 1, expiresAt: 2 }])).toEqual([]);
    const many = Array.from({ length: 250 }, (_, i) => ({ key: String(i), action: "dismissed", recordedAt: now - i, expiresAt: now + DAY }));
    expect(rememberTodayChoice(many, "new", "dismissed", now)).toHaveLength(200);
    expect(rememberTodayChoice(many, "new", "dismissed", now)[0].key).toBe("new");
  });
});
