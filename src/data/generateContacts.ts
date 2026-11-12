import type { Contact, Interaction, Social } from "../types";
import { daysAgoIso } from "../lib/dates";

// Deterministic seed people. One fixed PRNG seed → the same 192 contacts every
// time, with dates offset from now so the demo always feels current. Companies
// are drawn from a weighted plan so the memory tree shows real clusters, a few
// deep footholds, a spread of mid-size groups, and a long tail of one-offs.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Ava", "Liam", "Noor", "Mateo", "Zoe", "Kai", "Amara", "Felix", "Ines", "Dario",
  "Sana", "Theo", "Yuki", "Omar", "Clara", "Ravi", "Elena", "Marcus", "Tessa", "Jonah",
  "Leila", "Andre", "Bianca", "Chen", "Dalia", "Ezra", "Freya", "Gustavo", "Hana", "Idris",
  "Josie", "Karim", "Lucia", "Mina", "Nate", "Oksana", "Pablo", "Quinn", "Rosa", "Silas",
  "Tara", "Umair", "Vera", "Wes", "Ximena", "Yara", "Zach", "Priyanka",
];
const LAST = [
  "Adeyemi", "Brooks", "Castillo", "Duarte", "Eriksen", "Farouk", "Gallo", "Huang", "Ivanova", "Joshi",
  "Kim", "Lindqvist", "Moreau", "Nakamura", "Okafor", "Petrov", "Quintero", "Rahman", "Sato", "Tanaka",
  "Umeh", "Vargas", "Weber", "Xu", "Yilmaz", "Zhang", "Ashworth", "Beltran", "Cho", "Deng",
  "Ellison", "Fontaine", "Grieco", "Haddad", "Iyer", "Jansen", "Kowalski", "Lund", "Mbeki", "Novak",
  "Ochoa", "Pierce", "Reyes", "Sandoval", "Thorne", "Ueda", "Villanueva", "Whitaker",
];

// Titles that only make sense inside a big company, and titles that only make
// sense at a startup or a one-person shop. Splitting them keeps the roster from
// producing a "Founder · Apple".
const ROLES = [
  "Design Lead", "PM", "Engineer", "Eng Manager", "Data Scientist",
  "Growth", "Recruiter", "Community", "Marketing Lead", "Sales", "Ops",
  "Researcher", "Product Designer", "iOS Engineer", "Analyst",
  "Solutions Engineer", "DevRel", "Chief of Staff", "Quant Researcher",
  "Principal", "Platform Lead", "Product Marketing", "Eng Director",
  "Staff Engineer", "Program Manager", "Security Engineer", "Director of Product",
];
const STARTUP_ROLES = [
  "Founder", "Co-founder", "CEO", "CTO", "Investor", "Partner", "Associate",
  "Design Lead", "Engineer", "Growth", "Community", "Chief of Staff",
  "Head of Product", "Head of Ops", "Principal",
];

// [company, how many of the 200 work there], the tech economy a New York
// rolodex collects: the Fortune 500 names that employ the city, then its own
// public tech names, then a couple of startups. Companies are named plainly,
// with no office location attached. Anchors first (they reuse the core
// contacts' companies, deepening those clusters).
// The ten anchors are deliberately deep and clearly separated, no ties at the
// bottom of the top ten, since that is the boundary the orbit ring names.
const ORG_PLAN: Array<[string, number]> = [
  ["Google", 20], ["Amazon", 16], ["JPMorgan Chase", 14], ["Meta", 13],
  ["Bloomberg", 12], ["Goldman Sachs", 11], ["IBM", 10], ["Microsoft", 10],
  ["Apple", 9], ["Verizon", 8],
  ["Morgan Stanley", 4], ["Salesforce", 4], ["American Express", 4], ["Oracle", 4],
  ["Accenture", 3], ["Uber", 3], ["Netflix", 3], ["Adobe", 3],
  ["Cisco", 3], ["Spotify", 3], ["Warner Bros Discovery", 3], ["Datadog", 3],
  ["MongoDB", 3], ["Etsy", 2], ["Peloton", 2], ["Squarespace", 2],
  ["Two Sigma", 2], ["Jane Street", 2], ["Paramount", 2], ["Nvidia", 2],
  ["PayPal", 2], ["Intuit", 2], ["Ramp", 2], ["Braze", 2],
];
// The small end of the roster, where a founder title belongs.
const STARTUP_ORGS = new Set(["Ramp", "Braze", "Justworks"]);
const SOLO_ORGS = [
  "Freelance", "Greenpoint Studio", "Bowery Lab", "Two Bridges Design", "Red Hook Works",
  "Atlantic & Co", "Stealth (fintech)", "Stealth (AI)", "Mott Street Media", "Ludlow Advisory",
  "Prospect Labs", "Canal Street Club", "Fort Greene Films", "Delancey & Daughters",
  "Sunnyside Studio", "Bedford Ave Books", "Gowanus Works", "Astoria Analytics",
  "Chinatown Soup", "Rivington Research", "Clinton Hill Creative", "Union Hall Ventures",
  "Vanderbilt & Vine", "Wythe Studio", "Nolita Notes", "Carroll Gardens Co",
  "Bushwick Foundry", "Pier 57 Projects", "Hoyt & Horn", "Jane Street Bakery",
];

