import type { Contact } from "../types";
import { isRecord, optStr, str } from "./agent";

// Goal-driven networking. Plans are built deterministically from keywords in
// contacts' role and organisation, with no network.

export type AgentGoalState = "ACTIVE" | "ACHIEVED" | "ARCHIVED";
export type AgentGoalStepState = "OPEN" | "DONE" | "SKIPPED";
export type AgentGoalFit = "HIGH" | "MEDIUM" | "LOW";

export interface AgentGoalStep {
  id: string;
  contactId: string | null;
  weekOf: string;
  action: string;
  rationale: string;
  state: AgentGoalStepState;
  draftIntent?: string;
}

export interface AgentGoalPerson { contactId: string; fit: AgentGoalFit; why: string }

export interface AgentGoal {
  id: string;
  title: string;
  detail: string | null;
  targetDate: string | null;
  state: AgentGoalState;
  people: AgentGoalPerson[];
  steps: AgentGoalStep[];
  plannedAt: string | null;
}

export interface AgentGoalInput { id?: string; title: string; detail: string; targetDate: string }

export const MAX_ACTIVE_GOALS = 5;
export const GOAL_TITLE_MAX = 200;
export const GOAL_DETAIL_MAX = 2000;

const GOAL_STATES = new Set<AgentGoalState>(["ACTIVE", "ACHIEVED", "ARCHIVED"]);
const STEP_STATES = new Set<AgentGoalStepState>(["OPEN", "DONE", "SKIPPED"]);
const FITS = new Set<AgentGoalFit>(["HIGH", "MEDIUM", "LOW"]);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Monday of the local week containing `now`, as YYYY-MM-DD. */
export function weekStart(now: number): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseStep(value: unknown): AgentGoalStep | null {
  if (!isRecord(value) || !str(value.id) || !str(value.action) || !str(value.weekOf)) return null;
  if (!STEP_STATES.has(value.state as AgentGoalStepState)) return null;
  const step: AgentGoalStep = {
    id: value.id, contactId: optStr(value.contactId) ?? null, weekOf: value.weekOf,
    action: value.action, rationale: str(value.rationale) ? value.rationale : "", state: value.state as AgentGoalStepState,
  };
  const intent = optStr(value.draftIntent); if (intent) step.draftIntent = intent;
  return step;
}

function parsePerson(value: unknown): AgentGoalPerson | null {
  if (!isRecord(value) || !str(value.contactId) || !FITS.has(value.fit as AgentGoalFit)) return null;
  return { contactId: value.contactId, fit: value.fit as AgentGoalFit, why: str(value.why) ? value.why : "" };
}

export function parseAgentGoal(value: unknown): AgentGoal | null {
  if (!isRecord(value) || !str(value.id) || !str(value.title) || !GOAL_STATES.has(value.state as AgentGoalState)) return null;
  const list = <T,>(raw: unknown, parse: (v: unknown) => T | null): T[] =>
    Array.isArray(raw) ? raw.map(parse).filter((v): v is T => v !== null) : [];
  return {
    id: value.id, title: value.title,
    detail: optStr(value.detail) ?? null,
    targetDate: str(value.targetDate) && DATE_ONLY.test(value.targetDate) ? value.targetDate : null,
    state: value.state as AgentGoalState,
    people: list(value.people, parsePerson),
    steps: list(value.steps, parseStep),
    plannedAt: optStr(value.plannedAt) ?? null,
  };
}

export function validateGoalInput(input: AgentGoalInput): string | null {
  const title = input.title.trim();
  if (!title) return "Give your goal a short title.";
  if (title.length > GOAL_TITLE_MAX) return `Keep the title under ${GOAL_TITLE_MAX} characters.`;
  if (input.detail.trim().length > GOAL_DETAIL_MAX) return `Keep the details under ${GOAL_DETAIL_MAX} characters.`;
  if (input.targetDate && !DATE_ONLY.test(input.targetDate)) return "Pick a valid target date.";
  return null;
}

// ---- On-device planning -------------------------------------------------

const STOP_WORDS = new Set([
  "about", "after", "also", "from", "have", "into", "just", "like", "more", "next", "that", "their", "them", "then",
  "this", "want", "with", "work", "would", "year", "your", "find", "make", "some", "someone", "people", "meet",
  "learn", "move", "career", "role", "help", "good", "great", "spring", "summer", "fall", "winter", "month", "months",
]);

