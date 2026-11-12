import type { EventItem } from "../types";

// MODEL: before an event, the AI reads it and preps you: what it is, which of your
// contacts are likely there, a suggested goal, and talking points. This mock returns
// the event's own seeded prep fields. Swap in real event-reading + contact-matching here.
export function getEventPrep(e: EventItem): {
  known: number;
  goal: string;
  talkingPoints: string[];
} {
  return {
    known: e.known,
    goal: e.goal,
    talkingPoints: e.talkingPoints,
  };
}
