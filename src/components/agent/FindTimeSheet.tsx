import { useState, type FormEvent } from "react";
import { CalendarClock, PenLine } from "lucide-react";
import type { Contact, EventItem } from "../../types";
import type { AgentDraft } from "../../services/agent";
import {
  DURATION_BOUNDS, WITHIN_DAYS_BOUNDS, buildLocalTimesDraft, formatSlot, localFreeSlots,
  validateTimesRequest, type AgentTimesProposal,
} from "../../services/agentRepresent";
import { AgentSheet } from "./AgentSheet";

interface Props {
  contacts: Contact[];
  /** Pre-selected when opened from a person's card. */
  contactId?: string;
  events: EventItem[];
  onClose: () => void;
  onDraft: (contact: Contact, draft: AgentDraft) => void;
}

// "Find a time": proposes weekday slots around the saved events, then writes a
// message offering them for you to approve.
export function FindTimeSheet({ contacts, contactId, events, onClose, onDraft }: Props) {
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
  const [who, setWho] = useState(contactId ?? "");
  const [duration, setDuration] = useState(30);
  const [within, setWithin] = useState(7);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<AgentTimesProposal | null>(null);
  const contact = contacts.find(c => c.id === who);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!contact) return;
    const invalid = validateTimesRequest(duration, within);
    if (invalid) { setError(invalid); return; }
    setError("");
    const slots = localFreeSlots(events, Date.now(), duration, within);
    setProposal({
      slots, reason: slots.length ? null : "NO_SLOTS",
      draft: slots.length ? buildLocalTimesDraft(contact, slots, duration, contact.email ? "EMAIL" : "IMESSAGE") : null,
    });
  };

  return <AgentSheet label="Find a time" icon={<CalendarClock size={15} />} onClose={onClose}>
    <form className="agent-form agent-find-time" onSubmit={submit}>
      <label>With
        <select value={who} onChange={e => { setWho(e.target.value); setProposal(null); }} required>
          <option value="" disabled>Choose someone</option>
          {sorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="agent-find-time-row">
        <label>Minutes
          <input type="number" min={DURATION_BOUNDS.min} max={DURATION_BOUNDS.max} step={15} value={duration}
            onChange={e => setDuration(Number(e.target.value))} />
        </label>
        <label>Within days
          <input type="number" min={WITHIN_DAYS_BOUNDS.min} max={WITHIN_DAYS_BOUNDS.max} value={within}
            onChange={e => setWithin(Number(e.target.value))} />
        </label>
      </div>
      <div className="agent-form-actions">
        <button type="submit" className="agent-primary agent-small" disabled={!contact}>Find times</button>
      </div>
    </form>
    <p className="draft-help">Uses the events saved in the app. Weekdays, 9am to 6pm.</p>
    {error && <p role="alert" className="agent-error-line">{error}</p>}
    {proposal && <div className="agent-goal-section" aria-live="polite">
      {proposal.slots.length === 0 ? <p className="agent-muted">
        {proposal.reason === "NO_CALENDAR" ? "Connect your Google Calendar in Settings so your agent can see when you're free."
          : "No open weekday slots in that window. Try looking further ahead."}</p>
        : <>
          <h4>Times that work for you</h4>
          <ul className="agent-slots">{proposal.slots.map(slot => <li key={slot.start}>{formatSlot(slot)}</li>)}</ul>
          {proposal.draft && contact && <button className="agent-primary agent-small" onClick={() => onDraft(contact, proposal.draft!)}>
            <PenLine size={14} /> Review the message
          </button>}
        </>}
    </div>}
  </AgentSheet>;
}
