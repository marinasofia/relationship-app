import { describe, expect, it } from "vitest";
import { makeContact } from "../test/factories";

import { parseAgentCard } from "./agent";
import { buildLocalGoalPlan, goalKeywords, goalStepCards, newLocalGoal, parseAgentGoal, validateGoalInput, weekStart } from "./agentGoals";

const NOW = Date.parse("2026-09-30T15:00:00"); // a Wednesday, local time

const serverGoal = {
  id: "g1", title: "Move into product management", detail: null, targetDate: "2027-03-01", state: "ACTIVE",
  people: [{ contactId: "c1", fit: "HIGH", why: "Leads product" }, { contactId: "c2", fit: "NOPE", why: "x" }],
  steps: [{ id: "s1", contactId: "c1", weekOf: "2026-09-28", action: "Ask Maya", rationale: "PM lead", state: "OPEN", draftIntent: "Ask for coffee" }],
  plannedAt: "2026-09-29T00:00:00Z",
};

describe("goal contract", () => {
  it("parses goals and drops people or steps outside the contract", () => {
    const goal = parseAgentGoal(serverGoal)!;
    expect(goal.people).toEqual([{ contactId: "c1", fit: "HIGH", why: "Leads product" }]);
    expect(goal.steps[0].draftIntent).toBe("Ask for coffee");
    expect(parseAgentGoal({ ...serverGoal, state: "DONE" })).toBeNull();
  });

  it("accepts goal_step cards only with a step for mark_step_done", () => {
    expect(parseAgentCard({ id: "a", kind: "goal_step", title: "t", body: "b", action: { type: "mark_step_done", stepId: "s1" } })?.action)
      .toEqual({ type: "mark_step_done", stepId: "s1" });
    expect(parseAgentCard({ id: "a", kind: "goal_step", title: "t", body: "b", action: { type: "mark_step_done" } })?.action).toBeUndefined();
  });

  it("uses Monday as the start of the week", () => {
    expect(weekStart(NOW)).toBe("2026-09-28");
    expect(weekStart(Date.parse("2026-09-28T01:00:00"))).toBe("2026-09-28");
    expect(weekStart(Date.parse("2026-10-04T23:00:00"))).toBe("2026-09-28");
  });

  it("validates titles, details and dates before saving", () => {
    expect(validateGoalInput({ title: " ", detail: "", targetDate: "" })).toMatch(/title/);
    expect(validateGoalInput({ title: "x".repeat(201), detail: "", targetDate: "" })).toMatch(/200/);
    expect(validateGoalInput({ title: "Ok", detail: "", targetDate: "soon" })).toMatch(/date/);
    expect(validateGoalInput({ title: "Ok", detail: "", targetDate: "2027-01-01" })).toBeNull();
  });
});

describe("on-device planning", () => {
  const pm = makeContact({ id: "c-pm", name: "Ada Park", role: "Product Manager", org: "Stripe", warmth: 40 });
  const eng = makeContact({ id: "c-eng", name: "Bo Chen", role: "Engineer", org: "Figma", warmth: 90, note: "" });
  const lead = makeContact({ id: "c-lead", name: "Cy Diaz", role: "Head of Product Management", org: "Linear", warmth: 70, note: "" });

  it("ranks contacts whose role or org matches the goal", () => {
    const goal = newLocalGoal({ title: "Move into product management", detail: "", targetDate: "" });
    expect(goalKeywords(goal)).toEqual(expect.arrayContaining(["product", "management"]));
    const planned = buildLocalGoalPlan(goal, [pm, eng, lead], "2026-09-28", NOW);
    expect(planned.people.map(p => p.contactId)).toEqual(["c-lead", "c-pm"]);
    expect(planned.people[0].fit).toBe("HIGH");
    expect(planned.steps[0].draftIntent).toMatch(/product management/i);
    expect(goalStepCards([planned], "2026-09-28")).toHaveLength(2);
  });

  it("falls back to warm relationships when nobody matches, and keeps finished steps", () => {
    const goal = { ...newLocalGoal({ title: "Raise a seed round", detail: "", targetDate: "" }),
      steps: [{ id: "old", contactId: null, weekOf: "2026-09-28", action: "Done already", rationale: "", state: "DONE" as const }] };
    const planned = buildLocalGoalPlan(goal, [eng, { ...pm, role: "Designer", org: "Acme", note: "" }], "2026-09-28", NOW);
    expect(planned.people[0]).toMatchObject({ contactId: "c-eng", fit: "LOW" });
    expect(planned.steps.some(s => s.id === "old" && s.state === "DONE")).toBe(true);
  });
});
