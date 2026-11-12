import { CirclePicker } from "../../components/CirclePicker";
import { useState } from "react";
import { Clock, MapPin, Mic, Sparkles, X } from "lucide-react";
import type { Contact } from "../../types";
import { Avatar } from "../../components/Avatar";
import { DraftSheet } from "../../components/DraftSheet";
import { warmthOf } from "../../services/warmth";
import { SOCIAL_META, socialUrl } from "../../data/socials";
import { daysSince, formatDay } from "../../lib/dates";
import { metAtOf } from "../../lib/contacts";
import "../ContactScreen.css";
import "./ContactPanel.css";

interface ContactPanelProps {
  contact: Contact;
  /** true while the tree keeps the panel mounted for its exit beat */
  closing?: boolean;
  onClose: () => void;
}

// The contact card, slid in beside the memory tree. Same sections as the full
// ContactScreen, avatar and warmth, met chip, socials, notes, history and
// draft, so a node click lands on the
// exact card you already know. Escape lives with the tree (which owns focus
// mode), so close order stays sensible.
export function ContactPanel({ contact, closing = false, onClose }: ContactPanelProps) {
  const [draftOpen, setDraftOpen] = useState(false);
  const w = warmthOf(contact.warmth);
  const out = closing ? " is-out" : "";

  return (
    <>
      <div className={"cpanel-scrim" + out} onClick={onClose} />
      <aside className={"cpanel" + out} onClick={(e) => e.stopPropagation()}>
        <button className="cpanel-x" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="cpanel-scroll">
          <div className="detail-head">
            <Avatar contact={contact} size={82} />
            <div className="dh-name">{contact.name}</div>
            <div className="dh-role">
              {contact.role}
              {contact.org ? ` · ${contact.org}` : ""}
            </div>
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
            <p className="note">“{contact.note}”</p>
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
          </div>

          <button className="cta" onClick={() => setDraftOpen(true)}>
            <Sparkles size={16} /> Draft a follow-up
          </button>
          <div style={{ height: 20 }} />
        </div>

        {draftOpen && <DraftSheet contact={contact} onClose={() => setDraftOpen(false)} />}
      </aside>
    </>
  );
}
