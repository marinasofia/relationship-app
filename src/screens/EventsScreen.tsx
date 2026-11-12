import { useState } from "react";
import {
  Calendar,
  Check,
  ChevronDown,
  MapPin,
  Plus,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state/AppContext";
import { getEventPrep } from "../services/eventPrep";
import { digestPastEvents } from "../lib/events";
import type { EventItem } from "../types";
import { formatDay, formatWhen, isLiveNow, untilLabel } from "../lib/dates";
import { warmthOf } from "../services/warmth";
import { Avatar } from "../components/Avatar";
import { BrandMark } from "../components/BrandMark";
import "./EventsScreen.css";

/** Today as a yyyy-mm-dd value for the date input, in local time. */
function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The events layer: prep before, capture during, follow up after.
// Live events lead, upcoming ones fold their prep open on tap, and the past
// is reconstructed from the rolodex itself, every room you've worked.
export function EventsScreen() {
  const { state, dispatch, flash } = useApp();
  const navigate = useNavigate();

  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openPast, setOpenPast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayValue);
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [where, setWhere] = useState("");
  const [goal, setGoal] = useState("");

  const sorted = [...state.events].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
  const live = sorted.filter((e) => isLiveNow(e.startsAt, e.endsAt));
  const upcoming = sorted.filter(
    (e) => !isLiveNow(e.startsAt, e.endsAt) && Date.parse(e.endsAt) > Date.now(),
  );
  const past = digestPastEvents(state.contacts);

  const closeAdd = () => {
    setAddOpen(false);
    setName("");
    setWhere("");
    setGoal("");
  };

  const addEvent = () => {
    const cleanName = name.trim();
    const startsAtMs = Date.parse(`${date}T${startTime || "18:00"}`);
    if (!cleanName || Number.isNaN(startsAtMs)) return;
    let endsAtMs = Date.parse(`${date}T${endTime || ""}`);
    // An end that's missing or before the start gets a sensible two-hour window.
    if (Number.isNaN(endsAtMs) || endsAtMs <= startsAtMs) {
      endsAtMs = startsAtMs + 2 * 60 * 60 * 1000;
    }
    const event: EventItem = {
      id: crypto.randomUUID(),
      name: cleanName,
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(endsAtMs).toISOString(),
      where: where.trim(),
      known: 0,
      goal: goal.trim(),
      talkingPoints: [],
    };
    dispatch({ type: "ADD_EVENT", event });
    closeAdd();
    flash("On your calendar");
  };

  return (
    <div className="screen">
    <div className="scroll">
      <div className="screen-brand-title"><BrandMark size={23} /><div className="h1">Events</div></div>
      <div className="sub">Prep before, capture during, follow up after.</div>

      {live.length > 0 && (
        <>
          <div className="sec-label">Happening now</div>
          {live.map((e) => {
            const prep = getEventPrep(e);
            return (
              <div className="ecard is-live" key={e.id}>
                <div className="ecard-top">
                  <div>
                    <div className="ecard-name">{e.name}</div>
                    <div className="ecard-meta">
                      <Calendar size={12} /> {formatWhen(e.startsAt)}
                      {e.where && (
                        <>
                          {" "}
                          &nbsp; <MapPin size={12} /> {e.where}
                        </>
                      )}
                    </div>
                  </div>
                  <span className="soon">live</span>
                </div>
                {prep.goal && (
                  <div className="prep-row">
                    <Check size={13} /> Goal: {prep.goal}
                  </div>
                )}
                <button className="cta" onClick={() => navigate(`/event/${e.id}/live`)}>
                  <Zap size={16} /> Start event
                </button>
              </div>
            );
          })}
        </>
      )}

      <div className="sec-label" style={live.length > 0 ? { marginTop: 20 } : undefined}>
        Coming up
      </div>
      {upcoming.length === 0 && (
        <div className="events-empty">Nothing on the calendar yet, add one below.</div>
      )}
      {upcoming.map((e) => {
        const prep = getEventPrep(e);
        const open = openId === e.id;
        return (
          <div className={"ecard is-fold" + (open ? " is-open" : "")} key={e.id}>
            <button
              className="ecard-head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : e.id)}
            >
              <div className="ecard-head-main">
                <div className="ecard-name">{e.name}</div>
                <div className="ecard-meta">
                  <Calendar size={12} /> {formatWhen(e.startsAt)}
                  {e.where && (
                    <>
                      {" "}
                      &nbsp; <MapPin size={12} /> {e.where}
                    </>
                  )}
                </div>
              </div>
              <span className="ecard-until">{untilLabel(e.startsAt)}</span>
              <ChevronDown size={15} className="ecard-chev" />
            </button>

            <div className="ecard-fold">
              <div className="ecard-fold-inner">
                <div className="prep">
                  <div className="prep-h">
                    <Sparkles size={13} /> Prep for you
                  </div>
                  <div className="prep-row">
                    <Users size={13} /> {prep.known} people you know are going
                  </div>
                  {prep.goal && (
                    <div className="prep-row">
                      <Check size={13} /> Goal: {prep.goal}
                    </div>
                  )}
                  {prep.talkingPoints.length > 0 && (
                    <div className="prep-talk">
                      {prep.talkingPoints.map((tk, i) => (
                        <span className="tk" key={i}>
                          {tk}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {addOpen ? (
        <form
          className="eadd-form"
          onSubmit={(e) => {
            e.preventDefault();
            addEvent();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeAdd();
          }}
        >
          <div className="eadd-h">
            <Calendar size={13} /> New event
          </div>
          <input
            className="eadd-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What's it called?"
            aria-label="Event name"
            autoFocus
            required
          />
          <div className="eadd-when">
            <input
              className="eadd-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              required
            />
            <input
              className="eadd-input"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-label="Starts"
              required
            />
            <input
              className="eadd-input"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-label="Ends"
            />
          </div>
          <input
            className="eadd-input"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="Where is it?"
            aria-label="Where"
          />
          <input
            className="eadd-input"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="A goal, if you have one"
            aria-label="Goal"
          />
          <div className="eadd-row">
            <button type="button" className="eadd-cancel" onClick={closeAdd}>
              Never mind
            </button>
            <button type="submit" className="eadd-save" disabled={!name.trim()}>
              <Plus size={14} /> Add event
            </button>
          </div>
        </form>
      ) : (
        <button className="eadd-open" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Add an event
        </button>
      )}

      <div className="sec-label" style={{ marginTop: 20 }}>
        Past
      </div>
      {past.map((d) => {
        const open = openPast === d.key;
        return (
          <div className={"past is-fold" + (open ? " is-open" : "")} key={d.key}>
            <button
              className="past-head"
              aria-expanded={open}
              onClick={() => setOpenPast(open ? null : d.key)}
            >
              <div>
                <div className="past-name">{d.name}</div>
                <div className="past-sub">{formatDay(d.at)}</div>
              </div>
              <div className="past-stat">
                {d.people.length} met · <b>{d.followed} followed up</b>
              </div>
              <ChevronDown size={14} className="ecard-chev" />
            </button>
            <div className="ecard-fold">
              <div className="ecard-fold-inner">
                <div className="past-people">
                  {d.people.map((p) => {
                    const w = warmthOf(p.warmth);
                    return (
                      <button
                        className="past-person"
                        key={p.id}
                        onClick={() => navigate(`/contact/${p.id}`)}
                      >
                        <Avatar contact={p} size={30} />
                        <span className="past-person-name">{p.name}</span>
                        <span className="past-person-band" style={{ color: w.c }}>
                          {w.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ height: 90 }} />
    </div>
    </div>
  );
}
