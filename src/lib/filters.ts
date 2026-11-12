import type { Contact } from "../types";
import type { FilterKey } from "../state/reducer";
import { getDecayRisk } from "../services/warmth";
import { daysSince } from "./dates";

// The one definition of the rolodex filters, shared by the People list and the
// desktop memory tree so "Warm" always means the same person in both places.

export const FILTERS: FilterKey[] = ["All", "Warm", "Going cold", "Recent"];

/** "Recent" means an interaction inside this window. */
const RECENT_DAYS = 14;

export function matchesFilter(c: Contact, filter: FilterKey): boolean {
  if (filter === "Warm") return getDecayRisk(c).label === "Warm";
  if (filter === "Going cold") return getDecayRisk(c).label === "Going cold";
  if (filter === "Recent") return daysSince(c.lastInteractionAt) <= RECENT_DAYS;
  return true;
}

/** Case-insensitive match against the fields people actually remember. */
export function matchesQuery(c: Contact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.name.toLowerCase().includes(q) ||
    c.org.toLowerCase().includes(q) ||
    c.role.toLowerCase().includes(q) ||
    c.met.toLowerCase().includes(q)
  );
}
