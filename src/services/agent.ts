import type { Contact, DyadStats, EventItem, TodayPreference } from "../types";
import { selectTodaySuggestions } from "./today";
import { getDecayRisk } from "./warmth";

// The agent's data shapes and its rule based briefing. The briefing is built
// in the browser from the same deterministic signals Today uses.

export type AgentCardKind =
  | "reconnect" | "commitment" | "career_moment" | "meeting_prep" | "draft_ready" | "insight" | "goal_step"
  | "reply_needed" | "update_contact";
export type AgentCardActionType = "draft" | "open_contact" | "mark_done" | "mark_step_done" | "prep" | "accept_update";
export type AgentDraftChannel = "EMAIL" | "IMESSAGE" | "OTHER";
export type AgentDraftState = "PROPOSED" | "APPROVED" | "SENT" | "DISCARDED";
export type AgentSignalState = "OPEN" | "DONE" | "DISMISSED";
export type AgentSignalKind =
  | "MY_COMMITMENT" | "THEIR_COMMITMENT" | "INTRO_OWED" | "INTRO_OFFERED" | "JOB_CHANGE"
  | "DEADLINE" | "BIRTHDAY" | "LIFE_EVENT" | "OPPORTUNITY" | "ASK";

export interface AgentCard {
  id: string;
  kind: AgentCardKind;
  title: string;
  body: string;
  contactId?: string;
  signalId?: string;
  dueAt?: string;
  action?: { type: AgentCardActionType; intent?: string; stepId?: string; eventId?: string };
  /** draft_ready cards carry the proposed draft itself (from standing rules). */
  draft?: AgentDraft;
  /** meeting_prep: the event to prepare for. */
  eventId?: string;
  /** update_contact: what a JOB_CHANGE signal says the contact's role/org now is. */
  proposedRole?: string;
  proposedOrg?: string;
}

export interface AgentBriefing {
  date: string;
  greeting: string;
  summary: string;
  cards: AgentCard[];
  generatedAt: string;
  modelVersion: string;
}

export interface AgentChatMessage { role: "user" | "assistant"; content: string }

export interface AgentDraft {
  id: string;
  contactId: string;
  channel: AgentDraftChannel;
  intent: string;
  subject?: string;
  body: string;
  state: AgentDraftState;
}

export interface AgentChatReply { reply: string; drafts: AgentDraft[]; cards: AgentCard[] }

export interface AgentConsent { granted: boolean; consentVersion: string | null; grantedAt: string | null; runtimeEpoch?: string }

export interface AgentSignal {
  id: string;
  contactId: string;
  kind: AgentSignalKind;
  summary: string;
  dueAt: string | null;
  confidence: number;
  state: AgentSignalState;
  createdAt: string;
}

export const LOCAL_MODEL_VERSION = "local-rules.v1";

export type AgentErrorCode =
  | "CONSENT_REQUIRED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_RATE_LIMIT" | "PROVIDER_REJECTED"
  | "INVALID_REQUEST" | "NOT_FOUND" | "OFFLINE" | "INVALID_RESPONSE" | "UNKNOWN";

const ERROR_MESSAGES: Record<AgentErrorCode, string> = {
  CONSENT_REQUIRED: "Turn on the agent in Settings to use this.",
  PROVIDER_UNAVAILABLE: "The agent isn't available right now. Try again in a little while.",
  PROVIDER_RATE_LIMIT: "The agent is busy. Give it a minute and try again.",
  PROVIDER_REJECTED: "The agent couldn't help with that request. Try rephrasing it.",
  INVALID_REQUEST: "That request couldn't be sent. Shorten it and try again.",
  NOT_FOUND: "That person or item is no longer available.",
  OFFLINE: "The agent needs a connection.",
  INVALID_RESPONSE: "The agent sent back something unexpected. Try again.",
  UNKNOWN: "Something went wrong. Try again.",
};

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  constructor(code: AgentErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "AgentError";
    this.code = code;
  }
}

