import type { Contact, WarmthLabel } from "../types";
import { getDecayRisk, warmthOf } from "./warmth";
import { daysSince } from "../lib/dates";

// Company intelligence for the memory tree's zoom-in story: everything the
// panel says about your standing at one company, computed purely from the
// rolodex. MODEL: org matching is exact-label today; entity resolution
// (subsidiaries, renames, "Google" vs "Google NYC") arrives with enrichment.

export interface CompanyIntel {
  org: string;
  /** members, warmest first */
  people: Contact[];
  count: number;
  /** share of your employed network at this company, 0 to 1 */
  share: number;
  bands: Array<{ label: WarmthLabel; count: number }>;
  warmest?: Contact;
  /** who to reconnect with first: the member closest to going cold */
  atRisk?: Contact;
  /** days since anyone there heard from you */
  lastTouchDays: number;
  /** the rooms where this cluster came from */
  topEvents: Array<{ label: string; count: number }>;
}

const BAND_ORDER: WarmthLabel[] = ["Warm", "Steady", "Cooling", "Going cold"];

export function getCompanyIntel(
  org: string,
  contacts: Contact[],
  now: number = Date.now(),
): CompanyIntel {
  const label = org.trim().toLowerCase();
  const people = contacts
    .filter((c) => c.org.trim().toLowerCase() === label)
    .sort((a, b) => b.warmth - a.warmth);

  const employed = contacts.filter((c) => c.org.trim() !== "").length;

  const bandCount = new Map<WarmthLabel, number>();
  for (const p of people) {
    const b = warmthOf(p.warmth).label;
    bandCount.set(b, (bandCount.get(b) ?? 0) + 1);
  }

  const eventCount = new Map<string, number>();
  for (const p of people) {
    const met = p.met.trim();
    if (met) eventCount.set(met, (eventCount.get(met) ?? 0) + 1);
  }

  const atRisk =
    people.length > 0
      ? [...people].sort((a, b) => getDecayRisk(b).risk - getDecayRisk(a).risk)[0]
      : undefined;

  return {
    org,
    people,
    count: people.length,
    share: employed > 0 ? people.length / employed : 0,
    bands: BAND_ORDER.map((b) => ({ label: b, count: bandCount.get(b) ?? 0 })),
    warmest: people[0],
    atRisk,
    lastTouchDays:
      people.length > 0
        ? Math.min(...people.map((p) => daysSince(p.lastInteractionAt, now)))
        : 0,
    topEvents: [...eventCount.entries()]
      .map(([l, count]) => ({ label: l, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 3),
  };
}
