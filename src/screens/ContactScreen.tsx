import { CirclePicker } from "../components/CirclePicker";
import { useRef, useState } from "react";
import { ChevronLeft, Mic, Clock, MapPin, Pencil, Plus, Sparkles } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../state/AppContext";
import { Avatar } from "../components/Avatar";
import { DraftSheet } from "../components/DraftSheet";
import { warmthOf } from "../services/warmth";
import { SOCIAL_META, socialUrl } from "../data/socials";
import { daysSince, formatDay } from "../lib/dates";
import { metAtOf } from "../lib/contacts";
import { useIsDesktop } from "../lib/useIsDesktop";
import "./ContactScreen.css";

type TouchKind = "Note" | "Coffee" | "Call";

// All three land as kind "note" touchpoints; only the summary differs.
const TOUCH_SUMMARIES: Record<TouchKind, string> = {
  Note: "You saved a note",
  Coffee: "You grabbed coffee",
  Call: "You caught up by phone",
};
const TOUCH_KINDS = Object.keys(TOUCH_SUMMARIES) as TouchKind[];

/** A logged touchpoint warms them a little; a reply would warm more. */
const TOUCHPOINT_WARMTH_BUMP = 2;

// The contact card, the single object the whole app is built around.
export function ContactScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, dispatch, flash } = useApp();
  const [draftOpen, setDraftOpen] = useState(false);
  const isDesktop = useIsDesktop();
  // On mobile, People lives at "/"; on desktop it has its own two-pane route.
  const peoplePath = isDesktop ? "/people" : "/";

  // Inline note editing.
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const noteCancelled = useRef(false);

  // Inline role/org editing behind the quiet header pencil.
  const [editingHead, setEditingHead] = useState(false);
  const [roleDraft, setRoleDraft] = useState("");
  const [orgDraft, setOrgDraft] = useState("");

  // Log a touchpoint mini-form.
  const [logOpen, setLogOpen] = useState(false);
  const [logKind, setLogKind] = useState<TouchKind>("Note");
  const [logDetail, setLogDetail] = useState("");

  const contact = state.contacts.find((c) => c.id === id);

  if (!contact) {
    return (
      <div className="screen">
        <div className="scroll">
          <button className="back" onClick={() => navigate(peoplePath)}>
            <ChevronLeft size={20} /> People
          </button>
          <div className="people-empty">We couldn't find that person.</div>
        </div>
      </div>
    );
  }

  const w = warmthOf(contact.warmth);

  const startNote = () => {
    setNoteDraft(contact.note);
    setEditingNote(true);
  };

  // Blur is the single exit: Cmd/Ctrl+Enter and Escape both route through it,
  // so save-vs-cancel is decided in exactly one place.
  const finishNote = () => {
    setEditingNote(false);
    if (noteCancelled.current) {
      noteCancelled.current = false;
      return;
    }
    const next = noteDraft.trim();
    if (next === contact.note) return;
    dispatch({ type: "UPDATE_CONTACT", contactId: contact.id, patch: { note: next } });
    flash("Note saved");
  };

  const startHead = () => {
    setRoleDraft(contact.role);
    setOrgDraft(contact.org);
    setEditingHead(true);
  };

  const saveHead = () => {
    setEditingHead(false);
    const patch = { role: roleDraft.trim(), org: orgDraft.trim() };
    if (patch.role === contact.role && patch.org === contact.org) return;
    dispatch({ type: "UPDATE_CONTACT", contactId: contact.id, patch });
    flash("Saved");
  };

  const logTouchpoint = () => {
    const at = new Date().toISOString();
    const detail = logDetail.trim();
    const base = TOUCH_SUMMARIES[logKind];
    dispatch({
      type: "ADD_INTERACTION",
      contactId: contact.id,
      interaction: {
        id: crypto.randomUUID(),
        kind: "note",
        at,
        summary: detail ? `${base}, ${detail}` : base,
      },
      warmthDelta: TOUCHPOINT_WARMTH_BUMP,
    });
    setLogOpen(false);
    setLogDetail("");
    setLogKind("Note");
    flash("Logged");
  };

  return (
    <>
      <div className="screen">
      <div className="scroll">
        <button className="back" onClick={() => navigate(peoplePath)}>
          <ChevronLeft size={20} /> People
        </button>

        <div className="detail-head">
          <Avatar contact={contact} size={82} />
          <div className="dh-name">{contact.name}</div>
          {editingHead ? (
            <form
              className="dh-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                saveHead();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingHead(false);
              }}
            >
              <input
                className="dh-input"
                value={roleDraft}
                onChange={(e) => setRoleDraft(e.target.value)}
                placeholder="Role"
                aria-label="Role"
                autoFocus
              />
              <input
                className="dh-input"
                value={orgDraft}
                onChange={(e) => setOrgDraft(e.target.value)}
                placeholder="Company"
                aria-label="Company"
              />
              {/* Enter saves; the submit button keeps that true for touch too. */}
              <button className="dh-save" type="submit">
                Save
              </button>
            </form>
          ) : (
            <div className="dh-role">
              {contact.role}
              {contact.org ? ` · ${contact.org}` : ""}
              <button
                className="dh-pencil"
                aria-label="Edit role and company"
                onClick={startHead}
              >
                <Pencil size={11} />
              </button>
            </div>
          )}
          <div
            className="warm-pill"
            style={{ color: w.c, borderColor: w.c + "44", background: w.c + "14" }}
          >
            <span className="wdot" style={{ background: w.c }} /> {w.label}
          </div>
        </div>

        <div className="metchip">
          <MapPin size={13} /> Met at {contact.met} · {formatDay(metAtOf(contact))}
        </div>

        <CirclePicker contact={contact} />

        {contact.socials.length > 0 && (
          <div className="socials">
            {contact.socials.map((s, i) => {
              const m = SOCIAL_META[s.type];
              const Icon = m.icon;
              return (
                <button
                  className="social"
                  key={i}
                  onClick={() => window.open(socialUrl(s), "_blank", "noopener,noreferrer")}
                >
                  <Icon size={15} color={m.color} />
                  <span>{s.handle}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="block">
          <div className="block-h">
            <Mic size={13} /> Notes &amp; voice memo
          </div>
          {editingNote ? (
            <textarea
              className="note-edit"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={finishNote}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.currentTarget.blur(); // save
                } else if (e.key === "Escape") {
                  noteCancelled.current = true;
                  e.currentTarget.blur(); // cancel
                }
              }}
              rows={4}
              autoFocus
            />
          ) : (
            <button className="note-view" onClick={startNote}>
              {contact.note ? (
                <span className="note">“{contact.note}”</span>
              ) : (
                <span className="note note-empty">Add a note so future you remembers.</span>
              )}
              <Pencil size={12} className="note-pencil" />
            </button>
          )}
        </div>

        <div className="block">
          <div className="block-h">
            <Clock size={13} /> History
          </div>
          {contact.interactions.map((ix) => (
            <div className="tl" key={ix.id}>
              <span className={"tl-dot" + (ix.kind === "met" ? "" : " soft")} />
              {ix.summary}
              <span className="tl-date">{formatDay(ix.at)}</span>
            </div>
          ))}
          {daysSince(contact.lastInteractionAt) > 7 && (
            <div className="tl">
              <span className="tl-dot soft" />
              No contact since
              <span className="tl-date">{formatDay(contact.lastInteractionAt)}</span>
            </div>
          )}

          {logOpen ? (
            <form
              className="log-form"
              onSubmit={(e) => {
                e.preventDefault();
                logTouchpoint();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setLogOpen(false);
                  setLogDetail("");
                }
              }}
            >
              <div className="log-kinds" role="group" aria-label="Kind of touchpoint">
                {TOUCH_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={"log-kind" + (logKind === k ? " on" : "")}
                    onClick={() => setLogKind(k)}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <input
                className="log-detail"
                value={logDetail}
                onChange={(e) => setLogDetail(e.target.value)}
                placeholder="One line, optional"
                autoFocus
              />
              <button className="log-save" type="submit">
                Log it
              </button>
            </form>
          ) : (
            <button className="log-open" onClick={() => setLogOpen(true)}>
              <Plus size={13} /> Log a touchpoint
            </button>
          )}
        </div>

        <button className="cta" onClick={() => setDraftOpen(true)}>
          <Sparkles size={16} /> Draft a follow-up
        </button>
        <div style={{ height: 24 }} />
      </div>
      </div>

      {draftOpen && <DraftSheet contact={contact} onClose={() => setDraftOpen(false)} />}
    </>
  );
}
