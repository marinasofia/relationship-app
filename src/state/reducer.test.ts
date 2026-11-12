import { describe, expect, it } from "vitest";
import { reducer, DEFAULT_SETTINGS, type AppState } from "./reducer";
import type { CapturedPerson, EventItem } from "../types";
import { makeContact } from "../test/factories";

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    contacts: [makeContact()],
    events: [],
    past: [],
    captured: [],
    filter: "All",
    toast: "",
    settings: DEFAULT_SETTINGS,
    dyadRev: 0,
    ...overrides,
  };
}

const riley: CapturedPerson = { name: "Riley Al-Amin", kind: "photo", init: "RA" };
const noah: CapturedPerson = { name: "Noah Frost", kind: "voice", init: "NF" };

describe("reducer", () => {
  it("prepends captured people, newest first", () => {
    let state = makeState();
    state = reducer(state, { type: "ADD_CAPTURED", person: riley });
    state = reducer(state, { type: "ADD_CAPTURED", person: noah });
    expect(state.captured.map((p) => p.name)).toEqual(["Noah Frost", "Riley Al-Amin"]);
  });

  it("SAVE_CAPTURED merges captures into the rolodex as fresh, warm contacts", () => {
    const at = "2026-07-01T20:00:00.000Z";
    const state = makeState({ captured: [noah, riley] });
    const next = reducer(state, { type: "SAVE_CAPTURED", eventName: "Startup Grind", at });

    expect(next.captured).toEqual([]);
    expect(next.contacts).toHaveLength(3);

    const [first, second] = next.contacts;
    expect(first.name).toBe("Noah Frost");
    expect(second.name).toBe("Riley Al-Amin");
    expect(first.met).toBe("Startup Grind");
    expect(first.warmth).toBe(78);
    expect(first.id).not.toBe(second.id);
    expect(first.lastInteractionAt).toBe(at);
    expect(first.interactions).toHaveLength(1);
    expect(first.interactions[0]).toMatchObject({ kind: "met", at });
    // Existing contacts stay put, after the new ones.
    expect(next.contacts[2].name).toBe("Maya Okonkwo");
  });

  it("SAVE_CAPTURED is a no-op when nothing was captured", () => {
    const state = makeState();
    const action = {
      type: "SAVE_CAPTURED",
      eventName: "Startup Grind",
      at: "2026-07-01T20:00:00.000Z",
    } as const;
    expect(reducer(state, action)).toBe(state);
  });

  it("ADD_INTERACTION appends, advances lastInteractionAt, and clamps warmth", () => {
    const at = "2026-07-01T09:00:00.000Z";
    const state = makeState({ contacts: [makeContact({ warmth: 96 })] });
    const next = reducer(state, {
      type: "ADD_INTERACTION",
      contactId: "c1",
      interaction: { id: "f1", kind: "followup", at, summary: "You sent a follow-up" },
      warmthDelta: 8,
    });

    const contact = next.contacts[0];
    expect(contact.interactions).toHaveLength(2);
    expect(contact.lastInteractionAt).toBe(at);
    expect(contact.warmth).toBe(100);
  });

  it("SAVE_CAPTURED keeps a note typed at capture time", () => {
    const at = "2026-07-01T20:00:00.000Z";
    const state = makeState({
      captured: [{ ...noah, kind: "note", note: "Loves durable execution engines" }],
    });
    const next = reducer(state, { type: "SAVE_CAPTURED", eventName: "Startup Grind", at });
    expect(next.contacts[0].note).toBe("Loves durable execution engines");
  });

  it("UPDATE_CONTACT patches only the given fields on the right contact", () => {
    const state = makeState({
      contacts: [makeContact(), makeContact({ id: "c2", name: "Ivy Chen" })],
    });
    const next = reducer(state, {
      type: "UPDATE_CONTACT",
      contactId: "c1",
      patch: { role: "VP Design", note: "New note" },
    });

    const patched = next.contacts[0];
    expect(patched.role).toBe("VP Design");
    expect(patched.note).toBe("New note");
    // Everything else survives the patch.
    expect(patched.org).toBe("Northwind");
    expect(patched.warmth).toBe(82);
    expect(patched.interactions).toHaveLength(1);
    // The other contact is untouched.
    expect(next.contacts[1]).toEqual(state.contacts[1]);
  });

  it("UPDATE_CONTACT with an unknown id changes nothing", () => {
    const state = makeState();
    const next = reducer(state, {
      type: "UPDATE_CONTACT",
      contactId: "nope",
      patch: { role: "Ghost" },
    });
    expect(next.contacts).toEqual(state.contacts);
  });

  it("ADD_CONTACT puts the new person on top of the rolodex", () => {
    const state = makeState();
    const added = makeContact({ id: "c9", name: "Riley Al-Amin", warmth: 72 });
    const next = reducer(state, { type: "ADD_CONTACT", contact: added });
    expect(next.contacts).toHaveLength(2);
    expect(next.contacts[0].name).toBe("Riley Al-Amin");
    expect(next.contacts[1].name).toBe("Maya Okonkwo");
  });

  it("ADD_EVENT appends and is idempotent by id", () => {
    const event: EventItem = {
      id: "ev1",
      name: "Design Book Club",
      startsAt: "2026-07-10T18:00:00.000Z",
      endsAt: "2026-07-10T20:00:00.000Z",
      where: "Verci, Bushwick",
      known: 0,
      goal: "Meet 2 designers",
      talkingPoints: [],
    };
    let state = makeState();
    state = reducer(state, { type: "ADD_EVENT", event });
    expect(state.events).toHaveLength(1);

    // Replayed hydration (or StrictMode double-effect) must not duplicate it.
    const again = reducer(state, { type: "ADD_EVENT", event });
    expect(again).toBe(state);
  });

  it("HYDRATE replaces the event slice, including a deliberate empty cloud calendar", () => {
    const event: EventItem = {
      id: "ev1",
      name: "Design Book Club",
      startsAt: "2026-07-10T18:00:00.000Z",
      endsAt: "2026-07-10T20:00:00.000Z",
      where: "Brooklyn",
      known: 0,
      goal: "",
      talkingPoints: [],
    };
    const state = makeState({ events: [event] });
    expect(reducer(state, { type: "HYDRATE", events: [] }).events).toEqual([]);
  });

  it("sets and clears the filter and toast", () => {
    let state = makeState();
    state = reducer(state, { type: "SET_FILTER", filter: "Warm" });
    expect(state.filter).toBe("Warm");
    state = reducer(state, { type: "SHOW_TOAST", message: "Follow-up sent" });
    expect(state.toast).toBe("Follow-up sent");
    state = reducer(state, { type: "CLEAR_TOAST" });
    expect(state.toast).toBe("");
  });
});

describe("DYAD_STATS_CHANGED", () => {
  it("bumps the revision and touches nothing else", () => {
    const state = makeState();
    const next = reducer(state, { type: "DYAD_STATS_CHANGED" });
    expect(next.dyadRev).toBe(1);
    expect(reducer(next, { type: "DYAD_STATS_CHANGED" }).dyadRev).toBe(2);
    expect(next.contacts).toBe(state.contacts);
    expect(next.settings).toBe(state.settings);
  });
});
