import type { Contact, PastEvent } from "../types";
import { AgentError, isRecord, optStr, str, type AgentDraft } from "./agent";

// Standing rules and the weekly report. Rules never send anything; they only
// prepare drafts and reminders for approval, evaluated deterministically from
// local history.

export type AgentRuleKind = "KEEP_IN_TOUCH" | "THANK_AFTER_EVENT" | "BIRTHDAY" | "REPLY_REMINDER";

export type AgentRuleParams =
  | { contactIds: string[]; cadenceDays: number }
  | { withinHours: number }
  | { daysBefore: number }
  | { afterDays: number };

export interface AgentRule {
  id: string;
  kind: AgentRuleKind;
  params: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastEvaluatedAt: string | null;
}

export interface AgentRuleInput { id?: string; kind: AgentRuleKind; params: Record<string, unknown>; enabled: boolean }

export interface AgentRuleReminder { ruleId: string; contactId: string; reason: string }
export interface AgentRuleRun { drafted: AgentDraft[]; reminders: AgentRuleReminder[] }

export interface AgentReportCounts { drafted: number; approved: number; remindersDue: number; goalStepsDone: number; signalsFound: number }
export interface AgentActivity { id: string; kind: string; summary: string; contactId: string | null; createdAt: string }
export interface AgentWeeklyReport { weekOf: string; summary: string; counts: AgentReportCounts; highlights: string[]; activity: AgentActivity[] }

export const MAX_RULES = 20;
export const MAX_KEEP_IN_TOUCH_CONTACTS = 50;

/** Integer bounds per parameter, straight from the contract. */
export const RULE_BOUNDS = {
  cadenceDays: { min: 7, max: 365, fallback: 30 },
  withinHours: { min: 12, max: 72, fallback: 24 },
  daysBefore: { min: 0, max: 7, fallback: 1 },
  afterDays: { min: 1, max: 14, fallback: 3 },
} as const;

export const RULE_TEMPLATES: Record<AgentRuleKind, { title: string; description: string; defaults: Record<string, unknown> }> = {
  KEEP_IN_TOUCH: {
    title: "Keep in touch",
    description: "Prepare a check-in when you haven't talked to someone in a while.",
    defaults: { contactIds: [], cadenceDays: RULE_BOUNDS.cadenceDays.fallback },
  },
  THANK_AFTER_EVENT: {
    title: "Thank people after events",
    description: "Draft a thank-you to the people you met, soon after the event ends.",
    defaults: { withinHours: RULE_BOUNDS.withinHours.fallback },
  },
  BIRTHDAY: {
    title: "Birthdays",
    description: "Remind you, and prepare a note, before a birthday your agent picked up.",
    defaults: { daysBefore: RULE_BOUNDS.daysBefore.fallback },
  },
  REPLY_REMINDER: {
    title: "Don't leave people hanging",
    description: "Remind you when someone's last message to you is still unanswered.",
    defaults: { afterDays: RULE_BOUNDS.afterDays.fallback },
  },
};

const KINDS = new Set<AgentRuleKind>(["KEEP_IN_TOUCH", "THANK_AFTER_EVENT", "BIRTHDAY", "REPLY_REMINDER"]);

function inBounds(value: unknown, key: keyof typeof RULE_BOUNDS): boolean {
  const b = RULE_BOUNDS[key];
  return typeof value === "number" && Number.isInteger(value) && value >= b.min && value <= b.max;
}