export function goalKeywords(goal: Pick<AgentGoal, "title" | "detail">): string[] {
  const words = `${goal.title} ${goal.detail ?? ""}`.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  return [...new Set(words.map(w => w.replace(/[.-]+$/, "")).filter(w => w.length >= 3 && !STOP_WORDS.has(w)))];
}

function matches(contact: Contact, keywords: string[]): string[] {
  const hay = `${contact.role} ${contact.org} ${contact.note}`.toLowerCase();
  return keywords.filter(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(hay));
}

/**
 * A deterministic plan: people whose role, organisation or notes share words
 * with the goal, strongest overlap first; when nobody matches, the warmest
 * relationships, since they are the likeliest to know someone who does.
 */
export function buildLocalGoalPlan(goal: AgentGoal, contacts: Contact[], weekOf: string, now: number): AgentGoal {
  const keywords = goalKeywords(goal);
  const scored = contacts
    .map(contact => ({ contact, hits: matches(contact, keywords) }))
    .filter(({ hits }) => hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || b.contact.warmth - a.contact.warmth || a.contact.id.localeCompare(b.contact.id));
  const people: AgentGoalPerson[] = scored.slice(0, 10).map(({ contact, hits }) => ({
    contactId: contact.id,
    fit: hits.length >= 2 ? "HIGH" : "MEDIUM",
    why: `${[contact.role, contact.org].filter(Boolean).join(" at ") || contact.name} overlaps with ${hits.slice(0, 3).map(h => `“${h}”`).join(", ")}.`,
  }));
  if (!people.length) {
    [...contacts].sort((a, b) => b.warmth - a.warmth || a.id.localeCompare(b.id)).slice(0, 3).forEach(contact => people.push({
      contactId: contact.id, fit: "LOW",
      why: `A warm relationship who may know someone relevant to “${goal.title}”.`,
    }));
  }
  const kept = goal.steps.filter(step => step.weekOf !== weekOf || step.state !== "OPEN");
  const byId = new Map(contacts.map(c => [c.id, c]));
  const steps: AgentGoalStep[] = people.slice(0, 3).map((person, index) => {
    const first = byId.get(person.contactId)?.name.trim().split(/\s+/)[0] ?? "them";
    const direct = person.fit !== "LOW";
    return {
      id: `local-step:${goal.id}:${weekOf}:${index}`, contactId: person.contactId, weekOf,
      action: direct ? `Ask ${first} for 20 minutes on “${goal.title}”` : `Ask ${first} who they know for “${goal.title}”`,
      rationale: person.why, state: "OPEN",
      draftIntent: direct
        ? `Ask ${first} for a short conversation about my goal: ${goal.title}`
        : `Ask ${first} whether they know anyone who could help with my goal: ${goal.title}`,
    };
  });
  if (!steps.length) {
    steps.push({
      id: `local-step:${goal.id}:${weekOf}:0`, contactId: null, weekOf, state: "OPEN",
      action: "Add three people connected to this goal", rationale: "Your agent plans from the people you've saved.",
    });
  }
  return { ...goal, people, steps: [...kept, ...steps], plannedAt: new Date(now).toISOString() };
}

// ---- On-device goal storage ----------------------------------------------

export function localGoalsKey(owner: string | null, demo: boolean): string {
  return `relapp.agent.goals.${demo ? "demo" : owner ?? "local"}`;
}

export function readLocalGoals(key: string): AgentGoal[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(parseAgentGoal).filter((g): g is AgentGoal => g !== null) : [];
  } catch { return []; }
}

export function writeLocalGoals(key: string, goals: AgentGoal[]): void {
  try { window.localStorage.setItem(key, JSON.stringify(goals)); } catch { /* storage is optional */ }
}

export function newLocalGoal(input: AgentGoalInput): AgentGoal {
  return {
    id: input.id ?? `local-goal:${crypto.randomUUID()}`, title: input.title.trim(),
    detail: input.detail.trim() || null, targetDate: input.targetDate || null,
    state: "ACTIVE", people: [], steps: [], plannedAt: null,
  };
}

/** Briefing cards for this week's open steps (at most two). */
export function goalStepCards(goals: AgentGoal[], weekOf: string) {
  return goals.filter(g => g.state === "ACTIVE").flatMap(goal => goal.steps
    .filter(step => step.weekOf === weekOf && step.state === "OPEN")
    .map(step => ({ goal, step })))
    .slice(0, 2);
}
