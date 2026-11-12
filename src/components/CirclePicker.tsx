import type { Circle, Contact } from "../types";
import { useApp } from "../state/AppContext";
import "./CirclePicker.css";

const CIRCLES: Array<{ id: Circle; label: string }> = [
  { id: "family", label: "Family" },
  { id: "friend", label: "Friend" },
  { id: "professional", label: "Work" },
  { id: "acquaintance", label: "Acquaintance" },
];

// Who someone is to the user, one tap to set. The app's guess shows as
// "guessed" until the user picks; their pick is never overwritten.
export function CirclePicker({ contact }: { contact: Contact }) {
  const { dispatch } = useApp();
  const guessed = contact.circleSource !== "user";
  const pick = (circle: Circle) =>
    dispatch({ type: "UPDATE_CONTACT", contactId: contact.id, patch: { circle, circleSource: "user" } });

  return (
    <div className="circle-picker" role="radiogroup" aria-label={`Who ${contact.name} is to you`}>
      {CIRCLES.map((c) => {
        const on = contact.circle === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={"circle-chip" + (on ? " on" : "") + (on && guessed ? " guessed" : "")}
            onClick={() => pick(c.id)}
          >
            {c.label}
          </button>
        );
      })}
      {guessed && contact.circle && <span className="circle-hint">The app's guess. Tap to confirm or change.</span>}
      {!contact.circle && <span className="circle-hint">Who are they to you?</span>}
    </div>
  );
}