/** A user-facing reason the params are invalid, or null when they fit the contract. */
export function validateRuleParams(kind: AgentRuleKind, params: Record<string, unknown>): string | null {
  switch (kind) {
    case "KEEP_IN_TOUCH": {
      const ids = params.contactIds;
      if (!Array.isArray(ids) || !ids.length) return "Choose at least one person.";
      if (ids.length > MAX_KEEP_IN_TOUCH_CONTACTS) return `Choose at most ${MAX_KEEP_IN_TOUCH_CONTACTS} people.`;
      if (!ids.every(id => typeof id === "string")) return "Choose people from your list.";
      return inBounds(params.cadenceDays, "cadenceDays") ? null : "Pick a cadence between 7 and 365 days.";
    }
    case "THANK_AFTER_EVENT": return inBounds(params.withinHours, "withinHours") ? null : "Pick between 12 and 72 hours.";
    case "BIRTHDAY": return inBounds(params.daysBefore, "daysBefore") ? null : "Pick between 0 and 7 days.";
    case "REPLY_REMINDER": return inBounds(params.afterDays, "afterDays") ? null : "Pick between 1 and 14 days.";
  }
}

export function parseAgentRule(value: unknown): AgentRule | null {
  if (!isRecord(value) || !str(value.id) || !KINDS.has(value.kind as AgentRuleKind) || !isRecord(value.params)) return null;
  return {
    id: value.id, kind: value.kind as AgentRuleKind, params: value.params, enabled: value.enabled === true,
    createdAt: str(value.createdAt) ? value.createdAt : "", updatedAt: str(value.updatedAt) ? value.updatedAt : "",
    lastEvaluatedAt: optStr(value.lastEvaluatedAt) ?? null,
  };
}

export function describeRule(rule: Pick<AgentRule, "kind" | "params">, contacts: Contact[]): string {
  const p = rule.params;
  switch (rule.kind) {
    case "KEEP_IN_TOUCH": {
      const ids = Array.isArray(p.contactIds) ? p.contactIds : [];
      const names = ids.map(id => contacts.find(c => c.id === id)?.name.split(" ")[0]).filter(Boolean) as string[];
      const who = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
      return `Check in with ${who || "chosen people"} at least every ${p.cadenceDays} days.`;
    }
    case "THANK_AFTER_EVENT": return `Draft thank-yous within ${p.withinHours} hours of an event.`;
    case "BIRTHDAY": return Number(p.daysBefore) === 0 ? "Remind you on the day of a birthday." : `Remind you ${p.daysBefore} day${p.daysBefore === 1 ? "" : "s"} before a birthday.`;
    case "REPLY_REMINDER": return `Remind you when a message has waited ${p.afterDays} day${p.afterDays === 1 ? "" : "s"} for a reply.`;
  }
}

const COUNT_KEYS: (keyof AgentReportCounts)[] = ["drafted", "approved", "remindersDue", "goalStepsDone", "signalsFound"];

export function parseWeeklyReport(value: unknown): AgentWeeklyReport {
  if (!isRecord(value) || !str(value.weekOf) || !str(value.summary) || !isRecord(value.counts)) throw new AgentError("INVALID_RESPONSE");
  const raw = value.counts;
  const counts = Object.fromEntries(COUNT_KEYS.map(k => [k, typeof raw[k] === "number" && raw[k] >= 0 ? Math.floor(raw[k] as number) : 0])) as unknown as AgentReportCounts;
  const activity = Array.isArray(value.activity) ? value.activity.flatMap((a): AgentActivity[] => isRecord(a) && str(a.id) && str(a.summary) && str(a.kind)
    ? [{ id: a.id, kind: a.kind, summary: a.summary, contactId: optStr(a.contactId) ?? null, createdAt: str(a.createdAt) ? a.createdAt : "" }] : []) : [];
  return {
    weekOf: value.weekOf, summary: value.summary, counts,
    highlights: Array.isArray(value.highlights) ? value.highlights.filter(str).slice(0, 5) : [],
    activity,
  };
}

// ---- On-device evaluation -------------------------------------------------

const DAY = 86_400_000;

/**
 * Deterministic evaluation for demo and on-device builds. KEEP_IN_TOUCH uses
 * the last recorded interaction; THANK_AFTER_EVENT uses contacts recorded as
 * met on the day of a recent past event. BIRTHDAY and REPLY_REMINDER need
 * message history, which the demo does not have.
 */
