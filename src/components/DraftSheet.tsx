import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, RefreshCw, Sparkles, X } from "lucide-react";
import type { Contact } from "../types";
import { draftFollowup, draftMailto, OUTREACH_GOALS, outreachSubject, type OutreachGoal } from "../services/followup";
import { useApp } from "../state/AppContext";
import { EXIT_MS } from "../lib/useExit";
import "./DraftSheet.css";

interface DraftSheetProps { contact: Contact; onClose: () => void }

export function DraftSheet(props: DraftSheetProps) {
  // A different recipient must never inherit edited text or sent confirmation.
  return <DraftComposer key={props.contact.id} {...props} />;
}

function DraftComposer({ contact, onClose }: DraftSheetProps) {
  const { dispatch, flash } = useApp();
  const [goal, setGoal] = useState<OutreachGoal>("coffee");
  const [variant, setVariant] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setDraft(null);
    setConfirmed(false);
    setError("");
    void draftFollowup(contact, variant, goal).then((text) => {
      if (alive) setDraft(text);
    }).catch(() => {
      if (alive) setError("Couldn't prepare the draft. Try again.");
    });
    return () => { alive = false; };
  }, [contact, variant, goal]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  const ready = draft !== null && draft.trim().length > 0;
  const logAsSent = () => {
    if (!ready || !confirmed || closingRef.current) return;
    const at = new Date().toISOString();
    dispatch({
      type: "ADD_INTERACTION",
      contactId: contact.id,
      interaction: {
        id: crypto.randomUUID(), kind: "followup", at,
        summary: `You marked a ${OUTREACH_GOALS[goal].toLowerCase()} message as sent (self-reported)`,
      },
      // Sending is an action, not evidence of a reply or relationship improvement.
    });
    close();
    flash("Logged as sent by you");
  };

  const copy = async () => {
    if (!ready) return;
    try { await navigator.clipboard.writeText(draft); flash("Copied"); }
    catch { flash("Couldn't copy"); }
  };
  const mailto = ready ? draftMailto(contact.email, outreachSubject(goal), draft) : null;

  return (
    <div className={"sheet-bg" + (closing ? " is-out" : "")} onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Prepare outreach to ${contact.name}`}
        tabIndex={-1} ref={dialogRef} onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key !== "Tab") return;
          const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea:not(:disabled)');
          if (!nodes?.length) return;
          const first = nodes[0]; const last = nodes[nodes.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }}>
        <div className="sheet-grab" />
        <div className="sheet-h"><Sparkles size={15} /> Prepare your next step
          <button className="draft-close" aria-label="Close draft" onClick={close}><X size={18} /></button>
        </div>
        <label className="draft-goal">Your goal with {contact.name}
          <select value={goal} onChange={(event) => setGoal(event.target.value as OutreachGoal)}>
            {Object.entries(OUTREACH_GOALS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p className="draft-help">A starting template using your contact details. Review it against your conversation and edit it to sound like you.</p>
        {error ? <p role="alert">{error}</p> : draft === null ? <p role="status">Preparing draft…</p> :
          <textarea className="draft draft-editor" aria-label="Your message" value={draft} maxLength={4000}
            onChange={(event) => { setDraft(event.target.value); setConfirmed(false); }} />}
        <div className="sheet-row">
          <button className="mini" onClick={() => setVariant((value) => value + 1)}><RefreshCw size={14} /> Reset draft</button>
          <button className="mini" onClick={copy} disabled={!ready}><Copy size={14} /> Copy</button>
          {mailto && <a className="mini" href={mailto}><Mail size={14} /> Open in Mail</a>}
        </div>
        <p className="draft-help">Copy or open in Mail to send it yourself. The app does not send this message.</p>
        <label className="draft-confirm"><input type="checkbox" checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)} /> I sent this message outside the app</label>
        <button className="send draft-log" onClick={logAsSent} disabled={!ready || !confirmed || closing}>
          <Check size={14} /> Log as sent
        </button>
      </div>
    </div>
  );
}
