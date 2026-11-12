import type { Contact } from "../types";
import { metAtOf } from "./contacts";

// Past events, reconstructed from the rolodex itself: every contact carries the
// label of where you met, so grouping by that label recovers each room, who
// you met there, when, and whether you ever closed the loop. No stored stats;
// the numbers are always as alive as the contacts.

export interface EventDigest {
  /** normalized grouping key (lowercased met label) */
  key: string;
  name: string;
  /** ISO timestamp of the most recent meeting there */
  at: string;
  /** everyone met there, warmest first */
  people: Contact[];
  /** how many of them ever got a follow-up */
  followed: number;
}

/** Whether any follow-up was ever sent to this contact. */
export function hasFollowedUp(c: Contact): boolean {
  return c.interactions.some((ix) => ix.kind === "followup");
}

/** Group contacts by where you met them, newest room first. */
export function digestPastEvents(contacts: Contact[]): EventDigest[] {
  const groups = new Map<string, { name: string; people: Contact[] }>();
  for (const c of contacts) {
    const name = c.met.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const g = groups.get(key);
    if (g) g.people.push(c);
    else groups.set(key, { name, people: [c] });
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const people = [...g.people].sort((a, b) => b.warmth - a.warmth);
      const at = people
        .map(metAtOf)
        .reduce((latest, t) => (t > latest ? t : latest));
      return {
        key,
        name: g.name,
        at,
        people,
        followed: people.filter(hasFollowedUp).length,
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
