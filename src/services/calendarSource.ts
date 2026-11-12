import type { Connections } from "../types";

// The sample calendar feed: a believable week of calendar entries laid out
// relative to now, the same on every render.

export interface CalendarEntry {
  id: string;
  name: string;
  /** ISO timestamps */
  startsAt: string;
  endsAt: string;
  where: string;
  source: "google" | "outlook";
}

interface Slot {
  /** days from today (can be negative for context, calendar shows them muted) */
  day: number;
  hour: number;
  minutes: number;
  name: string;
  where: string;
  durationMin: number;
}

// One believable working week, repeated nowhere: times chosen to read real.
const GOOGLE_WEEK: Slot[] = [
  { day: 1, hour: 9, minutes: 30, name: "Portfolio sync", where: "Zoom", durationMin: 45 },
  { day: 1, hour: 15, minutes: 0, name: "Coffee · Aisha Nasser", where: "Devoción, Williamsburg", durationMin: 45 },
  { day: 2, hour: 12, minutes: 0, name: "Lunch · Two Sigma intro", where: "The Odeon, Tribeca", durationMin: 75 },
  { day: 3, hour: 10, minutes: 0, name: "Board prep", where: "SoHo Works", durationMin: 90 },
  { day: 4, hour: 17, minutes: 30, name: "Advisor check-in", where: "Google Meet", durationMin: 30 },
  { day: 6, hour: 11, minutes: 0, name: "Deep work, no meetings", where: "", durationMin: 180 },
  { day: 8, hour: 9, minutes: 0, name: "Recruiting screen", where: "Zoom", durationMin: 30 },
  { day: 9, hour: 16, minutes: 0, name: "Pitch dry run", where: "Goldman Sachs, 200 West", durationMin: 60 },
  { day: 11, hour: 13, minutes: 0, name: "Design review", where: "Figma huddle", durationMin: 45 },
  { day: -2, hour: 14, minutes: 0, name: "1:1 · Priya Raman", where: "Datadog, 45th St", durationMin: 30 },
];

function slotIso(base: Date, s: Slot, offsetMin = 0): string {
  const d = new Date(base);
  d.setDate(d.getDate() + s.day);
  d.setHours(s.hour, s.minutes + offsetMin, 0, 0);
  return d.toISOString();
}

/** Entries from every connected calendar; empty when nothing is connected. */
export function getConnectedCalendarEntries(
  connections: Connections,
  now: number = Date.now(),
): CalendarEntry[] {
  if (!connections.google) return [];
  const base = new Date(now);
  return GOOGLE_WEEK.map((s, i) => ({
    id: `gcal-${i}`,
    name: s.name,
    startsAt: slotIso(base, s),
    endsAt: slotIso(base, s, s.durationMin),
    where: s.where,
    source: "google" as const,
  }));
}
