import { describe, expect, it } from "vitest";
import { makeContact } from "../test/factories";
import type { EventItem } from "../types";

import { buildLocalBriefing, buildLocalDraft, localDateKey, messagesHandoff } from "./agent";

const NOW = Date.parse("2026-09-29T15:00:00.000Z");
const DAY = 86_400_000;

describe("local briefing", () => {
  it("turns quiet relationships and upcoming events into agent cards without any network", () => {
    const stale = makeContact({
      id: "c-stale", name: "Priya Shah",
      lastInteractionAt: new Date(NOW - 60 * DAY).toISOString(),
      interactions: [{ id: "i1", kind: "met", at: new Date(NOW - 60 * DAY).toISOString(), summary: "Met" }],
    });
    const event: EventItem = {
      id: "e1", name: "Design Week", where: "SF", known: 2, goal: "", talkingPoints: [],
      startsAt: new Date(NOW + 2 * DAY).toISOString(), endsAt: new Date(NOW + 2 * DAY + 3_600_000).toISOString(),
    };
    const briefing = buildLocalBriefing({ contacts: [stale], events: [event], name: "Steve Tsvik", now: NOW });
    expect(briefing.date).toBe(localDateKey(NOW));
    expect(briefing.greeting).toMatch(/, Steve$/);
    expect(briefing.modelVersion).toBe("local-rules.v1");
    const reconnect = briefing.cards.find(card => card.kind === "reconnect");
    expect(reconnect?.contactId).toBe("c-stale");
    expect(reconnect?.action?.type).toBe("draft");
    expect(briefing.cards.find(card => card.kind === "meeting_prep")?.dueAt).toBe(event.startsAt);
    expect(briefing.summary).toContain("1 person worth a check-in");
  });


  it("says so plainly when there is nothing to do", () => {
    const briefing = buildLocalBriefing({ contacts: [], events: [], name: "", now: NOW });
    expect(briefing.cards).toEqual([]);
    expect(briefing.summary).toMatch(/nothing urgent/i);
  });

  it("writes a template draft that is always proposed", () => {
    const draft = buildLocalDraft(makeContact(), "Check in", "EMAIL");
    expect(draft.state).toBe("PROPOSED");
    expect(draft.body).toContain("Maya");
    expect(draft.subject).toBeTruthy();
  });
});

describe("message handoff", () => {
  it("encodes the Messages handoff body", () => {
    expect(messagesHandoff("Hi & bye?")).toBe("sms:&body=Hi%20%26%20bye%3F");
  });
});

