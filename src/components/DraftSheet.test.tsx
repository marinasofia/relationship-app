// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContact } from "../test/factories";
const app = vi.hoisted(() => ({ dispatch: vi.fn(), flash: vi.fn() }));
vi.mock("../state/AppContext", () => ({ useApp: () => app }));
import { DraftSheet } from "./DraftSheet";

beforeEach(() => { app.dispatch.mockReset(); app.flash.mockReset(); });
afterEach(cleanup);

async function open() {
  render(<DraftSheet contact={makeContact({ email: "maya@example.com" })} onClose={() => {}} />);
  await screen.findByRole("textbox", { name: "Your message" });
}

describe("truthful outreach logging", () => {
  it("does not record delivery or an outcome while preparing, editing, copying or opening Mail", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    await open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "My reviewed message" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith("My reviewed message"));
    const mail = screen.getByRole("link", { name: "Open in Mail" });
    expect(new URL(mail.getAttribute("href")!).searchParams.get("body")).toBe("My reviewed message");
    // Prevent jsdom navigation, but exercise any click handler attached by React.
    mail.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(mail);
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Log as sent" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });
  it("records one self-reported action only after confirmation, without storing text or increasing warmth", async () => {
    await open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "PRIVATE_SENTINEL_BODY" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Log as sent" }));
    fireEvent.click(screen.getByRole("button", { name: "Log as sent" }));
    expect(app.dispatch).toHaveBeenCalledTimes(1);
    const action = app.dispatch.mock.calls[0][0];
    expect(action.contactId).toBe("c1");
    expect(action.interaction.summary).toContain("self-reported");
    expect(action.warmthDelta).toBeUndefined();
    expect(JSON.stringify(action)).not.toContain("PRIVATE_SENTINEL_BODY");
  });
  it("invalidates sent confirmation when the user edits the draft or changes the goal", async () => {
    await open();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited" } });
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "internship" } });
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("exploring internships"));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(app.dispatch).not.toHaveBeenCalled();
  });
  it("clears draft and confirmation when switching recipient", async () => {
    const view = render(<DraftSheet contact={makeContact()} onClose={() => {}} />);
    await screen.findByRole("textbox");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "PRIVATE_FOR_MAYA" } });
    fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(<DraftSheet contact={makeContact({ id: "c2", name: "Jordan" })} onClose={() => {}} />);
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("Jordan"));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).not.toContain("PRIVATE_FOR_MAYA");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
});
