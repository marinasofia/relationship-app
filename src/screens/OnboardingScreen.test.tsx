// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProvider } from "../state/AppContext";
import { OnboardingScreen } from "./OnboardingScreen";

describe("onboarding", () => {
  afterEach(cleanup);

  it("saves the name and goes home", () => {
    render(
      <MemoryRouter initialEntries={["/welcome"]}>
        <AppProvider>
          <Routes>
            <Route path="/welcome" element={<OnboardingScreen />} />
            <Route path="/" element={<p>Home</p>} />
          </Routes>
        </AppProvider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/what should we call you/i), { target: { value: "Maya" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Home")).toBeTruthy();
  });
});
