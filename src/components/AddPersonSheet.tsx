import { useCallback, useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import type { Contact } from "../types";
import { useApp } from "../state/AppContext";
import { EXIT_MS } from "../lib/useExit";
import "./AddPersonSheet.css";

interface AddPersonSheetProps {
  onClose: () => void;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Warmth given to someone added by hand: warm, you clearly care enough to save them.
const ADDED_WARMTH = 72;

// Bottom sheet on mobile, centered card on desktop: type a person straight
// into the rolodex. Persistence rides the existing contacts plumbing.
export function AddPersonSheet({ onClose }: AddPersonSheetProps) {
  const { dispatch, flash } = useApp();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [org, setOrg] = useState("");
  const [met, setMet] = useState("");
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  // Every close path animates out first, then unmounts.
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const add = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const at = new Date().toISOString();
    const metLabel = met.trim();
    const contact: Contact = {
      id: crypto.randomUUID(),
      name: cleanName,
      role: role.trim(),
      org: org.trim(),
      met: metLabel || "a chance meeting",
      warmth: ADDED_WARMTH,
      note: note.trim(),
      socials: [],
      init: initialsOf(cleanName),
      lastInteractionAt: at,
      interactions: [
        {
          id: crypto.randomUUID(),
          kind: "met",
          at,
          summary: metLabel ? `You met at ${metLabel}` : "You added them",
        },
      ],
    };
    dispatch({ type: "ADD_CONTACT", contact });
    close();
    flash("Added, keep them warm");
  };

  return (
    <div className={"aps-bg" + (closing ? " is-out" : "")} onClick={close}>
      <form
        className="aps"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="aps-grab" />
        <div className="aps-h">
          <UserPlus size={15} /> Add someone
        </div>

        <label className="aps-field">
          <span className="aps-label">Name</span>
          <input
            className="aps-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who did you meet?"
            autoFocus
            required
          />
        </label>

        <div className="aps-pair">
          <label className="aps-field">
            <span className="aps-label">Role</span>
            <input
              className="aps-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Design Lead"
            />
          </label>
          <label className="aps-field">
            <span className="aps-label">Company</span>
            <input
              className="aps-input"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="Northwind"
            />
          </label>
        </div>

        <label className="aps-field">
          <span className="aps-label">Where you met</span>
          <input
            className="aps-input"
            value={met}
            onChange={(e) => setMet(e.target.value)}
            placeholder="Event, coffee shop, a friend's intro…"
          />
        </label>

        <label className="aps-field">
          <span className="aps-label">Note</span>
          <textarea
            className="aps-input aps-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="One line so future you remembers them"
            rows={2}
          />
        </label>

        <button className="aps-cta" type="submit" disabled={!name.trim()}>
          <UserPlus size={15} /> Add to network
        </button>
      </form>
    </div>
  );
}
