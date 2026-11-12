import { describe, expect, it } from "vitest";
import { makeContact } from "../test/factories";
import type { EventItem } from "../types";

import { parseAgentCard } from "./agent";
import { buildLocalMeetingPrep, buildLocalTimesDraft, localFreeSlots } from "./agentRepresent";

const at = (iso: string) => new Date(iso).getTime();
function event(overrides: Partial<EventItem>): EventItem {
  return { id: "e1", name: "Product Coffee", startsAt: "", endsAt: "", where: "", known: 0, goal: "", talkingPoints: [], ...overrides };
}

describe("agent cards", () => {
  it("keeps prep and contact-update cards only when they carry what their action needs", () => {
    expect(parseAgentCard({ id: "a", kind: "meeting_prep", title: "Prep", body: "b", action: { type: "prep", eventId: "e1" } })?.eventId).toBe("e1");
    expect(parseAgentCard({ id: "a", kind: "meeting_prep", title: "Prep", body: "b", action: { type: "prep" } })?.action).toBeUndefined();
    const update = parseAgentCard({
      id: "u", kind: "update_contact", title: "Maya moved", body: "b", contactId: "c1", signalId: "s1",
      proposedRole: "VP Design", proposedOrg: "Stripe", action: { type: "accept_update" },
    });
    expect(update?.action?.type).toBe("accept_update");
    expect(update?.proposedOrg).toBe("Stripe");
    expect(parseAgentCard({ id: "u", kind: "update_contact", title: "t", body: "b", signalId: "s1", action: { type: "accept_update" } })?.action).toBeUndefined();
    expect(parseAgentCard({ id: "i", kind: "intro_request", title: "Alex", body: "Ask" })).toBeNull();
  });
});

describe("meeting prep", () => {

  it("prepares on-device from the event and the people met there", () => {
    const maya = makeContact({ id: "c1", met: "Product Coffee", note: "Owes me a deck" });
    const other = makeContact({ id: "c2", met: "Elsewhere", interactions: [] });
    const prep = buildLocalMeetingPrep(event({ talkingPoints: ["Ask about hiring"], goal: "Meet 1 new PM", startsAt: "2026-10-02T17:00:00Z" }), [maya, other], ["Move into PM"]);
    expect(prep.people.map(p => p.contactId)).toEqual(["c1"]);
    expect(prep.people[0].openItems).toEqual(["Owes me a deck"]);
    expect(prep.talkingPoints).toEqual(["Ask about hiring", "Your goal for this: Meet 1 new PM"]);
    expect(prep.goalLinks).toEqual(["Move into PM"]);
  });
});

describe("finding a time", () => {

  it("finds weekday working-hour slots around the user's own events on-device", () => {
    const now = at("2026-09-30T08:00:00"); // Wednesday morning, local time
    const busy = event({ startsAt: new Date(at("2026-09-30T09:00:00")).toISOString(), endsAt: new Date(at("2026-09-30T17:00:00")).toISOString() });
    const slots = localFreeSlots([busy], now, 30, 7);
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      const start = new Date(slot.start);
      expect([0, 6]).not.toContain(start.getDay());
      expect(start.getHours()).toBeGreaterThanOrEqual(9);
      expect(new Date(slot.end).getHours() * 60 + new Date(slot.end).getMinutes()).toBeLessThanOrEqual(18 * 60);
      const s = Date.parse(slot.start); const e = Date.parse(slot.end);
      expect(s < Date.parse(busy.endsAt) && e > Date.parse(busy.startsAt)).toBe(false);
    }
    // Spread across different days first.
    expect(new Set(slots.map(s => new Date(s.start).toDateString())).size).toBe(3);
  });

  it("writes a proposed draft offering the slots", () => {
    const draft = buildLocalTimesDraft(makeContact({ name: "Maya Okonkwo" }), [{ start: "2026-10-01T16:00:00Z", end: "2026-10-01T16:30:00Z" }], 30, "EMAIL");
    expect(draft.state).toBe("PROPOSED");
    expect(draft.body).toMatch(/Hi Maya/);
    expect(draft.subject).toBeTruthy();
  });
});