export function evaluateLocalRules(rules: AgentRule[], input: { contacts: Contact[]; past: PastEvent[]; now: number }): AgentRuleReminder[] {
  const out: AgentRuleReminder[] = [];
  const seen = new Set<string>();
  const push = (r: AgentRuleReminder) => { const key = `${r.ruleId}:${r.contactId}`; if (!seen.has(key)) { seen.add(key); out.push(r); } };
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.kind === "KEEP_IN_TOUCH") {
      const cadence = Number(rule.params.cadenceDays);
      const ids = Array.isArray(rule.params.contactIds) ? rule.params.contactIds : [];
      for (const contact of input.contacts) {
        if (!ids.includes(contact.id)) continue;
        const last = Date.parse(contact.lastInteractionAt);
        const days = Number.isFinite(last) ? Math.floor((input.now - last) / DAY) : Infinity;
        if (days >= cadence) push({
          ruleId: rule.id, contactId: contact.id,
          reason: Number.isFinite(days) ? `It's been ${days} days; your rule says every ${cadence}.` : `No recorded check-in yet; your rule says every ${cadence} days.`,
        });
      }
    } else if (rule.kind === "THANK_AFTER_EVENT") {
      const within = Number(rule.params.withinHours) * 3_600_000;
      for (const event of input.past) {
        const at = Date.parse(event.at);
        if (!Number.isFinite(at) || input.now - at < 0 || input.now - at > within) continue;
        const day = new Date(at).toDateString();
        for (const contact of input.contacts) {
          if (contact.interactions.some(i => i.kind === "met" && new Date(i.at).toDateString() === day)) {
            push({ ruleId: rule.id, contactId: contact.id, reason: `You met at ${event.name}. A quick thank-you lands best now.` });
          }
        }
      }
    }
  }
  return out;
}

export function localRulesKey(owner: string | null, demo: boolean): string {
  return `relapp.agent.rules.${demo ? "demo" : owner ?? "local"}`;
}

export function readLocalRules(key: string): AgentRule[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(parseAgentRule).filter((r): r is AgentRule => r !== null) : [];
  } catch { return []; }
}

export function writeLocalRules(key: string, rules: AgentRule[]): void {
  try { window.localStorage.setItem(key, JSON.stringify(rules)); } catch { /* storage is optional */ }
}

/** A weekly report computed from local history only; no model, no network. */
export function buildLocalWeeklyReport(input: { contacts: Contact[]; rules: AgentRule[]; past: PastEvent[]; goalStepsDone: number; weekOf: string; now: number }): AgentWeeklyReport {
  const start = Date.parse(`${input.weekOf}T00:00:00`);
  const end = start + 7 * DAY;
  const followups = input.contacts.flatMap(c => c.interactions
    .filter(i => i.kind === "followup" && Date.parse(i.at) >= start && Date.parse(i.at) < end)
    .map(i => ({ contact: c, at: i.at })));
  const reminders = evaluateLocalRules(input.rules, { contacts: input.contacts, past: input.past, now: input.now });
  const counts: AgentReportCounts = { drafted: 0, approved: followups.length, remindersDue: reminders.length, goalStepsDone: input.goalStepsDone, signalsFound: 0 };
  const highlights = [
    followups.length ? `You followed up with ${followups.length} ${followups.length === 1 ? "person" : "people"}.` : "",
    input.goalStepsDone ? `You finished ${input.goalStepsDone} goal ${input.goalStepsDone === 1 ? "step" : "steps"}.` : "",
    reminders.length ? `${reminders.length} ${reminders.length === 1 ? "reminder is" : "reminders are"} waiting from your rules.` : "",
  ].filter(Boolean);
  return {
    weekOf: input.weekOf,
    summary: highlights.length ? "Here's how your week of keeping in touch went." : "A quiet week. Set a rule or a goal and your agent will keep you on track.",
    counts, highlights,
    activity: followups.slice(0, 20).map((f, i) => ({ id: `local-activity:${i}`, kind: "DRAFT_APPROVED", summary: `Followed up with ${f.contact.name}`, contactId: f.contact.id, createdAt: f.at })),
  };
}
