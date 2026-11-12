import { CalendarDays, Flag, MessageSquareText, PenLine } from "lucide-react";
import type { Contact, EventItem } from "../../types";
import { Avatar } from "../Avatar";
import { buildLocalMeetingPrep } from "../../services/agentRepresent";
import { AgentSheet } from "./AgentSheet";

interface Props {
  eventId: string;
  events: EventItem[];
  contacts: Contact[];
  goalTitles: string[];
  onClose: () => void;
  onDraft: (contact: Contact, intent: string) => void;
}

function relative(iso: string | null): string {
  if (!iso) return "No recorded contact yet";
  const days = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  return days === 0 ? "In touch today" : days === 1 ? "Last in touch yesterday" : `Last in touch ${days} days ago`;
}

export function MeetingPrepSheet({ eventId, events, contacts, goalTitles, onClose, onDraft }: Props) {
  const localEvent = events.find(e => e.id === eventId);
  const prep = localEvent ? buildLocalMeetingPrep(localEvent, contacts, goalTitles) : null;
  const error = localEvent ? "" : "That event is no longer on your calendar.";

  const byId = new Map(contacts.map(c => [c.id, c]));
  const when = prep?.startsAt && Number.isFinite(Date.parse(prep.startsAt))
    ? new Date(prep.startsAt).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

  return <AgentSheet label={prep ? `Prep for ${prep.title}` : "Meeting prep"} icon={<CalendarDays size={15} />} onClose={onClose}>
    {error ? <p role="alert" className="agent-error-line">{error}</p>
      : prep && <div className="agent-prep">
          {when && <p className="agent-muted">{when}</p>}
          <div className="agent-goal-section">
            <h4>Who you'll see</h4>
            {prep.people.length === 0 ? <p className="agent-muted">No one from your network is linked to this yet.</p>
              : <ul className="agent-people">{prep.people.map(person => {
                const contact = byId.get(person.contactId);
                if (!contact) return null;
                return <li key={person.contactId}>
                  <Avatar contact={contact} size={32} />
                  <div>
                    <strong>{contact.name}</strong>
                    <p className="agent-muted">{relative(person.lastTouch)}</p>
                    {person.openItems.length > 0 && <ul className="agent-prep-items">{person.openItems.map((item, i) => <li key={i}>{item}</li>)}</ul>}
                    <button className="agent-ghost agent-small" onClick={() => onDraft(contact, `A short note to ${contact.name.split(" ")[0]} before ${prep.title}`)}>
                      <PenLine size={13} /> Draft a note
                    </button>
                  </div>
                </li>;
              })}</ul>}
          </div>
          {prep.talkingPoints.length > 0 && <div className="agent-goal-section">
            <h4><MessageSquareText size={13} /> Talking points</h4>
            <ul className="agent-highlights">{prep.talkingPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>
          </div>}
          {prep.goalLinks.length > 0 && <div className="agent-goal-section">
            <h4><Flag size={13} /> Ties to your goals</h4>
            <ul className="agent-highlights">{prep.goalLinks.map((link, i) => <li key={i}>{link}</li>)}</ul>
          </div>}
        </div>}
  </AgentSheet>;
}