const EVENTS_POOL = [
  "AI Founders Night", "Demo Day", "Flatiron SaaS Meetup", "Product Coffee",
  "Columbia Career Fair", "NY Tech Week Mixer", "Creator Night", "Startup Grind",
  "Brooklyn Founders Brunch", "Dumbo Design Social", "Cornell Tech Mixer",
  "Fintech Friday", "Climate Tech Drinks", "Hack Brooklyn", "Women in Eng Brunch",
  "SoHo AI Social", "LES Founder Dinners", "Rooftop Demo Night",
];

const HOOKS = [
  "Wants an intro to a designer.", "Said to send the deck.", "Ask about their Series A.",
  "Mentioned they're hiring for platform.", "Training for the NYC Half.",
  "Just moved from SF, knows nobody yet.", "Building a climate side project.",
  "Offered to intro me to their CTO.", "Wants feedback on their onboarding.",
  "Runs a dinner series in the East Village.", "Knows everyone in fintech.",
  "Asked for the beta link.", "We share a former teammate.", "Talked about their pivot.",
  "Lives in Williamsburg, promised brunch.", "Promised a coffee next month.",
  "Big Knicks fan, talked playoffs.", "Was on the panel, sharp takes.",
  "Interested in advising.", "Wants to co-host a dinner in SoHo.",
  "Commutes in from Hoboken.", "Hosts office hours in Flatiron.",
];
const CONTEXTS = [
  "Met on the rooftop", "Long chat by the coffee table", "Introduced by a mutual friend",
  "Sat together at the demo", "Talked after their talk", "Shared a table at lunch",
  "Met in the founders circle", "Shared a cab downtown after",
];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Warmth mixture: some warm, more steady/cooling, a real cold tail. */
function drawWarmth(rng: () => number): number {
  const r = rng();
  if (r < 0.18) return 70 + Math.floor(rng() * 26); // Warm
  if (r < 0.45) return 45 + Math.floor(rng() * 25); // Steady
  if (r < 0.75) return 25 + Math.floor(rng() * 20); // Cooling
  return 3 + Math.floor(rng() * 22); // Going cold
}

export function generateContacts(count: number): Contact[] {
  const rng = mulberry32(0x5eed);

  // Roster of employers: the plan, then singletons to fill the remainder.
  const roster: string[] = [];
  for (const [org, n] of ORG_PLAN) for (let i = 0; i < n; i++) roster.push(org);
  let solo = 0;
  while (roster.length < count) roster.push(SOLO_ORGS[solo++ % SOLO_ORGS.length]);
  roster.length = count;
  // Deterministic shuffle so companies don't arrive in blocks.
  for (let i = roster.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roster[i], roster[j]] = [roster[j], roster[i]];
  }

  const usedNames = new Set<string>();
  const contacts: Contact[] = [];

  for (let i = 0; i < count; i++) {
    let name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
    while (usedNames.has(name)) {
      name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
    }
    usedNames.add(name);
    const [first, last] = name.split(" ");

    const org = roster[i];
    const bigCompany = !STARTUP_ORGS.has(org) && !SOLO_ORGS.includes(org);
    const role = pick(rng, bigCompany ? ROLES : STARTUP_ROLES);
    const met = pick(rng, EVENTS_POOL);
    const warmth = drawWarmth(rng);

    // Warm contacts skew recent; cold ones drift back up to ~14 months.
    const metDaysAgo = Math.max(
      2,
      Math.round(6 + ((100 - warmth) / 100) * 380 * (0.4 + rng() * 0.9)),
    );

    // History: met, then 0 to 4 touchpoints; warmth buys both count and recency.
    const extras = Math.min(4, Math.floor(rng() * (warmth / 22)));
    const lastDaysAgo = Math.max(
      1,
      Math.round(metDaysAgo * (0.08 + ((100 - warmth) / 100) * 0.75) * (0.6 + rng() * 0.8)),
    );
    const interactions: Interaction[] = [
      {
        id: `g${i}-met`,
        kind: "met",
        at: daysAgoIso(metDaysAgo, 18),
        summary: `You met at ${met}`,
      },
    ];
    for (let k = 0; k < extras; k++) {
      const frac = (k + 1) / (extras + 1);
      const at = Math.max(
        lastDaysAgo,
        Math.round(metDaysAgo - (metDaysAgo - lastDaysAgo) * frac),
      );
      const kind = rng() < 0.6 ? "followup" : "note";
      interactions.push({
        id: `g${i}-${k}`,
        kind,
        at: daysAgoIso(at, 11),
        summary: kind === "followup" ? "You sent a follow-up" : "You saved a note",
      });
    }
    interactions.sort((a, b) => a.at.localeCompare(b.at));

    const socials: Social[] = [{ type: "linkedin", handle: `${slug(first)}-${slug(last)}-demo` }];
    if (rng() < 0.4) socials.push({ type: "x", handle: `${`${slug(first)}${slug(last)}`.slice(0, 10)}_demo` });
    if (rng() < 0.15) socials.push({ type: "instagram", handle: `${slug(first)}.${slug(last)}_demo` });
    if (rng() < 0.2) socials.push({ type: "site", handle: `${slug(first)}${slug(last)}.example` });

    const email =
      rng() < 0.85 ? `${slug(first)}.${slug(last)}@example.com` : null;

    contacts.push({
      id: `g${i + 1}`,
      name,
      role,
      org,
      met,
      warmth,
      note: `${pick(rng, CONTEXTS)}, ${role.toLowerCase()} at ${org}. ${pick(rng, HOOKS)}`,
      init: `${first[0]}${last[0]}`,
      socials,
      email,
      lastInteractionAt: interactions[interactions.length - 1].at,
      interactions,
    });
  }

  return contacts;
}
