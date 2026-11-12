import type { Contact } from "../types";

export function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    name: "Maya Okonkwo",
    role: "Design Lead",
    org: "Northwind",
    met: "AI Founders Night",
    warmth: 82,
    note: "Talked about their seed round.",
    socials: [],
    init: "MO",
    lastInteractionAt: "2026-06-25T18:00:00.000Z",
    interactions: [
      {
        id: "t1",
        kind: "met",
        at: "2026-06-25T18:00:00.000Z",
        summary: "You met at AI Founders Night",
      },
    ],
    ...overrides,
  };
}
