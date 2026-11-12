import type { Contact, DyadStats, WarmthLabel } from "../types";

// The one signature cue. A warmth score (0 to 100) maps to a gradient + label,
// consistent on every screen. Thresholds/colors are the design source of truth.
export interface WarmthCue {
  /** gradient start */
  c: string;
  /** gradient end */
  c2: string;
  label: WarmthLabel;
}

export function warmthOf(w: number): WarmthCue {
  if (w >= 70) return { c: "#E0864A", c2: "#F0B36A", label: "Warm" };
  if (w >= 45) return { c: "#D2A24E", c2: "#E7CB86", label: "Steady" };
  if (w >= 25) return { c: "#5E9A8E", c2: "#8FBEB4", label: "Cooling" };
  return { c: "#6F8AA8", c2: "#9FB4CB", label: "Going cold" };
}

// How much a sent follow-up restores warmth: a modest fixed bump.
export const FOLLOWUP_WARMTH_BUMP = 6;

// The cadence registry: per-contact rhythm stats, consulted when a caller
// passes no explicit stats. Call
// sites keep their bare getDecayRisk(c) shape; an explicit dyad argument
// always wins; tests reset with clearDyadStats(). Empty registry means
// cold-start, which falls back to the warmth heuristic below.
const dyadRegistry = new Map<string, DyadStats>();

export function setDyadStats(stats: Map<string, DyadStats>): void {
  dyadRegistry.clear();
  for (const [contactId, dyad] of stats) dyadRegistry.set(contactId, dyad);
}

export function clearDyadStats(): void {
  dyadRegistry.clear();
}

/** Read the registered rhythm stats for one contact. */
export function getRegisteredCadence(contactId: string): Readonly<DyadStats> | undefined {
  return dyadRegistry.get(contactId);
}

const DAY_MS = 86_400_000;

export interface DecayAssessment {
  /** Layout/order cue; may be a heuristic. Never present this as a probability. */
  risk: number;
  label: WarmthLabel;
  source: "model" | "legacy_score" | "cadence_estimate" | "warmth_only" | "insufficient_history";
  /** Only an explicitly model-scored, valid result can populate model summaries. */
  modelScore: number | null;
}

export function meanModelScore(scores: readonly (number | null)[]): number | null {
  const measured = scores.filter((score): score is number => score !== null && Number.isFinite(score) && score >= 0 && score <= 100);
  return measured.length ? Math.round(measured.reduce((sum, score) => sum + score, 0) / measured.length) : null;
}

export function decayScoreLabel(assessment: DecayAssessment): string {
  if (assessment.modelScore !== null) return `${assessment.modelScore}/100`;
  if (assessment.source === "insufficient_history") return "Not enough history";
  if (assessment.source === "cadence_estimate") return "Cadence estimate";
  return "Not scored";
}

// Model scores and heuristic layout cues share this compatibility seam.
// A model score is not a calibrated outcome probability. With cadence present,
// the fallback is a rhythm-relative estimate. Guardrails: nothing alarms
// before 45 days of silence, and nothing alarms while the silence is within
// the relationship's own rhythm. A recent sentiment dip nudges risk up
// modestly; it never creates an alarm on its own.
//
// The contract:
// - `now` is the clock: silence is read from it, never from Date.now()
//   internally (keeps it pure and testable given the same registry state).
// - `dyad` is the per-relationship baseline; omitted, the session registry
//   supplies it; absent entirely means cold-start (warmth inverse).
// - `risk` stays 0 to 100; `label` must agree with the model's own predicted
//   warmth: label === warmthOf(100 - risk).label. warmthOf never changes.
export function getDecayRisk(
  c: Contact,
  now: number = Date.now(),
  dyad?: DyadStats,
): DecayAssessment {
  const d = dyad ?? dyadRegistry.get(c.id);

  // Explicit model abstention overrides even a stale numeric value. Keep the
  // stored warmth cue for layout, but do not invent a cadence prediction.
  if (d?.decayConfidence === "insufficient_history") {
    const risk = Math.max(0, Math.min(100, 100 - c.warmth));
    return { risk, label: warmthOf(100 - risk).label, source: "insufficient_history", modelScore: null };
  }

  // Stored values retain legacy layout compatibility. Only an explicit
  // model_scored status with an in-range value may enter model summaries.
  // Clamped and rounded so a mis-scaled artifact can never break the
  // 0-100 contract or the label law.
  if (d && d.risk !== null && d.risk !== undefined && Number.isFinite(d.risk)) {
    const risk = Math.round(Math.max(0, Math.min(100, d.risk)));
    const model = d.decayConfidence === "model_scored" && d.risk >= 0 && d.risk <= 100;
    return { risk, label: warmthOf(100 - risk).label, source: model ? "model" : "legacy_score", modelScore: model ? risk : null };
  }

  if (!d || d.medianGapDays === null || !Number.isFinite(d.medianGapDays) || d.medianGapDays <= 0 || !d.lastInteractionAt || !Number.isFinite(Date.parse(d.lastInteractionAt))) {
    // Cold-start: no real cadence for this relationship yet.
    const risk = Math.max(0, Math.min(100, 100 - c.warmth));
    return { risk, label: warmthOf(100 - risk).label, source: "warmth_only", modelScore: null };
  }

  const silenceDays = Math.max(0, (now - Date.parse(d.lastInteractionAt)) / DAY_MS);
  const gap = Math.max(1, d.medianGapDays);
  const alarmWindow = Math.max(3 * gap, 45);

  let risk: number;
  if (silenceDays <= gap) {
    // Within this dyad's own rhythm: quiet is normal here.
    risk = 8;
  } else {
    risk = Math.min(100, 15 + 70 * (silenceDays / alarmWindow));
  }
  // Guardrail: before 45 days of silence the label may cool but never alarm
  // (risk stays below the Cooling band's floor).
  if (silenceDays < 45) risk = Math.min(risk, 54);

  // Sentiment nudge: a recent tone clearly below the relationship's own
  // baseline adds urgency, bounded so it cannot alarm alone.
  if (
    d.sentRecentMean !== null && d.sentRecentMean !== undefined &&
    d.sentMean !== null && d.sentMean !== undefined &&
    d.sentRecentMean < d.sentMean - 0.15
  ) {
    risk = Math.min(silenceDays < 45 ? 54 : 100, risk + 8);
  }

  risk = Math.round(Math.max(0, Math.min(100, risk)));
  return { risk, label: warmthOf(100 - risk).label, source: "cadence_estimate", modelScore: null };
}
