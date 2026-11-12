import type { Contact } from "../types";

/** Reviewed templates, not a trained predictor or an automatic sender. */
export const OUTREACH_GOALS = {
  coffee: "Coffee chat",
  internship: "Internship advice",
  interview: "Interview preparation",
  reconnect: "Reconnect",
} as const;
export type OutreachGoal = keyof typeof OUTREACH_GOALS;

const ASKS: Record<OutreachGoal, string> = {
  coffee: "Would you be open to a 20-minute coffee chat to hear about your experience?",
  internship: "I'm exploring internships and would value your perspective. Would you be open to a short conversation about getting started in your field?",
  interview: "I'd appreciate your perspective on preparing for interviews in your field. Would you be open to a short conversation?",
  reconnect: "I'd love to catch up and hear how things are going. Would a short conversation work for you?",
};
const OPENERS = ["Hi", "Hey", "Hello"];

export function outreachSubject(goal: OutreachGoal): string {
  return OUTREACH_GOALS[goal];
}

// Backwards-compatible async seam. Notes are not evidence of an offer, who
// made it, or whether it is still open. Never turn keyword matches into claims.
export async function draftFollowup(
  c: Contact,
  variant = 0,
  goal: OutreachGoal = "coffee",
): Promise<string> {
  const first = c.name.trim().split(/\s+/)[0] || "there";
  const index = Number.isFinite(variant) ? ((Math.trunc(variant) % OPENERS.length) + OPENERS.length) % OPENERS.length : 0;
  const met = c.met.trim();
  const hasMeeting = met && c.interactions.some((interaction) => interaction.kind === "met");
  const connection = hasMeeting ? `It was nice meeting you at ${met}. ` : "";
  return `${OPENERS[index]} ${first}, ${connection}${ASKS[goal]}`;
}

/** Single-recipient mail handoff. Reject header injection and address lists. */
export function draftMailto(email: string | null | undefined, subject: string, body: string): string | null {
  const address = email?.trim();
  if (!address || !/^[^\s@,;?&#%<>]+@[^\s@,;?&#%<>]+\.[^\s@,;?&#%<>]+$/.test(address)) return null;
  return `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
