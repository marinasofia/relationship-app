// @vitest-environment jsdom
// One tap sets who someone is; a guess reads as a guess until the user picks.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContact } from "../test/factories";

const app = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("../state/AppContext", () => ({ useApp: () => ({ dispatch: app.dispatch }) }));

import { CirclePicker } from "./CirclePicker";

afterEach(() => {
  cleanup();
  app.dispatch.mockReset();
});

describe("CirclePicker", () => {
  it("marks The app's guess as a guess", () => {
    render(<CirclePicker contact={makeContact({ circle: "professional", circleSource: "auto" })} />);
    const work = screen.getByRole("radio", { name: "Work" });
    expect(work.getAttribute("aria-checked")).toBe("true");
    expect(work.className).toContain("guessed");
    expect(screen.getByText(/The app's guess/)).toBeTruthy();
  });

  it("saves the user's pick as their own choice", () => {
    const contact = makeContact({ circle: null, circleSource: null });
    render(<CirclePicker contact={contact} />);
    expect(screen.getByText("Who are they to you?")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Family" }));
    expect(app.dispatch).toHaveBeenCalledWith({
      type: "UPDATE_CONTACT", contactId: contact.id, patch: { circle: "family", circleSource: "user" },
    });
  });

  it("shows a confirmed choice without the hint", () => {
    render(<CirclePicker contact={makeContact({ circle: "friend", circleSource: "user" })} />);
    expect(screen.getByRole("radio", { name: "Friend" }).className).not.toContain("guessed");
    expect(screen.queryByText(/The app's guess/)).toBeNull();
  });
});
