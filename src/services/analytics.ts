import type { Contact, Interaction, PastEvent, WarmthLabel } from "../types";
import { getDecayRisk, warmthOf } from "./warmth";
import { getFocusScore } from "./focus";
import { daysSince } from "../lib/dates";
import { metAtOf } from "../lib/contacts";

// The analytics seam: everything the desktop dashboard shows, deterministic
// from state. The UI only maps these numbers to pixels, no intelligence
// inline.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export const TRAJECTORY_WEEKS = 12;

export interface NetworkHealth {
  /** contacts per warmth band, via the canonical labels */
  bands: Record<WarmthLabel, number>;
  /** share of contacts with at least one follow-up, 0 to 1 */
  followUpRate: number;
  /** contacts currently Cooling or Going cold */
  cooling: number;
  /** contacts whose latest follow-up broke a silence > 2× their usual gap */
  reconnected: number;
  /** 12 weekly average-warmth points, oldest first, 0 to 100 */
  trajectory: number[];
  /** average warmth now minus four weeks ago (positive = warming) */
  delta: number;
}

export interface EventRoi {
  id: string;
  name: string;
  met: number;
  followed: number;
  /** followed / met, 0 to 1 */
  followRate: number;
  /** contacts from this event whose label is Warm right now */
  warmNow: number;
}

export interface ContactRhythm {
  /** days between consecutive interactions, oldest gap first */
  gaps: number[];
  /** median of gaps, or null with fewer than two touchpoints */
  medianGap: number | null;
  /** days since the last interaction */
  silenceDays: number;
  /** current silence vs their usual gap (the gap ratio), or null without a baseline */
  ratio: number | null;
}

