import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import type { Weave } from "../services/weave";
import { getWeaves, WEAVE_SURFACE_MIN } from "../services/weave";
import { hideWeave, isHidden, isSnoozed } from "../lib/weavePrefs";
import { useApp } from "../state/AppContext";
import { Avatar } from "./Avatar";
import { WeaveSheet } from "./WeaveSheet";
import { EXIT_MS } from "../lib/useExit";
import "./WeaveCard.css";

// One quiet, dismissible thread spotted across the rolodex, never a feed.
// Renders nothing at all unless a weave clears the surface line, so the
// People screen stays byte-identical for everyone else.
export function WeaveCard() {
  const { state } = useApp();
  const [weave, setWeave] = useState<Weave | null>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let alive = true;
    if (isSnoozed()) {
      setWeave(null);
      return;
    }
    void getWeaves(state.contacts).then((weaves) => {
      if (!alive) return;
      setWeave(
        weaves.find((w) => w.score >= WEAVE_SURFACE_MIN && !isHidden(w.id)) ?? null,
      );
    });
    return () => {
      alive = false;
    };
  }, [state.contacts]);

  if (!weave) return null;

  // Both exits, "Not now" and a logged send, glide the card out, then
  // leave the surface resting (weavePrefs snoozes it; no next-one-up feed).
  const dismiss = () => {
    if (closing) return;
    hideWeave(weave.id);
    setClosing(true);
    window.setTimeout(() => {
      setWeave(null);
      setClosing(false);
    }, EXIT_MS);
  };

  const onSheetClose = () => {
    setOpen(false);
    // The sheet hides the weave itself when the message was logged.
    if (isHidden(weave.id)) {
      setClosing(true);
      window.setTimeout(() => {
        setWeave(null);
        setClosing(false);
      }, EXIT_MS);
    }
  };

  return (
    <>
      <div className={"wc" + (closing ? " is-out" : "")}>
        <div className="wc-kicker">
          <Link2 size={12} /> Weave · from your notes
        </div>
        <div className="wc-headline">{weave.headline}</div>
        <div className="wc-prompt">{weave.prompt}</div>
        <div className="wc-foot">
          <div className="wc-people">
            {weave.people.map((p) => (
              <Avatar key={p.id} contact={p} size={26} />
            ))}
          </div>
          <div className="wc-actions">
            <button className="wc-later" onClick={dismiss}>
              Not now
            </button>
            <button className="wc-act" onClick={() => setOpen(true)}>
              {weave.kind === "intro" ? "Draft the intro" : "Draft the invite"}
            </button>
          </div>
        </div>
      </div>
      {open && <WeaveSheet weave={weave} onClose={onSheetClose} />}
    </>
  );
}
