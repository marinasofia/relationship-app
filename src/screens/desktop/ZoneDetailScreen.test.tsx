// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContact } from "../../test/factories";
import { clearDyadStats, setDyadStats } from "../../services/warmth";
const state = vi.hoisted(() => ({ contacts: [] as ReturnType<typeof makeContact>[], dyadRev: 0 }));
vi.mock("../../state/AppContext", () => ({ useApp: () => ({ state }) }));
import { ZoneDetailScreen } from "./ZoneDetailScreen";
const renderZone = () => render(<MemoryRouter initialEntries={["/zone/active"]}><Routes><Route path="/zone/:zone" element={<ZoneDetailScreen />} /></Routes></MemoryRouter>);
describe("zone model score presentation", () => {
  afterEach(() => { cleanup(); clearDyadStats(); });
  it("shows an unscored new contact without an invented risk percentage", () => {
    state.contacts = [makeContact({ id: "new", warmth: 50 })];
    renderZone();
    expect(screen.getAllByText("Not scored")).toHaveLength(2);
    expect(screen.queryByText("50%")).toBeNull();
    expect(screen.getByText("0 of 1 relationships scored")).toBeTruthy();
    expect(screen.queryByText("Healthy momentum")).toBeNull();
    expect(screen.getByText("Saved relationship warmth")).toBeTruthy();
  });
  it("excludes abstained contacts from the model average", () => {
    state.contacts = [makeContact({ id: "scored", warmth: 50 }), makeContact({ id: "abstain", warmth: 50 })];
    const base = { medianGapDays: 7, gapIqr: 1, lastInteractionAt: "2026-01-01T00:00:00Z", msgCount: 30, initiationRatio: 0.5 };
    setDyadStats(new Map([
      ["scored", { ...base, risk: 40, decayConfidence: "model_scored" }],
      ["abstain", { ...base, risk: 99, decayConfidence: "insufficient_history" }],
    ]));
    renderZone();
    expect(screen.getAllByText("40/100")).toHaveLength(2);
    expect(screen.getByText("Not enough history")).toBeTruthy();
    expect(screen.getByText("1 of 2 relationships scored")).toBeTruthy();
  });
});


