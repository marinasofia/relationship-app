import type { EventItem, PastEvent } from "../types";
import { daysAgoIso, minutesFromNowIso, nextWeekdayIso } from "../lib/dates";

// Upcoming events. Live/upcoming/past are derived from startsAt/endsAt, the first
// seed is always mid-event so "during" mode can be demoed at any time.
export const EVENTS: EventItem[] = [
  {
    id: "e1",
    name: "Startup Grind NYC: AI Edition",
    startsAt: minutesFromNowIso(-50),
    endsAt: minutesFromNowIso(70),
    where: "SoHo Works, Broadway",
    known: 4,
    goal: "Reconnect with 2 cooling contacts",
    talkingPoints: ["Your working prototype", "Their recent raise", "Intros you can offer"],
  },
  {
    id: "e2",
    name: "Product Coffee",
    startsAt: nextWeekdayIso(5, 9),
    endsAt: nextWeekdayIso(5, 10),
    where: "La Cabra, NoHo",
    known: 2,
    goal: "Meet 1 new PM",
    talkingPoints: ["Roadmap approaches", "Beta feedback loop"],
  },
];

// Past events, showing the follow-through the app is meant to improve. Dates line
// up with when the seed contacts were met there.
export const PAST: PastEvent[] = [
  { id: "p1", name: "AI Founders Night", at: daysAgoIso(6, 21), met: 23, followed: 14 },
  { id: "p2", name: "Demo Day", at: daysAgoIso(10, 17), met: 17, followed: 9 },
];
