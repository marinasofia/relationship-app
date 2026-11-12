// Time helpers. Everything on screen derives its human date label from an ISO
// timestamp, nothing displays hardcoded-fake time.

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(t: number | Date): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days from `iso` to now (0 = today). */
export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS);
}

/** "Today", "Yesterday", or "Jun 12". */
export function formatDay(iso: string, now: number = Date.now()): string {
  const days = daysSince(iso, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Today, 6:30 PM" / "Tomorrow, 9:00 AM" / "Fri, 9:00 AM" / "Jul 12, 6:30 PM". */
export function formatWhen(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = -daysSince(iso, now);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days > 1 && days < 7) {
    return `${d.toLocaleDateString("en-US", { weekday: "short" })}, ${time}`;
  }
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

export function isLiveNow(startsAt: string, endsAt: string, now: number = Date.now()): boolean {
  return now >= Date.parse(startsAt) && now <= Date.parse(endsAt);
}

/** "now" / "in 25 min" / "in 3h" / "tomorrow" / "in 5 days", how far off an event is. */
export function untilLabel(iso: string, now: number = Date.now()): string {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return "now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours <= 12) return `in ${hours}h`;
  const days = -daysSince(iso, now);
  if (days <= 1) return "tomorrow";
  return `in ${days} days`;
}

/** "just now" / "5 min ago" / "3h ago" / "yesterday" / "6 days ago" / "Sep 1":
 * how long since something last happened. Used for sync freshness, where
 * a stale value has to read as stale. */
export function agoLabel(iso: string, now: number = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  if (ms < 90_000) return "just now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = daysSince(iso, now);
  if (days <= 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Seed helpers: offsets from now so the demo data always feels current.

export function daysAgoIso(days: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function minutesFromNowIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

/** Next occurrence of a weekday (0 = Sunday … 6 = Saturday) at the given hour. */
export function nextWeekdayIso(weekday: number, hour: number): string {
  const d = new Date();
  const ahead = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + ahead);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
