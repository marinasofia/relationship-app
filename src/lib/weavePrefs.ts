// Weave dismissals, persisted on-device.
//
// A hidden suggestion is a device-local preference. Every storage call is
// wrapped in try/catch so private mode quietly degrades to session-only
// dismissal.

export const WEAVE_PREFS_KEY = "relapp:weave";

/** Any dismissal or completed weave quiets the whole surface for this long. */
const SNOOZE_DAYS = 3;
/** A season later the thread may genuinely be worth re-raising. */
const HIDDEN_DAYS = 90;
const MAX_HIDDEN = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

interface HiddenEntry {
  id: string;
  /** ISO timestamp of the dismissal; entries expire after HIDDEN_DAYS. */
  at: string;
}

export interface WeavePrefs {
  hidden: HiddenEntry[];
  snoozedUntil: string | null;
}

/** Only trust entries that can actually gate a card. */
function looksLikeEntry(value: unknown): value is HiddenEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as HiddenEntry;
  return typeof e.id === "string" && typeof e.at === "string";
}

export function loadWeavePrefs(now: number = Date.now()): WeavePrefs {
  try {
    const raw = localStorage.getItem(WEAVE_PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return { hidden: [], snoozedUntil: null };
    const p = parsed as WeavePrefs;
    const hidden = Array.isArray(p.hidden)
      ? p.hidden.filter(looksLikeEntry).filter((e) => now - Date.parse(e.at) < HIDDEN_DAYS * DAY_MS)
      : [];
    const snoozedUntil = typeof p.snoozedUntil === "string" ? p.snoozedUntil : null;
    return { hidden, snoozedUntil };
  } catch {
    return { hidden: [], snoozedUntil: null };
  }
}

function save(prefs: WeavePrefs): void {
  try {
    localStorage.setItem(WEAVE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage may be unavailable (private mode); the card's own state still hides it
  }
}

/** Hide one weave and quiet the surface for a few days. */
export function hideWeave(id: string, now: number = Date.now()): void {
  const prefs = loadWeavePrefs(now);
  const hidden = [
    ...prefs.hidden.filter((e) => e.id !== id),
    { id, at: new Date(now).toISOString() },
  ].slice(-MAX_HIDDEN);
  save({ hidden, snoozedUntil: new Date(now + SNOOZE_DAYS * DAY_MS).toISOString() });
}

export function isHidden(id: string, now: number = Date.now()): boolean {
  return loadWeavePrefs(now).hidden.some((e) => e.id === id);
}

/** True while the whole surface is resting after a dismissal or a sent weave. */
export function isSnoozed(now: number = Date.now()): boolean {
  const until = loadWeavePrefs(now).snoozedUntil;
  return until !== null && now < Date.parse(until);
}

export function clearWeavePrefs(): void {
  try {
    localStorage.removeItem(WEAVE_PREFS_KEY);
  } catch {
    // ignore
  }
}
