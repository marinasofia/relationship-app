import type { Contact, EventItem } from "../types";
import { isRecord, optStr, str, type AgentDraft, type AgentDraftChannel } from "./agent";

// The agent prepares meetings and proposes meeting times. It never sends
// anything; every outward step is a PROPOSED draft the user approves. It works
// from local events and contacts only, with no network.

export interface AgentPrepPerson { contactId: string; lastTouch: string | null; openItems: string[] }

export interface AgentMeetingPrep {
  eventId: string;
  title: string;
  startsAt: string;
  people: AgentPrepPerson[];
  talkingPoints: string[];
  goalLinks: string[];
}

export type AgentUrgency = "HIGH" | "NORMAL" | "LOW";

export interface AgentInboxItem {
  signalId: string;
  contactId: string;
  summary: string;
  urgency: AgentUrgency;
  occurredAt: string | null;
  channel: string | null;
}

export interface AgentSlot { start: string; end: string }

export interface AgentTimesProposal {
  slots: AgentSlot[];
  draft: AgentDraft | null;
  reason: "NO_CALENDAR" | "NO_SLOTS" | null;
}

export interface AgentContactUpdate { contactId: string | null; role: string | null; org: string | null }

export const DURATION_BOUNDS = { min: 15, max: 120 } as const;
export const WITHIN_DAYS_BOUNDS = { min: 1, max: 14 } as const;
const MAX_TALKING_POINTS = 5;
const MAX_GOAL_LINKS = 3;
const strings = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => str(v) && v.trim().length > 0).slice(0, max) : [];

export function parseMeetingPrep(value: unknown): AgentMeetingPrep | null {
  if (!isRecord(value) || !str(value.eventId) || !str(value.title)) return null;
  const people = Array.isArray(value.people) ? value.people.flatMap((p): AgentPrepPerson[] => {
    if (!isRecord(p) || !str(p.contactId)) return [];
    return [{ contactId: p.contactId, lastTouch: optStr(p.lastTouch) ?? null, openItems: strings(p.openItems, 10) }];
  }) : [];
  return {
    eventId: value.eventId, title: value.title, startsAt: str(value.startsAt) ? value.startsAt : "",
    people, talkingPoints: strings(value.talkingPoints, MAX_TALKING_POINTS), goalLinks: strings(value.goalLinks, MAX_GOAL_LINKS),
  };
}

export function localTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}



export function validateTimesRequest(durationMinutes: number, withinDays: number): string | null {
  if (!Number.isInteger(durationMinutes) || durationMinutes < DURATION_BOUNDS.min || durationMinutes > DURATION_BOUNDS.max) {
    return `Pick a length between ${DURATION_BOUNDS.min} and ${DURATION_BOUNDS.max} minutes.`;
  }
  if (!Number.isInteger(withinDays) || withinDays < WITHIN_DAYS_BOUNDS.min || withinDays > WITHIN_DAYS_BOUNDS.max) {
    return `Look between ${WITHIN_DAYS_BOUNDS.min} and ${WITHIN_DAYS_BOUNDS.max} days ahead.`;
  }
  return null;
}

// ---- On-device equivalents ---------------------------------------------

const norm = (value: string) => value.trim().toLowerCase();

/** Meeting prep from local data: people met at an event of the same name, the event's own notes, and goals. */
export function buildLocalMeetingPrep(event: EventItem, contacts: Contact[], goalTitles: string[] = []): AgentMeetingPrep {
  const name = norm(event.name);
  const people = name ? contacts
    .filter(c => norm(c.met).includes(name) || c.interactions.some(i => norm(i.summary).includes(name)))
    .sort((a, b) => Date.parse(b.lastInteractionAt) - Date.parse(a.lastInteractionAt))
    .slice(0, 6)
    .map(c => ({
      contactId: c.id,
      lastTouch: c.lastInteractionAt || null,
      openItems: c.note.trim() ? [c.note.trim().slice(0, 140)] : [],
    })) : [];
  const points = [
    ...event.talkingPoints.filter(p => p.trim()),
    ...(event.goal.trim() ? [`Your goal for this: ${event.goal.trim()}`] : []),
  ].slice(0, MAX_TALKING_POINTS);
  return {
    eventId: event.id, title: event.name, startsAt: event.startsAt, people,
    talkingPoints: points.length ? points : ["Ask what they're working on this quarter.", "Share one thing you're hoping to learn."],
    goalLinks: goalTitles.filter(t => t.trim()).slice(0, MAX_GOAL_LINKS),
  };
}

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const SLOT_STEP_MINUTES = 30;

/**
 * Three free weekday slots between 09:00 and 18:00 local time, avoiding the
 * user's own events, spread across different days where possible.
 */
export function localFreeSlots(events: EventItem[], now: number, durationMinutes: number, withinDays: number): AgentSlot[] {
  const busy = events
    .map(e => [Date.parse(e.startsAt), Date.parse(e.endsAt)] as const)
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e));
  const length = durationMinutes * 60_000;
  const earliest = now + 2 * 3_600_000;
  const byDay: AgentSlot[][] = [];
  for (let offset = 0; offset <= withinDays; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const slots: AgentSlot[] = [];
    for (let minutes = WORK_START_HOUR * 60; minutes + durationMinutes <= WORK_END_HOUR * 60; minutes += SLOT_STEP_MINUTES) {
      const start = new Date(day);
      start.setHours(0, minutes, 0, 0);
      const s = start.getTime();
      const e = s + length;
      if (s < earliest) continue;
      if (busy.some(([bs, be]) => s < be && e > bs)) continue;
      slots.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString() });
    }
    if (slots.length) byDay.push(slots);
  }
  // One slot per day first (mid-morning-ish preference by taking the second slot when available), then fill.
  const picked: AgentSlot[] = [];
  for (const slots of byDay) {
    if (picked.length === 3) break;
    picked.push(slots[Math.min(2, slots.length - 1)]);
  }
  for (const slots of byDay) {
    for (const slot of slots) {
      if (picked.length === 3) break;
      if (!picked.some(p => p.start === slot.start)) picked.push(slot);
    }
  }
  return picked.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function formatSlot(slot: AgentSlot): string {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const day = start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time(start)} to ${time(end)}`;
}

/** A PROPOSED draft offering the slots; never sent by the app. */
export function buildLocalTimesDraft(contact: Contact, slots: AgentSlot[], durationMinutes: number, channel: AgentDraftChannel): AgentDraft {
  const first = contact.name.trim().split(/\s+/)[0] || "there";
  const list = slots.map(slot => `• ${formatSlot(slot)}`).join("\n");
  const body = channel === "IMESSAGE"
    ? `Hey ${first}! Want to grab ${durationMinutes} minutes to catch up? Any of these work?\n${list}`
    : `Hi ${first},\n\nWould you be up for a ${durationMinutes}-minute catch-up? Any of these times work on my end:\n\n${list}\n\nHappy to find another time if none of these suit you.\n\nBest,`;
  return {
    id: `local-draft:times:${contact.id}:${Date.now()}`, contactId: contact.id, channel,
    intent: `Offer ${slots.length} times for a ${durationMinutes}-minute catch-up`,
    subject: channel === "EMAIL" ? "Finding a time to catch up" : undefined, body, state: "PROPOSED",
  };
}
