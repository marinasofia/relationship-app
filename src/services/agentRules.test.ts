import { describe, expect, it } from "vitest";
import { makeContact } from "../test/factories";

import { buildLocalWeeklyReport, describeRule, evaluateLocalRules, parseAgentRule, validateRuleParams, type AgentRule } from "./agentRules";

const NOW = Date.parse("2026-09-30T15:00:00Z");
const DAY = 86_400_000;

const rule = (overrides: Partial<AgentRule>): AgentRule => ({
  id: "r1", kind: "KEEP_IN_TOUCH", params: { contactIds: ["c1"], cadenceDays: 30 }, enabled: true,
  createdAt: "", updatedAt: "", lastEvaluatedAt: null, ...overrides,
});

describe("rule params", () => {
  it("enforces the contract bounds", () => {
    expect(validateRuleParams("KEEP_IN_TOUCH", { contactIds: [], cadenceDays: 30 })).toMatch(/at least one/);
    expect(validateRuleParams("KEEP_IN_TOUCH", { contactIds: Array.from({ length: 51 }, (_, i) => `c${i}`), cadenceDays: 30 })).toMatch(/50/);
    expect(validateRuleParams("KEEP_IN_TOUCH", { contactIds: ["c1"], cadenceDays: 6 })).toMatch(/7 and 365/);
    expect(validateRuleParams("KEEP_IN_TOUCH", { contactIds: ["c1"], cadenceDays: 30 })).toBeNull();
    expect(validateRuleParams("THANK_AFTER_EVENT", { withinHours: 73 })).toMatch(/12 and 72/);
    expect(validateRuleParams("BIRTHDAY", { daysBefore: 0 })).toBeNull();
    expect(validateRuleParams("REPLY_REMINDER", { afterDays: 2.5 })).toMatch(/1 and 14/);
  });

  it("parses rules and describes them in plain language", () => {
    expect(parseAgentRule({ id: "x", kind: "NOPE", params: {} })).toBeNull();
    const parsed = parseAgentRule({ id: "x", kind: "BIRTHDAY", params: { daysBefore: 2 }, enabled: true })!;
    expect(describeRule(parsed, [])).toBe("Remind you 2 days before a birthday.");
    expect(describeRule(rule({}), [makeContact({ id: "c1", name: "Maya Okonkwo" })])).toBe("Check in with Maya at least every 30 days.");
  });
});

describe("on-device evaluation", () => {
  const quiet = makeContact({ id: "c1", lastInteractionAt: new Date(NOW - 40 * DAY).toISOString() });
  const recent = makeContact({ id: "c2", lastInteractionAt: new Date(NOW - 5 * DAY).toISOString() });

  it("flags keep-in-touch contacts past their cadence and skips disabled rules", () => {
    const rules = [rule({ params: { contactIds: ["c1", "c2"], cadenceDays: 30 } })];
    const due = evaluateLocalRules(rules, { contacts: [quiet, recent], past: [], now: NOW });
    expect(due).toEqual([{ ruleId: "r1", contactId: "c1", reason: "It's been 40 days; your rule says every 30." }]);
    expect(evaluateLocalRules([{ ...rules[0], enabled: false }], { contacts: [quiet], past: [], now: NOW })).toEqual([]);
  });

  it("suggests thank-yous to people met at a recent event", () => {
    const eventAt = new Date(NOW - 10 * 3_600_000).toISOString();
    const met = makeContact({ id: "c3", interactions: [{ id: "i", kind: "met", at: eventAt, summary: "Met" }] });
    const due = evaluateLocalRules([rule({ id: "r2", kind: "THANK_AFTER_EVENT", params: { withinHours: 24 } })],
      { contacts: [met, recent], past: [{ id: "p1", name: "Design Week", at: eventAt, met: 1, followed: 0 }], now: NOW });
    expect(due.map(d => d.contactId)).toEqual(["c3"]);
  });

  it("builds a local weekly report from follow-ups and due reminders", () => {
    const followed = makeContact({ id: "c4", name: "Rosa Lee", interactions: [{ id: "f", kind: "followup", at: "2026-09-29T12:00:00", summary: "Sent" }] });
    const report = buildLocalWeeklyReport({
      contacts: [followed, quiet], rules: [rule({})], past: [], goalStepsDone: 1, weekOf: "2026-09-28", now: NOW,
    });
    expect(report.counts).toMatchObject({ approved: 1, remindersDue: 1, goalStepsDone: 1 });
    expect(report.activity[0].summary).toBe("Followed up with Rosa Lee");
  });
});
