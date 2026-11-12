import { describe, expect, it } from "vitest";
import { draftWeaveMessage, getWeaves, WEAVE_SURFACE_MIN } from "./weave";
import { generateContacts } from "../data/generateContacts";
import { makeContact } from "../test/factories";
import type { Contact } from "../types";

// Weave's contract: deterministic, stable ids, honest shapes. The mock and any
// future model must both pass these unchanged.

const NOW = Date.parse("2026-07-06T12:00:00.000Z");

const runner = (id: string, name: string, warmth: number, extra: Partial<Contact> = {}) =>
  makeContact({
    id,
    name,
    warmth,
    note: "Met on the rooftop, engineer at Ledger. Training for the NYC Half.",
    ...extra,
  });

const RUNNERS = [
  runner("r1", "Zoe Alvarez", 88),
  runner("r2", "Kai Watanabe", 74),
  runner("r3", "Amara Diallo", 31),
];

describe("getWeaves", () => {
  it("is deterministic and order-independent", async () => {
    const contacts = generateContacts(64);
    const a = await getWeaves(contacts, NOW);
    const b = await getWeaves(contacts, NOW);
    expect(a).toEqual(b);

    const shuffled = [...contacts].reverse();
    const c = await getWeaves(shuffled, NOW);
    expect(c.map((w) => w.id)).toEqual(a.map((w) => w.id));
  });

  it("returns honest shapes, ranked best first", async () => {
    const weaves = await getWeaves(generateContacts(192), NOW);
    const ids = new Set(weaves.map((w) => w.id));
    expect(ids.size).toBe(weaves.length);
    for (const w of weaves) {
      expect(w.score).toBeGreaterThanOrEqual(0);
      expect(w.score).toBeLessThanOrEqual(100);
      expect(w.thread.length).toBeGreaterThan(0);
      expect(w.headline.length).toBeGreaterThan(0);
      expect(w.prompt.length).toBeGreaterThan(0);
      const memberIds = new Set(w.people.map((p) => p.id));
      expect(memberIds.size).toBe(w.people.length);
      if (w.kind === "gather") {
        expect(w.people.length).toBeGreaterThanOrEqual(3);
        expect(w.people.length).toBeLessThanOrEqual(4);
      } else {
        expect(w.people.length).toBe(2);
      }
    }
    const scores = weaves.map((w) => w.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("finds a planted shared thread and names everyone", async () => {
    const weaves = await getWeaves(RUNNERS, NOW);
    const gather = weaves.find((w) => w.id === "gather:running");
    expect(gather).toBeDefined();
    for (const first of ["Zoe", "Kai", "Amara"]) {
      expect(gather!.headline).toContain(first);
    }
    // Warmest first, and the invite exists to warm the cooling member.
    expect(gather!.people[0].id).toBe("r1");
    expect(gather!.people.map((p) => p.id)).toContain("r3");
  });

  it("matches a stated need to a provider, never within the seeker's org", async () => {
    const seeker = makeContact({
      id: "s1",
      name: "Noor Haddad",
      org: "Ledger",
      role: "Founder",
      warmth: 80,
      note: "Wants an intro to a designer.",
    });
    const inHouse = makeContact({
      id: "p1",
      name: "Ivy Chen",
      org: "Ledger",
      role: "Product Designer",
      warmth: 95,
    });
    const outside = makeContact({
      id: "p2",
      name: "Marcus Bell",
      org: "Figment",
      role: "Design Lead",
      warmth: 77,
    });
    const weaves = await getWeaves([seeker, inHouse, outside], NOW);
    const intro = weaves.find((w) => w.kind === "intro");
    expect(intro).toBeDefined();
    expect(intro!.id).toBe("intro:s1:p2");
    expect(intro!.people.map((p) => p.id)).toEqual(["s1", "p2"]);
  });

  it("never pairs a seeker with themself", async () => {
    const both = makeContact({
      id: "s1",
      name: "Ada Lovelace",
      role: "Design Lead",
      note: "Wants an intro to a designer.",
    });
    const weaves = await getWeaves([both], NOW);
    expect(weaves.filter((w) => w.kind === "intro")).toEqual([]);
  });

  it("stays quiet over empty notes", async () => {
    const blank = [
      makeContact({ id: "a", note: "", interactions: [] }),
      makeContact({ id: "b", note: "", interactions: [] }),
      makeContact({ id: "c", note: "", interactions: [] }),
    ];
    expect(await getWeaves(blank, NOW)).toEqual([]);
  });

  it("surfaces real weaves from the demo seeds", async () => {
    const weaves = await getWeaves(generateContacts(192), NOW);
    expect(weaves.length).toBeGreaterThanOrEqual(3);
    expect(weaves.some((w) => w.score >= WEAVE_SURFACE_MIN)).toBe(true);
    expect(weaves.some((w) => w.kind === "gather")).toBe(true);
    expect(weaves.some((w) => w.kind === "intro")).toBe(true);
  });
});

describe("draftWeaveMessage", () => {
  it("drafts a gather note naming every member and the thread", async () => {
    const [gather] = await getWeaves(RUNNERS, NOW);
    const draft = await draftWeaveMessage(gather);
    for (const first of ["Zoe", "Kai", "Amara"]) {
      expect(draft).toContain(first);
    }
    expect(draft).toContain("NYC Half");
  });

  it("addresses an intro to the provider as a question", async () => {
    const seeker = makeContact({
      id: "s1",
      name: "Noor Haddad",
      org: "Ledger",
      note: "Wants an intro to a designer.",
    });
    const provider = makeContact({
      id: "p2",
      name: "Marcus Bell",
      org: "Figment",
      role: "Design Lead",
    });
    const weaves = await getWeaves([seeker, provider], NOW);
    const intro = weaves.find((w) => w.kind === "intro")!;
    const draft = await draftWeaveMessage(intro);
    expect(draft.startsWith("Hey Marcus")).toBe(true);
    expect(draft.toLowerCase()).toContain("intro");
  });

  it("cycles deterministic variants", async () => {
    const [weave] = await getWeaves(RUNNERS, NOW);
    const v0 = await draftWeaveMessage(weave, 0);
    const v1 = await draftWeaveMessage(weave, 1);
    expect(v0).not.toBe(v1);
    expect(await draftWeaveMessage(weave, 0)).toBe(v0);
  });
});
