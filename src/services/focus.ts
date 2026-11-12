import type { Contact } from "../types";
import { daysSince } from "../lib/dates";

// MODEL: the focus score answers "who should I pay attention to right now?" by
// blending several signals (decay risk, contact value, recency, event importance,
// fresh triggers). This mock blends warmth with a small recency boost, computed
// only from the contact itself. Swap in the real blended engine here; keep the
// weights as named constants so tuning stays in one place.
const WARMTH_WEIGHT = 0.85;
const RECENT_DAYS = 14;
const RECENCY_BOOST = 8;

export function getFocusScore(c: Contact): number {
  const recencyBoost = daysSince(c.lastInteractionAt) <= RECENT_DAYS ? RECENCY_BOOST : 0;
  const score = Math.round(c.warmth * WARMTH_WEIGHT + recencyBoost);
  return Math.max(0, Math.min(100, score));
}
