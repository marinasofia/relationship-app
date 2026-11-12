// Shared types. UI-facing shapes only; scoring lives in src/services.

export type WarmthLabel = "Warm" | "Steady" | "Cooling" | "Going cold";

export type SocialType = "linkedin" | "x" | "instagram" | "site";

export interface Social {
  type: SocialType;
  handle: string;
}

/** One touchpoint with a contact; the history timeline renders these oldest-first. */
export interface Interaction {
  id: string;
  kind: "met" | "note" | "followup" | "capture";
  /** ISO timestamp */
  at: string;
  summary: string;
}

/** Who someone is to the user. The app guesses ("auto"); the user's own
 * choice ("user") is never overwritten by a guess. */
export type Circle = "family" | "friend" | "professional" | "acquaintance";

export interface Contact {
  id: string;
  name: string;
  role: string;
  org: string;
  /** Optional email; enables "Open in Mail" on the draft sheet */
  email?: string | null;
  /** Event or place where you met */
  met: string;
  /** 0 to 100 warmth score */
  warmth: number;
  note: string;
  socials: Social[];
  /** Initials for the avatar */
  init: string;
  /** ISO timestamp of the most recent interaction; display labels derive from this */
  lastInteractionAt: string;
  /** Touchpoints, oldest first */
  interactions: Interaction[];
  /** Unknown until the app can guess or the user says */
  circle?: Circle | null;
  circleSource?: "auto" | "user" | null;
}

export interface EventItem {
  id: string;
  name: string;
  /** ISO timestamps; upcoming/live/past are derived from these, never stored */
  startsAt: string;
  endsAt: string;
  where: string;
  known: number;
  goal: string;
  talkingPoints: string[];
}

export interface PastEvent {
  id: string;
  name: string;
  /** ISO timestamp */
  at: string;
  met: number;
  followed: number;
}

/**
 * Per-relationship cadence aggregates: how often two people talk and when
 * they last did. Aggregates only, never message content.
 */
export interface DyadStats {
  medianGapDays: number | null;
  gapIqr: number | null;
  lastInteractionAt: string | null;
  msgCount: number;
  initiationRatio: number | null;
  /** Blended sentiment for this relationship, weighted by message count.
   * Optional; scores only, never text. */
  sentMean?: number | null;
  sentRecentMean?: number | null;
  /** Stored model risk (0-100). When present, getDecayRisk uses it. */
  risk?: number | null;
  /** Cadence model state. `insufficient_history` is an explicit abstention,
   * not a zero-risk prediction. */
  decayConfidence?: "insufficient_history" | "model_scored" | null;
  relationshipStage?: "establishing" | "established" | null;
  contactDaysObserved?: number | null;
}

/** Which sample sources the demo treats as connected. */
export interface Connections {
  google: boolean;
  outlook: boolean;
  linkedin: boolean;
  slack: boolean;
  imessage: boolean;
}

export interface Settings {
  name: string;
  onboarded: boolean;
  /** smart-timed nudges during live events */
  nudges: boolean;
  connections: Connections;
  /** User choices for Today, persisted with the existing account settings. */
  today?: TodayPreference[];
}

export interface TodayPreference {
  key: string;
  action: "snoozed" | "dismissed";
  recordedAt: number;
  expiresAt: number;
}

export type CaptureKind = "photo" | "card" | "voice" | "note";

export interface CaptureInput {
  kind: CaptureKind;
  /** Optional raw text/handle the user provided at capture time */
  raw?: string;
  /** How many people were already captured this event (dedupe/cycling cursor) */
  sequence?: number;
}

/** A person captured live during an event, before enrichment into a full Contact. */
export interface CapturedPerson {
  name: string;
  kind: CaptureKind;
  init: string;
  /** What the user typed at capture time; becomes the contact's note on save */
  note?: string;
}
