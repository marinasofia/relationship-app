import { describe, expect, it } from "vitest";
import { generateContacts } from "./generateContacts";
import { warmthOf } from "../services/warmth";

describe("generateContacts", () => {
  const people = generateContacts(192);

  it("makes exactly the asked-for number, deterministically", () => {
    expect(people).toHaveLength(192);
    // Same seed → same people (dates derive from now, so compare stable fields).
    const again = generateContacts(192);
    expect(again.map((c) => [c.id, c.name, c.org, c.warmth, c.met])).toEqual(
      people.map((c) => [c.id, c.name, c.org, c.warmth, c.met]),
    );
  });

  it("gives everyone a unique id and name", () => {
    expect(new Set(people.map((c) => c.id)).size).toBe(192);
    expect(new Set(people.map((c) => c.name)).size).toBe(192);
  });

  it("keeps warmth in range and covers all four bands", () => {
    const labels = new Set(people.map((c) => warmthOf(c.warmth).label));
    for (const c of people) {
      expect(c.warmth).toBeGreaterThanOrEqual(0);
      expect(c.warmth).toBeLessThanOrEqual(100);
    }
    expect(labels.size).toBe(4);
  });

  it("builds coherent histories: sorted, met first, lastInteractionAt matches", () => {
    for (const c of people) {
      expect(c.interactions.length).toBeGreaterThanOrEqual(1);
      expect(c.interactions[0].kind).toBe("met");
      const ats = c.interactions.map((ix) => ix.at);
      expect([...ats].sort()).toEqual(ats);
      expect(c.lastInteractionAt).toBe(ats[ats.length - 1]);
    }
  });

  it("clusters companies: some deep footholds, everyone employed", () => {
    const byOrg = new Map<string, number>();
    for (const c of people) {
      expect(c.org).not.toBe("");
      byOrg.set(c.org, (byOrg.get(c.org) ?? 0) + 1);
    }
    const counts = [...byOrg.values()].sort((a, b) => b - a);
    expect(counts[0]).toBeGreaterThanOrEqual(10); // an anchor company
    expect(counts.filter((n) => n >= 2).length).toBeGreaterThanOrEqual(15);
  });

  it("gives most people an email and everyone a LinkedIn handle", () => {
    const withEmail = people.filter((c) => c.email).length;
    expect(withEmail / people.length).toBeGreaterThan(0.7);
    for (const c of people) {
      expect(c.socials.some((s) => s.type === "linkedin")).toBe(true);
      expect(c.note.length).toBeGreaterThan(20);
    }
  });
});
