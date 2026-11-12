// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { makeContact } from "../test/factories";
import { DEFAULT_SETTINGS } from "../state/reducer";

const NOW = Date.now();
const DAY = 86_400_000;
const stale = makeContact({
  id: "c-stale", name: "Priya Shah",
  lastInteractionAt: new Date(NOW - 60 * DAY).toISOString(),
  interactions: [{ id: "i1", kind: "met", at: new Date(NOW - 60 * DAY).toISOString(), summary: "Met" }],
});
const maya = makeContact({ id: "c-maya", email: "maya@example.com" });

const app = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock("../state/AppContext", () => ({ useApp: () => app.value }));

import { AgentScreen } from "./AgentScreen";

function setApp(overrides: Record<string, unknown>) {
  app.value = {
    state: { contacts: [stale, maya], events: [], settings: { ...DEFAULT_SETTINGS, name: "Steve", onboarded: true }, dyadRev: 0 },
    dispatch: vi.fn(), flash: vi.fn(), demo: false,
    ...overrides,
  };
}

function LocationProbe() {
  return <span data-testid="location">{useLocation().search}</span>;
}

function mount() {
  return render(<MemoryRouter><AgentScreen /></MemoryRouter>);
}

beforeEach(() => {
  try { window.sessionStorage.clear(); window.localStorage.clear(); } catch { /* ignore */ }
});
afterEach(cleanup);

describe("agent home", () => {
  it("shows a rule-based briefing and chat in demo mode without calling the agent", async () => {
    setApp({ demo: true });
    mount();
    expect(screen.getByRole("region", { name: "Your briefing" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Check in with Priya" })).toBeTruthy();
    expect(screen.getByText(/sample network/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Who should I reach out to this week?" }));
    await screen.findByText(/here's what i'd focus on today/i);
  });

  it("opens the tab named in the URL and keeps tab choice linkable", async () => {
    setApp({ demo: true });
    render(<MemoryRouter initialEntries={["/?tab=goals"]}><AgentScreen /><LocationProbe /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Goals" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("region", { name: "Goals" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Rules" }));
    expect(screen.getByRole("region", { name: "Rules" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("?tab=rules");
    fireEvent.click(screen.getByRole("tab", { name: "Briefing" }));
    expect(screen.getByTestId("location").textContent).toBe("");
    expect(screen.getByRole("region", { name: "Your briefing" })).toBeTruthy();
  });

  it("puts this week's goal steps in the feed and marks them done", async () => {
    setApp({ demo: true });
    const { weekStart, localGoalsKey } = await import("../services/agentGoals");
    const week = weekStart(Date.now());
    window.localStorage.setItem(localGoalsKey(null, true), JSON.stringify([{
      id: "g1", title: "Land a PM role", detail: null, targetDate: null, state: "ACTIVE", people: [], plannedAt: null,
      steps: [{ id: "s1", contactId: null, weekOf: week, action: "Write your PM story", rationale: "", state: "OPEN" }],
    }]));
    mount();
    const card = screen.getByRole("article", { name: "Write your PM story" });
    expect(card.textContent).toMatch(/goal step/i);
    fireEvent.click(within(card).getByRole("button", { name: "Mark done" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Write your PM story" })).toBeNull());
    expect(JSON.parse(window.localStorage.getItem(localGoalsKey(null, true)) ?? "[]")[0].steps[0].state).toBe("DONE");
  });

  it("preps an upcoming event on-device", async () => {
    const soon = new Date(Date.now() + 2 * DAY);
    setApp({ demo: true });
    const base = app.value.state as Record<string, unknown>;
    app.value = { ...app.value, state: { ...base, events: [{
      id: "e1", name: "Product Coffee", startsAt: soon.toISOString(), endsAt: new Date(soon.getTime() + 3_600_000).toISOString(),
      where: "Cafe", known: 1, goal: "Meet 1 new PM", talkingPoints: ["Ask about hiring"],
    }] } };
    mount();
    const prep = screen.getAllByRole("button", { name: "Prep" })[0];
    fireEvent.click(prep);
    const sheet = await screen.findByRole("dialog", { name: "Prep for Product Coffee" });
    expect(within(sheet).getByText("Ask about hiring")).toBeTruthy();
  });

  it("finds a time with someone from a reconnect card", async () => {
    setApp({ demo: true });
    mount();
    const card = screen.getByRole("article", { name: "Check in with Priya" });
    fireEvent.click(within(card).getByRole("button", { name: /find a time/i }));
    const sheet = await screen.findByRole("dialog", { name: "Find a time" });
    expect((within(sheet).getByRole("combobox") as HTMLSelectElement).value).toBe("c-stale");
  });
});
