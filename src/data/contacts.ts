import type { Contact, Interaction } from "../types";
import { daysAgoIso } from "../lib/dates";
import { generateContacts } from "./generateContacts";

// SYNTHETIC DATA. Every person here is made up. Emails use example.com, sites
// use the reserved .example domain, and social handles end in "demo".
// The eight hand-written contacts below lead; generateContacts fills the
// rolodex out to 200 with deterministic people. All timestamps are offset from
// now so the demo always feels current.

function history(
  entries: Array<[Interaction["kind"], number, string]>,
): Pick<Contact, "interactions" | "lastInteractionAt"> {
  const interactions = entries
    .map(([kind, ago, summary], i): Interaction => ({
      id: `seed-${kind}-${ago}-${i}`,
      kind,
      at: daysAgoIso(ago, kind === "met" ? 18 : 11),
      summary,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  return { interactions, lastInteractionAt: interactions[interactions.length - 1].at };
}

const CORE: Contact[] = [
  {
    id: "c1",
    name: "Maya Okonkwo",
    email: "maya.okonkwo@example.com",
    role: "Design Lead",
    org: "Google",
    met: "AI Founders Night",
    warmth: 82,
    note: "Leads design systems at Google. Wants an intro to a brand designer.",
    init: "MO",
    socials: [
      { type: "linkedin", handle: "maya-okonkwo-demo" },
      { type: "x", handle: "mayabuilds_demo" },
      { type: "site", handle: "maya.example" },
    ],
    ...history([
      ["met", 6, "You met at AI Founders Night"],
      ["followup", 4, "You sent a follow-up"],
    ]),
  },
  {
    id: "c8",
    name: "Aisha Nasser",
    email: "aisha.nasser@example.com",
    role: "Associate",
    org: "Goldman Sachs",
    met: "Demo Day",
    warmth: 66,
    note: "Interested in the networking idea. Said to send the deck.",
    init: "AN",
    socials: [
      { type: "linkedin", handle: "aisha-nasser-demo" },
      { type: "x", handle: "aisha_vc_demo" },
    ],
    ...history([
      ["met", 10, "You met at Demo Day"],
      ["note", 10, "You saved a note about the deck"],
    ]),
  },
  {
    id: "c2",
    name: "Devin Alarcón",
    email: "devin@example.com",
    role: "Founder",
    org: "Trailhead",
    met: "Brooklyn Founders Brunch",
    warmth: 74,
    note: "Building fintech in Dumbo. Offered to intro me to their advisor.",
    init: "DA",
    socials: [
      { type: "linkedin", handle: "devin-alarcon-demo" },
      { type: "site", handle: "trailhead.example" },
    ],
    ...history([
      ["met", 16, "You met at Brooklyn Founders Brunch"],
      ["followup", 13, "You sent a follow-up"],
    ]),
  },
  {
    id: "c3",
    name: "Priya Raman",
    email: "priya.raman@example.com",
    role: "PM",
    org: "Datadog",
    met: "Product Coffee",
    warmth: 54,
    note: "Loved the roadmap talk. Follow up about the beta.",
    init: "PR",
    socials: [
      { type: "linkedin", handle: "priya-raman-demo" },
      { type: "instagram", handle: "priya.builds_demo" },
    ],
    ...history([["met", 8, "You met at Product Coffee"]]),
  },
  {
    id: "c4",
    name: "Jordan Ellis",
    email: "jordan.ellis@example.com",
    role: "Product Lead",
    org: "Google",
    met: "AI Founders Night",
    warmth: 44,
    note: "Wants an intro to a designer on my side.",
    init: "JE",
    socials: [{ type: "linkedin", handle: "jordan-ellis-demo" }],
    ...history([["met", 6, "You met at AI Founders Night"]]),
  },
  {
    id: "c5",
    name: "Sam Whitfield",
    email: "sam.whitfield@example.com",
    role: "Analyst",
    org: "Two Sigma",
    met: "Columbia Career Fair",
    warmth: 30,
    note: "Said to reach out about summer analyst roles.",
    init: "SW",
    socials: [
      { type: "linkedin", handle: "sam-whitfield-demo" },
      { type: "x", handle: "samwhit_demo" },
    ],
    ...history([
      ["met", 74, "You met at Columbia Career Fair"],
      ["followup", 70, "You sent a follow-up"],
    ]),
  },
  {
    id: "c6",
    name: "Lena Cho",
    email: "lena.cho@example.com",
    role: "Eng Manager",
    org: "MongoDB",
    met: "NY Tech Week Mixer",
    warmth: 18,
    note: "Great chat on hiring. Gone quiet since.",
    init: "LC",
    socials: [
      { type: "linkedin", handle: "lena-cho-demo" },
      { type: "site", handle: "lenacho.example" },
    ],
    ...history([["met", 101, "You met at NY Tech Week Mixer"]]),
  },
  {
    id: "c7",
    name: "Marcus Bell",
    email: "marcus.bell@example.com",
    role: "Community",
    org: "Spotify",
    met: "Creator Night",
    warmth: 11,
    note: "A real connector. Reconnect before the next event.",
    init: "MB",
    socials: [
      { type: "linkedin", handle: "marcus-bell-demo" },
      { type: "x", handle: "marcusconnects_demo" },
      { type: "instagram", handle: "marcus.irl_demo" },
    ],
    ...history([
      ["met", 141, "You met at Creator Night"],
      ["followup", 138, "You sent a follow-up"],
    ]),
  },
];

// The full rolodex: the hand-written stars first, then the generated crowd.
export const CONTACTS: Contact[] = [...CORE, ...generateContacts(192)];

const SEEDED_CONTACT_IDS = new Set(CONTACTS.map((contact) => contact.id));

/** Exact ids owned by the old presentation dataset, never by real captures/adds. */
export function isSeededContactId(id: string): boolean {
  return SEEDED_CONTACT_IDS.has(id);
}
