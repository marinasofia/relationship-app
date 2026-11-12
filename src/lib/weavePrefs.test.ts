import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWeavePrefs,
  hideWeave,
  isHidden,
  isSnoozed,
  loadWeavePrefs,
  WEAVE_PREFS_KEY,
} from "./weavePrefs";
import { stubLocalStorage } from "./testUtils";

const NOW = Date.parse("2026-07-06T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let store: Map<string, string>;

beforeEach(() => {
  store = stubLocalStorage();
});

describe("weavePrefs", () => {
  it("hides a weave and snoozes the surface", () => {
    expect(isHidden("gather:running", NOW)).toBe(false);
    expect(isSnoozed(NOW)).toBe(false);

    hideWeave("gather:running", NOW);
    expect(isHidden("gather:running", NOW)).toBe(true);
    expect(isHidden("gather:knicks", NOW)).toBe(false);
    expect(isSnoozed(NOW)).toBe(true);
    expect(isSnoozed(NOW + 2 * DAY)).toBe(true);
    expect(isSnoozed(NOW + 4 * DAY)).toBe(false);
  });

  it("lets a dismissal expire after a season", () => {
    hideWeave("gather:running", NOW);
    expect(isHidden("gather:running", NOW + 89 * DAY)).toBe(true);
    expect(isHidden("gather:running", NOW + 91 * DAY)).toBe(false);
  });

  it("caps the hidden list", () => {
    for (let i = 0; i < 120; i++) hideWeave(`gather:t${i}`, NOW + i);
    const prefs = loadWeavePrefs(NOW + 200);
    expect(prefs.hidden.length).toBe(100);
    expect(isHidden("gather:t119", NOW + 200)).toBe(true);
    expect(isHidden("gather:t0", NOW + 200)).toBe(false);
  });

  it("treats junk storage as empty", () => {
    store.set(WEAVE_PREFS_KEY, "{{nope");
    expect(loadWeavePrefs(NOW)).toEqual({ hidden: [], snoozedUntil: null });

    store.set(WEAVE_PREFS_KEY, JSON.stringify({ hidden: [{ bad: true }, 7], snoozedUntil: 3 }));
    expect(loadWeavePrefs(NOW)).toEqual({ hidden: [], snoozedUntil: null });
  });

  it("survives a throwing localStorage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("private mode");
      },
      removeItem: () => {
        throw new Error("private mode");
      },
    });
    expect(() => hideWeave("gather:running", NOW)).not.toThrow();
    expect(isHidden("gather:running", NOW)).toBe(false);
    expect(isSnoozed(NOW)).toBe(false);
    expect(() => clearWeavePrefs()).not.toThrow();
  });

  it("clears cleanly", () => {
    hideWeave("gather:running", NOW);
    clearWeavePrefs();
    expect(store.has(WEAVE_PREFS_KEY)).toBe(false);
    expect(isHidden("gather:running", NOW)).toBe(false);
  });
});
