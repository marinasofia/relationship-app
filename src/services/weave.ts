import type { Contact } from "../types";
import { warmthOf } from "./warmth";

// Weave: the correlations *between* your people, spotted in what you yourself
// wrote, notes, touchpoint summaries, roles. Three friends circling the same
// thread become one invitation; a stated need meets the person who fills it.
// Nothing here ever reads message content; the source is only what the user
// typed into the app.
//
// Two kinds ship today. The third, a reunion for an event cohort going cold
// together, belongs to the Events workspace's follow-up sweep, so it stays
// out of Weave until that stops being true.

export type WeaveKind = "gather" | "intro";

export interface Weave {
  /**
   * Stable across sessions, "gather:<topicId>" | "intro:<seekerId>:<providerId>".
   * Dismissals key off this, so warmth drift can never resurrect a hidden weave.
   */
  id: string;
  kind: WeaveKind;
  /** Topic or need id from the dictionaries. */
  topic: string;
  /** The shared thread, mid-sentence: "training for the NYC Half". */
  thread: string;
  /** Full sentence with first names, ready to render. */
  headline: string;
  /** One-line why-now. */
  prompt: string;
  /** gather: 3 to 4 people, warmest first · intro: exactly [seeker, provider]. */
  people: Contact[];
  /** 0 to 100; the list arrives sorted score desc, ties by id. */
  score: number;
}

/** The card only surfaces a weave at or above this score. */
export const WEAVE_SURFACE_MIN = 55;

interface TopicDef {
  id: string;
  /** Matched against lowercased note + interaction summaries. */
  patterns: string[];
  /** Completes "X, Y and Z are all …". */
  thread: string;
  /** The concrete plan the draft proposes. */
  invite: string;
}

// Deliberately narrow: a missed weave costs nothing, a false one costs trust.
const TOPICS: TopicDef[] = [
  {
    id: "running",
    patterns: ["nyc half", "training for", "marathon"],
    thread: "training for the NYC Half",
    invite: "an easy run and coffee after",
  },
  {
    id: "knicks",
    patterns: ["knicks", "playoffs"],
    thread: "deep into the Knicks",
    invite: "watching a game together",
  },
  {
    id: "dinners",
    patterns: ["dinner series", "co-host a dinner", "supper"],
    thread: "into hosting dinners",
    invite: "a dinner",
  },
  {
    id: "climate",
    patterns: ["climate"],
    thread: "working on climate projects",
    invite: "coffee",
  },
  {
    id: "new-nyc",
    patterns: ["just moved from", "knows nobody yet", "new to the city"],
    thread: "new to New York",
    invite: "drinks",
  },
  {
    id: "fintech",
    patterns: ["fintech"],
    thread: "deep in fintech",
    invite: "drinks",
  },
];

interface NeedDef {
  id: string;
  /** The seeker's stated need, in their note. */
  patterns: string[];
  /** Whether a lowercased role can fill it. */
  provides: (role: string) => boolean;
  /** "a designer", completes "is looking for …". */
  needThing: string;
}

const NEEDS: NeedDef[] = [
  {
    id: "designer",
    patterns: ["intro to a designer"],
    provides: (r) => r.includes("design"),
    needThing: "a designer",
  },
  {
    id: "platform",
    patterns: ["hiring for platform"],
    provides: (r) => r.includes("platform") || r.includes("eng manager"),
    needThing: "platform engineers",
  },
];

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** Everything the user wrote about this person, lowercased for matching. */
function textOf(c: Contact): string {
  return [c.note, ...c.interactions.map((ix) => ix.summary)].join(" ").toLowerCase();
}

function firstNameOf(c: Contact): string {
  return c.name.split(" ")[0];
}

function isCooling(c: Contact): boolean {
  const label = warmthOf(c.warmth).label;
  return label === "Cooling" || label === "Going cold";
}

