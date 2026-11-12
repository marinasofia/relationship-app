// @vitest-environment jsdom
// Route smoke: every screen renders through the real App and the real
// AppProvider on the sample data, in both the mobile shell and the desktop
// two-pane shell. Each route must mount and show one stable landmark.
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./state/AppContext";
import { CONTACTS } from "./data/contacts";
import { EVENTS } from "./data/events";

type Shell = "mobile" | "desktop";

// useIsDesktop asks matchMedia for "(min-width: 960px)"; jsdom has no
// matchMedia, so answer that query from the stubbed viewport width the way a
// browser would. 390 is a phone, 1280 a laptop.
const SHELL_WIDTH: Record<Shell, number> = { mobile: 390, desktop: 1280 };

function stubViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => {
      const min = /\(min-width:\s*(\d+)px\)/.exec(query);
      return {
        matches: min ? window.innerWidth >= Number(min[1]) : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    },
  });
}

const CONTACT = CONTACTS[0];
const EVENT = EVENTS[0];

async function mount(shell: Shell, path: string) {
  stubViewport(SHELL_WIDTH[shell]);
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>
    </StrictMode>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const CONTACT_PATH = `/contact/${CONTACT.id}`;
const LIVE_PATH = `/event/${EVENT.id}/live`;

const onboardingLandmark = () => screen.getByLabelText("What should we call you?");
const settingsLandmark = () => screen.getByText("Settings", { selector: ".h1" });
const liveLandmark = () => screen.getByText("Capture someone");
const orbitLandmark = () => screen.getByRole("heading", { name: "Your orbit" });
const agentLandmark = () => screen.getByRole("region", { name: "Ask your agent" });

const MOBILE_ROUTES: Array<[path: string, landmark: () => HTMLElement]> = [
  ["/today", () => screen.getByRole("heading", { name: "Today", level: 1 })],
  ["/people", () => screen.getByText("People", { selector: ".h1" })],
  ["/", agentLandmark],
    [CONTACT_PATH, () => screen.getAllByText(CONTACT.name)[0]],
  ["/events", () => screen.getByText("Events", { selector: ".h1" })],
  [LIVE_PATH, liveLandmark],
  ["/settings", settingsLandmark],
  // Unknown paths fall back to the agent home, same as desktop.
  ["/somewhere-else", agentLandmark],
];

const DESKTOP_ROUTES: Array<[path: string, landmark: () => HTMLElement]> = [
  ["/today", () => screen.getByRole("heading", { name: "Today", level: 1 })],
  ["/", agentLandmark],
  ["/orbit", orbitLandmark],
  ["/orbit/core", () => screen.getByRole("heading", { level: 1, name: "Warm" })],
  ["/people", () => screen.getByText("Your people, one card at a time")],
  [CONTACT_PATH, () => screen.getByText(CONTACT.name, { selector: ".dh-name" })],
  ["/events", () => screen.getAllByText("Startup Grind NYC: AI Edition")[0]],
  [LIVE_PATH, liveLandmark],
  ["/analytics", () => screen.getByText("Analytics", { selector: ".h1" })],
  ["/settings", settingsLandmark],
  // Unknown paths fall back to the agent; unknown zones to the orbit.
  ["/somewhere-else", agentLandmark],
  ["/orbit/nowhere", orbitLandmark],
];

afterEach(() => {
  cleanup();
});

describe("mobile shell", () => {
  it.each(MOBILE_ROUTES)("renders %s", async (path, landmark) => {
    await mount("mobile", path);
    expect(landmark()).toBeTruthy();
  });

  it("/welcome shows onboarding", async () => {
    await mount("mobile", "/welcome");
    expect(onboardingLandmark()).toBeTruthy();
  });
});

describe("desktop shell", () => {
  it.each(DESKTOP_ROUTES)("renders %s", async (path, landmark) => {
    await mount("desktop", path);
    expect(landmark()).toBeTruthy();
  });
});