export function agentErrorMessage(code: string | null | undefined): string {
  return code && code in ERROR_MESSAGES ? ERROR_MESSAGES[code as AgentErrorCode] : ERROR_MESSAGES.UNKNOWN;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export const str = (value: unknown): value is string => typeof value === "string";
export const optStr = (value: unknown): string | undefined => (str(value) && value.trim() ? value : undefined);

const CARD_KINDS = new Set<AgentCardKind>([
  "reconnect", "commitment", "career_moment", "meeting_prep", "draft_ready", "insight", "goal_step",
  "reply_needed", "update_contact",
]);
const ACTION_TYPES = new Set<AgentCardActionType>(["draft", "open_contact", "mark_done", "mark_step_done", "prep", "accept_update"]);
const CHANNELS = new Set<AgentDraftChannel>(["EMAIL", "IMESSAGE", "OTHER"]);
const DRAFT_STATES = new Set<AgentDraftState>(["PROPOSED", "APPROVED", "SENT", "DISCARDED"]);
/** Unknown kinds or malformed cards are dropped rather than rendered. */
export function parseAgentCard(value: unknown): AgentCard | null {
  if (!isRecord(value) || !str(value.id) || !str(value.title) || !str(value.body)) return null;
  if (!CARD_KINDS.has(value.kind as AgentCardKind)) return null;
  const card: AgentCard = { id: value.id, kind: value.kind as AgentCardKind, title: value.title, body: value.body };
  const contactId = optStr(value.contactId); if (contactId) card.contactId = contactId;
  const signalId = optStr(value.signalId); if (signalId) card.signalId = signalId;
  const dueAt = optStr(value.dueAt); if (dueAt && Number.isFinite(Date.parse(dueAt))) card.dueAt = dueAt;
  if (isRecord(value.action) && ACTION_TYPES.has(value.action.type as AgentCardActionType)) {
    card.action = { type: value.action.type as AgentCardActionType };
    const intent = optStr(value.action.intent); if (intent) card.action.intent = intent;
    const stepId = optStr(value.action.stepId); if (stepId) card.action.stepId = stepId;
    const actionEvent = optStr(value.action.eventId); if (actionEvent) card.action.eventId = actionEvent;
  }
  const eventId = optStr(value.eventId) ?? card.action?.eventId; if (eventId) card.eventId = eventId;
  const proposedRole = optStr(value.proposedRole); if (proposedRole) card.proposedRole = proposedRole;
  const proposedOrg = optStr(value.proposedOrg); if (proposedOrg) card.proposedOrg = proposedOrg;
  // An action missing what it acts on cannot be carried out.
  if (card.action?.type === "mark_step_done" && !card.action.stepId) delete card.action;
  if (card.action?.type === "prep" && !card.eventId) delete card.action;
  if (card.action?.type === "accept_update" && (!card.signalId || (!card.proposedRole && !card.proposedOrg))) delete card.action;
  const draft = value.draft === undefined ? null : parseAgentDraft(value.draft);
  if (draft && draft.state === "PROPOSED") card.draft = draft;
  return card;
}

export function parseAgentDraft(value: unknown): AgentDraft | null {
  if (!isRecord(value) || !str(value.id) || !str(value.contactId) || !str(value.body) || !str(value.intent)) return null;
  if (!CHANNELS.has(value.channel as AgentDraftChannel) || !DRAFT_STATES.has(value.state as AgentDraftState)) return null;
  const draft: AgentDraft = {
    id: value.id, contactId: value.contactId, channel: value.channel as AgentDraftChannel,
    intent: value.intent, body: value.body, state: value.state as AgentDraftState,
  };
  const subject = optStr(value.subject); if (subject) draft.subject = subject;
  return draft;
}


export function localDateKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


function greetingFor(now: number, name: string): string {
  const hour = new Date(now).getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(/\s+/)[0];
  return first && first !== "Demo" ? `${part}, ${first}` : part;
}

/**
 * The on-device briefing: the same deterministic picks as Today, phrased as
 * agent cards, plus one cooling-relationship insight. No model, no network.
 */
export function buildLocalBriefing(input: {
  contacts: Contact[];
  events: EventItem[];
  name: string;
  now: number;
  owner?: string | null;
  preferences?: TodayPreference[];
  dyads?: ReadonlyMap<string, Readonly<DyadStats>>;
}): AgentBriefing {
  const { contacts, events, name, now } = input;
  const suggestions = selectTodaySuggestions({
    contacts, events, now, dyads: input.dyads, preferences: input.preferences,
  });
  const cards: AgentCard[] = suggestions.map((item): AgentCard => {
    if (item.kind === "event" && item.event) {
      return {
        id: `local:${item.key}`, kind: "meeting_prep", title: item.title, body: item.reason, dueAt: item.event.startsAt,
        eventId: item.event.id, action: { type: "prep", eventId: item.event.id },
      };
    }
    const first = item.contact?.name.split(" ")[0] ?? "them";
    return {
      id: `local:${item.key}`, kind: "reconnect", title: item.title, body: item.reason,
      contactId: item.contact?.id,
      action: item.contact ? { type: "draft", intent: `A short, warm check-in with ${first}` } : undefined,
    };
  });
  const picked = new Set(cards.map(card => card.contactId).filter(Boolean));
  const cooling = contacts
    .filter(contact => !picked.has(contact.id))
    .map(contact => ({ contact, assessment: getDecayRisk(contact, now, input.dyads?.get(contact.id) as DyadStats | undefined) }))
    .filter(({ assessment }) => assessment.label === "Cooling" || assessment.label === "Going cold")
    .sort((a, b) => b.assessment.risk - a.assessment.risk || a.contact.id.localeCompare(b.contact.id));
  if (cooling.length) {
    const names = cooling.slice(0, 3).map(({ contact }) => contact.name.split(" ")[0]);
    cards.push({
      id: `local:insight:cooling:${cooling.map(c => c.contact.id).slice(0, 3).join(",")}`,
      kind: "insight",
      title: cooling.length === 1 ? `${names[0]} is drifting` : `${cooling.length} relationships are cooling`,
      body: `${names.join(", ")}${cooling.length > 3 ? " and others" : ""} ${cooling.length === 1 ? "hasn't" : "haven't"} heard from you in a while. A quick note keeps the door open.`,
      contactId: cooling[0].contact.id,
      action: { type: "open_contact" },
    });
  }
  const reconnects = cards.filter(card => card.kind === "reconnect").length;
  const prep = cards.filter(card => card.kind === "meeting_prep").length;
  const parts = [
    reconnects ? `${reconnects} ${reconnects === 1 ? "person" : "people"} worth a check-in` : "",
    prep ? `${prep} upcoming ${prep === 1 ? "event" : "events"} to prepare for` : "",
  ].filter(Boolean);
  return {
    date: localDateKey(now),
    greeting: greetingFor(now, name),
    summary: parts.length ? `Today: ${parts.join(" and ")}.` : "Nothing urgent today. Your relationships are in good shape.",
    cards,
    generatedAt: new Date(now).toISOString(),
    modelVersion: LOCAL_MODEL_VERSION,
  };
}

/** A template draft for the local fallback; always PROPOSED and never sent. */
export function buildLocalDraft(contact: Contact, intent: string, channel: AgentDraftChannel): AgentDraft {
  const first = contact.name.trim().split(/\s+/)[0] || "there";
  const met = contact.met.trim();
  const body = channel === "IMESSAGE"
    ? `Hey ${first}! Was thinking about you. How have things been?`
    : `Hi ${first},\n\n${met ? `It's been a while since ${met}. ` : "It's been a while. "}I'd love to catch up and hear what you're working on. Do you have time for a quick call in the next couple of weeks?\n\nBest,`;
  return {
    id: `local-draft:${contact.id}:${Date.now()}`, contactId: contact.id, channel, intent,
    subject: channel === "EMAIL" ? "Catching up" : undefined, body, state: "PROPOSED",
  };
}

/** `sms:` handoff with a prefilled body; the user picks the conversation in Messages. */
export function messagesHandoff(body: string): string {
  return `sms:&body=${encodeURIComponent(body)}`;
}
