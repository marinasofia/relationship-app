import type { Contact, DyadStats, EventItem, TodayPreference } from "../types";

export const DAY = 86_400_000;
export const TODAY_LIMIT = 3;
const RECONNECT_AFTER_DAYS = 30;
const MAX_PREFERENCES = 200;

export interface TodaySuggestion {
  key: string;
  kind: "reconnect" | "event";
  title: string;
  reason: string;
  evidence: string;
  sourceAt: string;
  priority: number;
  contact?: Contact;
  event?: EventItem;
}

/** Feedback contains identifiers and user choices, never generated prose. */
export function normalizeTodayPreferences(value: unknown): TodayPreference[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TodayPreference => {
    if (!item || typeof item !== "object") return false;
    const p = item as TodayPreference;
    return typeof p.key === "string" && p.key.length <= 500
      && (p.action === "snoozed" || p.action === "dismissed")
      && Number.isFinite(p.recordedAt) && Number.isFinite(p.expiresAt)
      && p.expiresAt > p.recordedAt;
  }).sort((a, b) => b.recordedAt - a.recordedAt).slice(0, MAX_PREFERENCES);
}

export function rememberTodayChoice(
  previous: unknown, key: string, action: TodayPreference["action"], now: number,
): TodayPreference[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const preference: TodayPreference = {
    key, action, recordedAt: now,
    expiresAt: action === "snoozed" ? tomorrow.getTime() : now + 90 * DAY,
  };
  return [preference, ...normalizeTodayPreferences(previous)
    .filter(p => p.key !== key && p.expiresAt > now)].slice(0, MAX_PREFERENCES);
}

export function isTodayHidden(key: string, preferences: unknown, now: number): boolean {
  return normalizeTodayPreferences(preferences).some(p => p.key === key && p.expiresAt > now);
}

function lastTouch(contact: Contact, dyad?: Readonly<DyadStats>): number | null {
  // Notes alone and row-creation defaults do not prove a conversation occurred.
  const dates = contact.interactions.filter(i => i.kind !== "note").map(i => Date.parse(i.at));
  if (dates.some(Number.isFinite)) dates.push(Date.parse(contact.lastInteractionAt));
  if (dyad?.lastInteractionAt) dates.push(Date.parse(dyad.lastInteractionAt));
  const valid = dates.filter(Number.isFinite);
  return valid.length ? Math.max(...valid) : null;
}

/** Cheap, deterministic selection. No provider calls, guessed commitments or AI text. */
export function selectTodaySuggestions(input: {
  contacts: Contact[];
  events: EventItem[];
  now: number;
  dyads?: ReadonlyMap<string, Readonly<DyadStats>>;
  preferences?: TodayPreference[];
}): TodaySuggestion[] {
  const { contacts, events, now, dyads } = input;
  const candidates: TodaySuggestion[] = [];
  for (const event of events) {
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    if (!event.name.trim() || !Number.isFinite(start) || !Number.isFinite(end)
      || end <= start || start < now || start > now + 7 * DAY) continue;
    const days = Math.ceil((start - now) / DAY);
    candidates.push({
      key: `event:${encodeURIComponent(event.id)}:${event.startsAt}`,
      kind: "event", event, title: `Get ready for ${event.name}`,
      reason: `${days <= 1 ? "Coming up in the next 24 hours" : `Coming up in ${days} days`}.${event.goal.trim() ? ` Your saved goal: ${event.goal.trim()}` : " Take a moment to decide what you want from this event."}`,
      evidence: "Saved event", sourceAt: event.startsAt, priority: 110 - days,
    });
  }

  for (const contact of contacts) {
    const dyad = dyads?.get(contact.id);
    const touch = lastTouch(contact, dyad);
    if (touch === null || touch > now) continue;
    const days = Math.floor((now - touch) / DAY);
    if (days < RECONNECT_AFTER_DAYS) continue;
    const gap = dyad?.medianGapDays;
    // A slow established rhythm is not itself a reason to reach out early.
    if (gap && Number.isFinite(gap) && days <= gap * 1.5) continue;
    const measured = dyad?.decayConfidence === "model_scored"
      && dyad.risk != null && Number.isFinite(dyad.risk) && dyad.risk >= 0 && dyad.risk <= 100;
    candidates.push({
      key: `reconnect:${encodeURIComponent(contact.id)}:${touch}`,
      kind: "reconnect", contact, title: `Check in with ${contact.name.split(" ")[0]}`,
      reason: `Your last recorded interaction was ${days} days ago.${gap && Number.isFinite(gap) && gap > 0 && dyad?.decayConfidence !== "insufficient_history"
        ? ` Your recorded conversations are usually about ${Math.round(gap)} days apart.`
        : " A short check-in could be a good next step."}`,
      evidence: dyad?.lastInteractionAt && Date.parse(dyad.lastInteractionAt) === touch ? "Connected conversation history" : "Recorded interaction",
      sourceAt: new Date(touch).toISOString(),
      priority: 40 + Math.min(20, days / 7) + (measured ? (dyad!.risk! / 100) * 10 : 0),
    });
  }

  const selected: TodaySuggestion[] = [];
  const seen = new Set<string>();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  // Today's choices leave breathing room. On later days, dismissed items
  // stop occupying the shortlist, allowing other people to receive attention.
  const priorDismissals = new Set(normalizeTodayPreferences(input.preferences)
    .filter(p => p.action === "dismissed" && p.recordedAt < dayStart.getTime() && p.expiresAt > now)
    .map(p => p.key));
  let eventSelected = false;
  for (const candidate of candidates.sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))) {
    if (priorDismissals.has(candidate.key)) continue;
    const entity = candidate.contact ? `contact:${candidate.contact.id}` : `event:${candidate.event!.id}`;
    if (seen.has(entity) || (candidate.kind === "event" && eventSelected)) continue;
    selected.push(candidate);
    seen.add(entity);
    if (candidate.kind === "event") eventSelected = true;
    if (selected.length === TODAY_LIMIT) break;
  }
  // Apply dismissals AFTER selection in the view: no endless replacement feed.
  return selected;
}