/** Warmth desc, ties broken by id so shuffled input yields identical weaves. */
function byWarmth(a: Contact, b: Contact): number {
  return b.warmth - a.warmth || a.id.localeCompare(b.id);
}

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function listNames(people: Contact[]): string {
  const names = people.map(firstNameOf);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const SIZE_WORDS: Record<number, string> = { 2: "two", 3: "three", 4: "four" };

function gatherWeave(topic: TopicDef, contacts: Contact[], now: number): Weave | null {
  const pool = contacts.filter((c) => topic.patterns.some((p) => textOf(c).includes(p)));
  if (pool.length < 3) return null;
  pool.sort(byWarmth);

  // Two warm anchors carry the invite; the third seat goes to whoever is
  // cooling, a weave is the cheapest way back in, then fill warmest-first to 4.
  const members = pool.slice(0, 2);
  const rest = pool.slice(2);
  const cooling = rest.find(isCooling);
  if (cooling) members.push(cooling);
  for (const c of rest) {
    if (members.length >= 4) break;
    if (!members.includes(c)) members.push(c);
  }
  members.sort(byWarmth);

  const avgWarmth = members.reduce((sum, c) => sum + c.warmth, 0) / members.length;
  const recent = members.some((c) => now - Date.parse(c.lastInteractionAt) <= THIRTY_DAYS);
  const score = clampScore(
    0.45 * avgWarmth +
      (members[0].warmth >= 70 ? 20 : 0) +
      (members.some(isCooling) ? 20 : 0) +
      (members.length >= 3 ? 10 : 0) +
      (recent ? 8 : 0),
  );

  return {
    id: `gather:${topic.id}`,
    kind: "gather",
    topic: topic.id,
    thread: topic.thread,
    headline: `${listNames(members)} are all ${topic.thread}.`,
    prompt: `One invite could warm all ${SIZE_WORDS[members.length]} at once.`,
    people: members,
    score,
  };
}

function introWeaves(need: NeedDef, contacts: Contact[]): Weave[] {
  const seekers = contacts.filter((c) =>
    need.patterns.some((p) => textOf(c).includes(p)),
  );
  const weaves: Weave[] = [];
  for (const seeker of seekers.slice().sort(byWarmth)) {
    const provider = contacts
      .filter(
        (c) =>
          c.id !== seeker.id &&
          need.provides(c.role.toLowerCase()) &&
          // Their own org already has these people two desks away.
          (!seeker.org || c.org !== seeker.org),
      )
      .sort(byWarmth)[0];
    if (!provider) continue;

    const providerCue = warmthOf(provider.warmth).label;
    const score = clampScore(
      0.35 * seeker.warmth +
        0.45 * provider.warmth +
        // Asking a going-cold contact for a favor is how intros curdle.
        (providerCue === "Warm" || providerCue === "Steady" ? 10 : -15),
    );

    weaves.push({
      id: `intro:${seeker.id}:${provider.id}`,
      kind: "intro",
      topic: need.id,
      thread: `an intro for ${firstNameOf(seeker)}`,
      headline: `${firstNameOf(seeker)} is looking for ${need.needThing}, and you know ${firstNameOf(provider)}.`,
      prompt: `Ask ${firstNameOf(provider)} first; a welcome intro strengthens both threads.`,
      people: [seeker, provider],
      score,
    });
  }
  return weaves;
}

// MODEL: semantic clustering over user-authored text replaces these
// dictionaries, same contract (async, ranked Weave[], stable ids), so the
// swap never touches a screen. The mock resolves instantly and
// deterministically; `now` is the clock so tests can pin it.
export async function getWeaves(
  contacts: Contact[],
  now: number = Date.now(),
): Promise<Weave[]> {
  const weaves: Weave[] = [];
  for (const topic of TOPICS) {
    const w = gatherWeave(topic, contacts, now);
    if (w) weaves.push(w);
  }
  for (const need of NEEDS) {
    weaves.push(...introWeaves(need, contacts));
  }
  return weaves.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

const OPENERS = ["Hey", "Hi", "Hello"];
const GATHER_CLOSERS = [
  "Up for {invite}?",
  "Keen on {invite} sometime soon?",
  "Should I find us a date for {invite}?",
];
const INTRO_CLOSERS = [
  "Open to an intro?",
  "Would an intro be welcome?",
  "Happy to connect you two if so.",
];

// MODEL: tone-matched group/intro drafting swaps in here (same contract as
// draftFollowup). Regenerate cycles deterministic variants.
export async function draftWeaveMessage(w: Weave, variant = 0): Promise<string> {
  const opener = OPENERS[variant % OPENERS.length];
  if (w.kind === "intro") {
    const [seeker, provider] = w.people;
    const need = NEEDS.find((n) => n.id === w.topic);
    const thing = need ? need.needThing : "someone like you";
    const who = seeker.org
      ? `${firstNameOf(seeker)} (${seeker.role.toLowerCase()} at ${seeker.org})`
      : firstNameOf(seeker);
    const closer = INTRO_CLOSERS[variant % INTRO_CLOSERS.length];
    return `${opener} ${firstNameOf(provider)}, ${who} is looking for ${thing}, and you were the first person I thought of. ${closer}`;
  }
  const topic = TOPICS.find((t) => t.id === w.topic);
  const invite = topic ? topic.invite : "getting together";
  const closer = GATHER_CLOSERS[variant % GATHER_CLOSERS.length].replace("{invite}", invite);
  const names = w.people.map(firstNameOf);
  return `${opener} ${names.join(", ")}, you've each mentioned ${w.thread}, and I keep thinking you ${SIZE_WORDS[names.length] ?? "all"} should meet. ${closer}`;
}