export interface FocusEntry {
  contact: Contact;
  /** blended 0 to 100 from the focus seam */
  score: number;
  /** plain-language reason chip */
  reason: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp100 = (n: number) => Math.max(0, Math.min(100, n));

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type Touch = { at: number; kind: Interaction["kind"] };

/** Interactions parsed and sorted oldest first. */
function timelineOf(c: Contact): Touch[] {
  return c.interactions
    .map((ix) => ({ at: Date.parse(ix.at), kind: ix.kind }))
    .sort((a, b) => a.at - b.at);
}

/** Days between consecutive interactions, oldest first. */
function gapsOf(times: Touch[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push(round1((times[i].at - times[i - 1].at) / DAY_MS));
  }
  return gaps;
}

/** Did this contact's latest follow-up break a silence > 2× their usual gap? */
function wasReconnected(c: Contact): boolean {
  const times = timelineOf(c);
  const med = median(gapsOf(times));
  if (med === null || med <= 0) return false;
  // a follow-up can't reconnect if nothing came before it
  for (let i = times.length - 1; i >= 1; i--) {
    if (times[i].kind === "followup") {
      return (times[i].at - times[i - 1].at) / DAY_MS > 2 * med;
    }
  }
  return false;
}

/**
 * A contact's reconstructed warmth at time t: start at 60 when met, +8 per
 * later interaction, −1.5 per idle week, clamped 0 to 100.
 * MODEL: the real trajectory comes from the decay model, not this heuristic.
 */
function warmthAt(c: Contact, t: number): number | null {
  const metAt = Date.parse(metAtOf(c));
  if (Number.isNaN(metAt) || metAt > t) return null; // not met yet
  let touches = 0;
  let lastAt = metAt;
  for (const ix of c.interactions) {
    const at = Date.parse(ix.at);
    if (at > t) continue;
    if (at > metAt) touches += 1;
    if (at > lastAt) lastAt = at;
  }
  const idleWeeks = Math.max(0, (t - lastAt) / WEEK_MS);
  return clamp100(60 + 8 * touches - 1.5 * idleWeeks);
}

export function getNetworkHealth(contacts: Contact[], now: number = Date.now()): NetworkHealth {
  const bands: Record<WarmthLabel, number> = {
    Warm: 0,
    Steady: 0,
    Cooling: 0,
    "Going cold": 0,
  };
  let followedUp = 0;
  let reconnected = 0;
  for (const c of contacts) {
    bands[getDecayRisk(c).label] += 1;
    if (c.interactions.some((ix) => ix.kind === "followup")) followedUp += 1;
    if (wasReconnected(c)) reconnected += 1;
  }

  const trajectory: number[] = [];
  for (let week = 0; week < TRAJECTORY_WEEKS; week++) {
    const t = now - (TRAJECTORY_WEEKS - 1 - week) * WEEK_MS;
    const values = contacts
      .map((c) => warmthAt(c, t))
      .filter((v): v is number => v !== null);
    trajectory.push(
      values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : 0,
    );
  }

  // "vs a month ago" = four trajectory weeks back; the UI renders this verbatim.
  const MONTH_WEEKS = 4;
  const delta = round1(
    (trajectory[TRAJECTORY_WEEKS - 1] ?? 0) - (trajectory[TRAJECTORY_WEEKS - 1 - MONTH_WEEKS] ?? 0),
  );

  return {
    bands,
    followUpRate: contacts.length ? round2(followedUp / contacts.length) : 0,
    cooling: bands.Cooling + bands["Going cold"],
    reconnected,
    trajectory,
    delta,
  };
}

export function getEventRoi(past: PastEvent[], contacts: Contact[]): EventRoi[] {
  return past.map((e) => {
    const name = e.name.trim().toLowerCase();
    const warmNow = contacts.filter(
      (c) => c.met.trim().toLowerCase() === name && warmthOf(c.warmth).label === "Warm",
    ).length;
    return {
      id: e.id,
      name: e.name,
      met: e.met,
      followed: e.followed,
      followRate: e.met > 0 ? round2(e.followed / e.met) : 0,
      warmNow,
    };
  });
}

// A median-gap heuristic for each contact's usual rhythm.
export function getContactRhythm(c: Contact, now: number = Date.now()): ContactRhythm {
  const gaps = gapsOf(timelineOf(c));
  const medianGap = median(gaps);
  const silenceDays = Math.max(0, daysSince(c.lastInteractionAt, now));
  const ratio = medianGap !== null && medianGap > 0 ? round1(silenceDays / medianGap) : null;
  return { gaps, medianGap, silenceDays, ratio };
}

/** How recently "met this week" reaches back. */
const MET_RECENTLY_DAYS = 7;

// MODEL: reason chips will come from the blended focus engine's top feature;
// until then they're derived from the decay label, recency, and history.
export function focusReason(c: Contact, now: number = Date.now()): string {
  const label = getDecayRisk(c).label;
  if (label === "Going cold") return "going cold";
  if (daysSince(metAtOf(c), now) <= MET_RECENTLY_DAYS) return "met this week";
  if (!c.interactions.some((ix) => ix.kind === "followup")) return "no follow-up yet";
  if (label === "Cooling") return "cooling off";
  return "keep it warm";
}

export function getFocusQueue(contacts: Contact[], n = 5): FocusEntry[] {
  return contacts
    .map((contact) => ({
      contact,
      score: getFocusScore(contact),
      reason: focusReason(contact),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export interface CompanyStat {
  org: string;
  /** contacts at this company */
  count: number;
  /** count / contacts with a known company, 0 to 1 */
  share: number;
  /** contacts at this company whose label is Warm right now */
  warmCount: number;
}

/**
 * Where the network actually works: top companies by headcount, warm counts
 * alongside. Contacts with no org are skipped and excluded from the share base.
 */
export function getTopCompanies(contacts: Contact[], n = 8): CompanyStat[] {
  const byOrg = new Map<string, { count: number; warmCount: number }>();
  let total = 0;
  for (const c of contacts) {
    const org = c.org.trim();
    if (!org) continue;
    total += 1;
    const entry = byOrg.get(org) ?? { count: 0, warmCount: 0 };
    entry.count += 1;
    if (warmthOf(c.warmth).label === "Warm") entry.warmCount += 1;
    byOrg.set(org, entry);
  }
  return [...byOrg.entries()]
    .map(([org, e]) => ({
      org,
      count: e.count,
      share: total ? round2(e.count / total) : 0,
      warmCount: e.warmCount,
    }))
    .sort((a, b) => b.count - a.count || a.org.localeCompare(b.org))
    .slice(0, n);
}

export interface Momentum {
  /** "met" touchpoints in the trailing 30 days */
  met30: number;
  /** "met" touchpoints in the 30 days before that */
  met30Prev: number;
  /** follow-ups sent in the trailing 30 days */
  followups30: number;
  /** follow-ups sent in the 30 days before that */
  followups30Prev: number;
  /** estimated replies to the trailing window's follow-ups */
  replies30: number;
  /** estimated replies to the previous window's follow-ups */
  replies30Prev: number;
}

const MOMENTUM_WINDOW_DAYS = 30;

// MODEL: replies are estimated at a flat 44% of outreach until the real engine
// tracks actual responses.
const REPLY_RATE = 0.44;

/**
 * Activity in the trailing 30 days vs the 30 before, from interaction
 * timestamps. Windows are (now−30d, now] and (now−60d, now−30d]; the future
 * and anything older than 60 days are ignored.
 */
export function getMomentum(contacts: Contact[], now: number = Date.now()): Momentum {
  const d30 = now - MOMENTUM_WINDOW_DAYS * DAY_MS;
  const d60 = now - 2 * MOMENTUM_WINDOW_DAYS * DAY_MS;
  let met30 = 0;
  let met30Prev = 0;
  let followups30 = 0;
  let followups30Prev = 0;
  for (const c of contacts) {
    for (const ix of c.interactions) {
      const at = Date.parse(ix.at);
      if (Number.isNaN(at) || at > now || at <= d60) continue;
      const current = at > d30;
      if (ix.kind === "met") {
        if (current) met30 += 1;
        else met30Prev += 1;
      } else if (ix.kind === "followup") {
        if (current) followups30 += 1;
        else followups30Prev += 1;
      }
    }
  }
  return {
    met30,
    met30Prev,
    followups30,
    followups30Prev,
    replies30: Math.round(followups30 * REPLY_RATE),
    replies30Prev: Math.round(followups30Prev * REPLY_RATE),
  };
}
