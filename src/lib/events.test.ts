import { describe, expect, it } from "vitest";
import { digestPastEvents, hasFollowedUp } from "./events";
import { makeContact } from "../test/factories";
import type { Interaction } from "../types";

const met = (at: string): Interaction => ({ id: `m-${at}`, kind: "met", at, summary: "met" });
const followup = (at: string): Interaction => ({
  id: `f-${at}`,
  kind: "followup",
  at,
  summary: "followed up",
});

describe("digestPastEvents", () => {
  const contacts = [
    makeContact({
      id: "a",
      met: "Demo Day",
      warmth: 40,
      interactions: [met("2026-06-01T18:00:00.000Z"), followup("2026-06-03T10:00:00.000Z")],
    }),
    makeContact({
      id: "b",
      met: "demo day ",
      warmth: 90,
      interactions: [met("2026-06-02T18:00:00.000Z")],
    }),
    makeContact({
      id: "c",
      met: "Career Fair",
      warmth: 60,
      interactions: [met("2026-06-10T12:00:00.000Z")],
    }),
    makeContact({ id: "d", met: "  ", warmth: 50, interactions: [met("2026-06-11T12:00:00.000Z")] }),
  ];
  const digests = digestPastEvents(contacts);

  it("groups case/whitespace-insensitively and skips empty labels", () => {
    expect(digests.map((d) => d.key)).toEqual(["career fair", "demo day"]);
    expect(digests[1].people.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("sorts rooms newest first and people warmest first", () => {
    expect(digests[0].name).toBe("Career Fair");
    expect(digests[1].people[0].warmth).toBe(90);
  });

  it("dates each room by its most recent meeting", () => {
    expect(digests[1].at).toBe("2026-06-02T18:00:00.000Z");
  });

  it("counts follow-ups per room", () => {
    expect(digests[1].followed).toBe(1);
    expect(digests[0].followed).toBe(0);
  });

  it("stays calm with no contacts", () => {
    expect(digestPastEvents([])).toEqual([]);
  });
});

describe("hasFollowedUp", () => {
  it("finds a follow-up anywhere in the history", () => {
    expect(
      hasFollowedUp(
        makeContact({ interactions: [met("2026-06-01T18:00:00.000Z"), followup("2026-06-02T09:00:00.000Z")] }),
      ),
    ).toBe(true);
    expect(hasFollowedUp(makeContact({ interactions: [met("2026-06-01T18:00:00.000Z")] }))).toBe(
      false,
    );
  });
});
