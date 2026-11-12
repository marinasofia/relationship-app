import type { Contact, EventItem } from "../types";
import { warmthOf } from "./warmth";

// Event research: before you go, the AI reads the event, the room, the venue,
// the crowd, and hands you a field guide (how to work it, where to be) plus
// the people worth finding. These samples are deterministic from the event id
// so the demo holds still.

export interface EventIntel {
  /** one-line read of what kind of room this is */
  scene: string;
  /** how to work the room, in order */
  moves: string[];
  /** places to be, before/during/after */
  spots: Array<{ name: string; why: string }>;
}

export interface AttendeeLead {
  name: string;
  role: string;
  org: string;
  init: string;
  /** why this person is worth finding */
  why: string;
}

export interface AttendeeIntel {
  /** your own people likely in the room, warmest first */
  known: Contact[];
  /** new faces worth finding */
  lookFor: AttendeeLead[];
}

/** Small deterministic hash so every event keeps the same intel between renders. */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SCENES = [
  "Operator-heavy crowd, more builders than pitchers.",
  "Investor-dense room; founders circle after the talks.",
  "Small and senior, everyone here knows someone you want to know.",
  "Loud, young, high-energy, catch people early before it scatters.",
];

const MOVES = [
  "Arrive 20 minutes early, the first pour is where the real intros happen.",
  "Skip the main talk; the hallway conversations outlast the slides.",
  "Set one anchor meeting for mid-event so the room comes to you.",
  "Work the exit: walk out with someone worth the walk.",
  "Ask hosts for one intro each, they know who came.",
  "Leave before the end; follow up while they still remember your face.",
];

const SPOTS = [
  { name: "The espresso bar", why: "shortest lines, longest conversations, first hour only" },
  { name: "Registration table at doors-open", why: "you meet everyone once, effortlessly" },
  { name: "The mezzanine rail", why: "quieter, where the senior people drift" },
  { name: "Whatever's across the street", why: "the after-crowd decides the follow-ups" },
  { name: "Near the host", why: "intros compound where the gravity is" },
];

// MODEL: swap point, live version researches the event page + venue.
export function getEventIntel(e: EventItem): EventIntel {
  const h = hashOf(e.id + e.name);
  const pick = <T>(arr: T[], n: number, salt: number): T[] => {
    const out: T[] = [];
    for (let i = 0; out.length < n && i < arr.length; i++) {
      out.push(arr[(h + salt + i * 7) % arr.length]);
      if (new Set(out).size !== out.length) out.pop();
    }
    return out;
  };
  return {
    scene: SCENES[h % SCENES.length],
    moves: pick(MOVES, 3, 1),
    spots: pick(SPOTS, 2, 3),
  };
}

const LEADS: Omit<AttendeeLead, "why">[] = [
  { name: "Dana Whitfield", role: "Partner", org: "Insight Partners", init: "DW" },
  { name: "Marcus Oyelaran", role: "Eng Director", org: "Google", init: "MO" },
  { name: "Sofia Reyes-Kim", role: "Head of Product", org: "Squarespace", init: "SR" },
  { name: "Jonah Adler", role: "Founder", org: "stealth (ex-Datadog)", init: "JA" },
  { name: "Priyanka Rao", role: "Talent Partner", org: "Goldman Sachs", init: "PR" },
  { name: "Theo Lindgren", role: "Research Lead", org: "Two Sigma", init: "TL" },
  { name: "Amara Diallo", role: "GM, NYC", org: "Amazon", init: "AD" },
  { name: "Chris Okafor", role: "Angel · ex-MongoDB", org: "invests pre-seed", init: "CO" },
];

const REASONS = [
  "asks the first question at every talk, easy to approach after",
  "hiring for exactly your kind of profile this quarter",
  "writes the recap everyone forwards; be in it",
  "two warm intros away from you already",
  "backed three companies out of this exact room",
  "knows every host on this circuit",
];

// Sample attendees. `known` is computed from your own data.
export function getAttendeeIntel(e: EventItem, contacts: Contact[]): AttendeeIntel {
  const h = hashOf(e.id);
  const known = [...contacts]
    .filter((c, i) => (hashOf(e.id + c.id) + i) % 29 === 0 || warmthOf(c.warmth).label === "Warm" && hashOf(c.id + e.id) % 17 === 0)
    .sort((a, b) => b.warmth - a.warmth)
    .slice(0, Math.max(2, Math.min(5, e.known || 3)));
  const lookFor: AttendeeLead[] = Array.from({ length: 3 }, (_, i) => {
    const lead = LEADS[(h + i * 3) % LEADS.length];
    return { ...lead, why: REASONS[(h + i * 5) % REASONS.length] };
  }).filter((l, i, arr) => arr.findIndex((x) => x.name === l.name) === i);
  return { known, lookFor };
}
