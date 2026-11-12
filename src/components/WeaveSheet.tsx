import { useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Sparkles } from "lucide-react";
import type { Weave } from "../services/weave";
import { draftWeaveMessage } from "../services/weave";
import { FOLLOWUP_WARMTH_BUMP } from "../services/warmth";
import { hideWeave } from "../lib/weavePrefs";
import { useApp } from "../state/AppContext";
import { EXIT_MS } from "../lib/useExit";
import "./WeaveSheet.css";

interface WeaveSheetProps {
  weave: Weave;
  onClose: () => void;
}

// Bottom sheet for acting on a weave: review the group invite or intro ask,
// regenerate, copy, and, only when the user says so, log it as sent.
// (Third bottom sheet in the app; if a fourth appears, extract a shared shell.)
export function WeaveSheet({ weave, onClose }: WeaveSheetProps) {
  const { dispatch, flash } = useApp();
  const [variant, setVariant] = useState(0);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  // Async drafting seam (the user's own words later; instant mock today).
  // A stale response never overwrites a newer variant's.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setDraft(null);
    void draftWeaveMessage(weave, variant).then((text) => {
      if (alive) setDraft(text);
    });
    return () => {
      alive = false;
    };
  }, [weave, variant]);
  const ready = draft !== null;

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  };

  // Only the people the message actually addresses get a touchpoint: everyone
  // in a gather, but just the provider in an intro, the seeker got nothing yet.
  const recipients = weave.kind === "intro" ? [weave.people[1]] : weave.people;

  const logAsSent = () => {
    const at = new Date().toISOString();
    for (const person of recipients) {
      dispatch({
        type: "ADD_INTERACTION",
        contactId: person.id,
        interaction: {
          id: `${at}-weave`,
          kind: "followup",
          at,
          summary: `You reached out about ${weave.thread}`,
        },
        warmthDelta: FOLLOWUP_WARMTH_BUMP,
      });
    }
    hideWeave(weave.id);
    close();
    flash(
      recipients.length === 1
        ? "Logged for 1 person"
        : `Logged for ${recipients.length} people`,
    );
  };

  const copy = async () => {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(draft);
      flash("Copied");
    } catch {
      flash("Couldn't copy");
    }
  };

  return (
    <div className={"ws-bg" + (closing ? " is-out" : "")} onClick={close}>
      <div className="ws" onClick={(e) => e.stopPropagation()}>
        <div className="ws-grab" />
        <div className="ws-h">
          <Sparkles size={15} />
          {weave.kind === "intro" ? "The intro, asked first" : "The invite, in your voice"}
        </div>
        <div className="ws-headline">{weave.headline}</div>
        <div className={"ws-draft" + (ready ? "" : " is-pending")}>
          {ready ? draft : "Drafting, in your voice…"}
        </div>
        <div className="ws-row">
          <button
            className="ws-mini"
            onClick={() => {
              setVariant((v) => v + 1);
              flash("Redrafted");
            }}
          >
            <RefreshCw size={14} /> Regenerate
          </button>
          <button className="ws-mini" onClick={copy} disabled={!ready}>
            <Copy size={14} /> Copy message
          </button>
          <button className="ws-log" onClick={logAsSent} disabled={!ready}>
            <Check size={14} /> Log as sent
          </button>
        </div>
      </div>
    </div>
  );
}
