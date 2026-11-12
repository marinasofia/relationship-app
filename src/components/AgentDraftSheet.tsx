import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, MessageCircle, Sparkles, Trash2, X } from "lucide-react";
import type { Contact } from "../types";
import { draftMailto } from "../services/followup";
import {
  buildLocalDraft, messagesHandoff,
  type AgentDraft, type AgentDraftChannel,
} from "../services/agent";
import { useApp } from "../state/AppContext";
import { EXIT_MS } from "../lib/useExit";
import "./DraftSheet.css";

interface AgentDraftSheetProps {
  contact: Contact;
  /** A draft the agent already wrote (from chat); otherwise one is requested. */
  draft?: AgentDraft;
  intent?: string;
  channel?: AgentDraftChannel;
  onClose: () => void;
  onResolved?: (draft: AgentDraft) => void;
}

// Approval sheet for agent-written drafts. Nothing is sent by the app: the
// user approves, then hands the text to Mail or Messages, or copies it.
export function AgentDraftSheet(props: AgentDraftSheetProps) {
  return <AgentDraftComposer key={`${props.contact.id}:${props.draft?.id ?? props.intent ?? ""}`} {...props} />;
}

function AgentDraftComposer({ contact, draft: given, intent, channel, onClose, onResolved }: AgentDraftSheetProps) {
  const { dispatch, flash } = useApp();
  const [draft, setDraft] = useState<AgentDraft | null>(given ?? null);
  const [subject, setSubject] = useState(given?.subject ?? "");
  const [body, setBody] = useState(given?.body ?? "");
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(given?.state === "APPROVED");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(given?.state === "SENT");
  const savingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wanted = channel ?? given?.channel ?? (contact.email ? "EMAIL" : "IMESSAGE");
  // Keep a stable capture of the person while the approval sheet is open.
  const contactRef = useRef(contact);
  const contactId = contact.id;

  useEffect(() => {
    if (given) return;
    let alive = true;
    const person = contactRef.current;
    const why = intent?.trim() || `A short, warm check-in with ${person.name.split(" ")[0]}`;
    const result = buildLocalDraft(person, why, wanted);
    if (!alive) return;
    setDraft(result); setBody(result.body); setSubject(result.subject ?? "");
    return () => { alive = false; };
  }, [given, intent, contactId, wanted]);

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

  const ready = draft !== null && body.trim().length > 0;

  // A handoff is not outreach. Approval must be durable before reporting it;
  // only the user's separate sent confirmation changes contact activity.
  const approve = async (): Promise<boolean> => {
    if (!draft || !ready || savingRef.current || sent) return false;
    if (approved) return true;
    savingRef.current = true; setSaving(true); setError("");
    try {
      setApproved(true);
      const resolved: AgentDraft = { ...draft, body, subject: subject || undefined, state: "APPROVED" };
      setDraft(resolved); onResolved?.(resolved);
      flash("Approved. Send it from Mail or Messages.");
      return true;
    } catch {
      setError("Couldn't save the approval. Your edits are still here; try again.");
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  };

  const confirmSent = async () => {
    if (!draft || !approved || savingRef.current || sent) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      setSent(true);
      dispatch({ type: "ADD_INTERACTION", contactId: contact.id, interaction: {
        id: draft.id.startsWith("local-draft:") ? crypto.randomUUID() : draft.id,
        kind: "followup", at: new Date().toISOString(), summary: "You reported sending an agent-drafted message",
      } });
      onResolved?.({ ...draft, state: "SENT" });
      flash("Marked as sent");
    } catch { setError("Couldn't record that you sent it. Try again."); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const discard = async () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      if (draft) {
        onResolved?.({ ...draft, state: "DISCARDED" });
      }
      close();
    } catch { setError("Couldn't discard the draft. Try again."); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const copy = async () => {
    if (!ready) return;
    try { await navigator.clipboard.writeText(body); flash("Copied"); }
    catch { flash("Couldn't copy"); }
  };

  const mailto = ready ? draftMailto(contact.email, subject || "Catching up", body) : null;
  const messages = ready ? messagesHandoff(body) : null;

  return (
    <div className={"sheet-bg agent-sheet-bg" + (closing ? " is-out" : "")} onClick={close}>
      <div className="sheet agent-sheet" role="dialog" aria-modal="true" aria-label={`Review the agent's draft to ${contact.name}`}
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
        <div className="sheet-h"><Sparkles size={15} /> Your agent's draft to {contact.name}
          <button className="draft-close" aria-label="Close draft" onClick={close}><X size={18} /></button>
        </div>
        {draft && <p className="draft-help">{draft.intent}</p>}
        {error && <p role="alert">{error}</p>}
        {draft === null ? (!error && <p role="status" className="draft is-pending">Writing a draft in your voice…</p>) : <>
          {draft.channel === "EMAIL" && <input disabled={saving || sent} className="draft agent-draft-subject" aria-label="Subject" value={subject} maxLength={200}
            onChange={(event) => { setSubject(event.target.value); setApproved(false); }} />}
          <textarea disabled={saving || sent} className="draft draft-editor" aria-label="Your message" value={body} maxLength={8000}
            onChange={(event) => { setBody(event.target.value); setApproved(false); }} />
        </>}
        <div className="sheet-row">
          {!approved && <button className="mini agent-approve" onClick={() => { void approve(); }} disabled={!ready || saving || sent}><Check size={14} /> {saving ? "Saving…" : "Approve draft"}</button>}
          {approved && !sent && mailto && <a className="mini agent-approve" href={mailto}><Mail size={14} /> Open in Mail</a>}
          {approved && !sent && messages && <a className="mini agent-approve" href={messages}><MessageCircle size={14} /> Open in Messages</a>}
          <button className="mini" onClick={() => { void copy(); }} disabled={!ready || !approved || saving || sent}><Copy size={14} /> Copy</button>
          {approved && <button className="mini primary" onClick={() => { void confirmSent(); }} disabled={saving || sent}><Check size={14} /> {sent ? "Marked as sent" : "I sent it"}</button>}
          <button className="mini" onClick={() => { void discard(); }} disabled={saving || sent || (draft === null && !error)}><Trash2 size={14} /> Discard</button>
        </div>
        <p className="draft-help">
          {approved ? <><Check size={13} /> Approved. </> : null}
          The app never sends this for you. Save your approval, then open Mail or Messages and choose to send it.
        </p>
      </div>
    </div>
  );
}
