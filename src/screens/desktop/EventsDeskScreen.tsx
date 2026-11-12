import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Flame,
  LayoutList,
  MapPin,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../state/AppContext";
import { getEventPrep } from "../../services/eventPrep";
import { getAttendeeIntel, getEventIntel } from "../../services/eventIntel";
import { getConnectedCalendarEntries, type CalendarEntry } from "../../services/calendarSource";
import { warmthOf } from "../../services/warmth";
import { digestPastEvents, hasFollowedUp, type EventDigest } from "../../lib/events";
import { formatDay, formatWhen, isLiveNow, untilLabel } from "../../lib/dates";
import type { Contact, EventItem } from "../../types";
import { Avatar } from "../../components/Avatar";
import { DraftSheet } from "../../components/DraftSheet";
import "../EventsScreen.css"; // shares .prep and .eadd-* with the mobile screen
import "./EventsDeskScreen.css";

type Selection =
  | { kind: "event"; id: string }
  | { kind: "past"; key: string }
  | { kind: "cal"; id: string };

type Mode = "calendar" | "rooms";

/** Today as a yyyy-mm-dd value for the date input, in local time. */
function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local-time yyyy-mm-dd key for bucketing things onto calendar days. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The desktop events workspace. Two ways in: the calendar, every room and
// every connected-calendar entry on one month, and the rooms list. Either
// way, one room in full on the right, with the AI's field guide and the
// people worth finding.
export function EventsDeskScreen() {
  const { state, dispatch, flash, demo } = useApp();
  const navigate = useNavigate();

  const sorted = useMemo(
    () => [...state.events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [state.events],
  );
  const live = sorted.filter((e) => isLiveNow(e.startsAt, e.endsAt));
  const upcoming = sorted.filter(
    (e) => !isLiveNow(e.startsAt, e.endsAt) && Date.parse(e.endsAt) > Date.now(),
  );
  const past = useMemo(() => digestPastEvents(state.contacts), [state.contacts]);

  // Calendar rows come from the sample feed for the connected sources.
  const calEntries = useMemo(
    () => getConnectedCalendarEntries(state.settings.connections),
    [state.settings.connections],
  );

  const [mode, setMode] = useState<Mode>("calendar");
  const [sel, setSel] = useState<Selection | null>(null);
  const [adding, setAdding] = useState(false);

  // Resolve the selection against live data; fall back to the most pressing room.
  const selectedEvent =
    sel?.kind === "event" ? sorted.find((e) => e.id === sel.id) : undefined;
  const selectedPast = sel?.kind === "past" ? past.find((d) => d.key === sel.key) : undefined;
  const selectedCal = sel?.kind === "cal" ? calEntries.find((c) => c.id === sel.id) : undefined;
  const fallbackEvent = live[0] ?? upcoming[0];
  const shownEvent =
    selectedEvent ?? (selectedPast || selectedCal ? undefined : fallbackEvent);
  const shownPast = selectedPast;
  const shownCal = selectedCal;

  const pick = (s: Selection) => {
    setSel(s);
    setAdding(false);
  };

  const detail = adding ? (
    <AddEventPane
      onDone={(event) => {
        dispatch({ type: "ADD_EVENT", event });
        setAdding(false);
        setSel({ kind: "event", id: event.id });
        flash("On your calendar");
      }}
      onCancel={() => setAdding(false)}
    />
  ) : shownEvent ? (
    <UpcomingDetail
      event={shownEvent}
      contacts={state.contacts}
      onPerson={(c) => navigate(`/contact/${c.id}`)}
      onStart={() => navigate(`/event/${shownEvent.id}/live`)}
      removable={!demo}
      onRemove={() => {
        dispatch({ type: "REMOVE_EVENT", id: shownEvent.id });
        setSel(null);
        flash("Off your calendar");
      }}
    />
  ) : shownPast ? (
    <PastDetail digest={shownPast} onPerson={(c) => navigate(`/contact/${c.id}`)} />
  ) : shownCal ? (
    <CalendarEntryDetail
      entry={shownCal}
      contacts={state.contacts}
      onPerson={(c) => navigate(`/contact/${c.id}`)}
    />
  ) : (
    <div className="desk-empty">
      <div className="desk-empty-h">No rooms yet</div>
      <div className="desk-empty-sub">Add an event, or capture people at your next one.</div>
    </div>
  );

  return (
    <div className="desk-center">
      <div className={mode === "calendar" ? "evcal-wrap" : "duo"}>
        {mode === "calendar" ? (
          <main className="pane evcal-main">
            <MonthCalendar
              events={sorted}
              calEntries={calEntries}
              past={past}
              googleConnected={state.settings.connections.google}
              selection={adding ? null : sel ?? (shownEvent ? { kind: "event", id: shownEvent.id } : null)}
              onPick={pick}
              onMode={() => setMode("rooms")}
              onAdd={() => setAdding(true)}
              onConnect={() => navigate("/settings")}
            />
          </main>
        ) : (
          <aside className="pane pane-list">
            <RoomsList
              live={live}
              upcoming={upcoming}
              past={past}
              adding={adding}
              shownEventId={shownEvent?.id}
              shownPastKey={shownPast?.key}
              onPick={pick}
              onMode={() => setMode("calendar")}
              onAdd={() => setAdding(true)}
            />
          </aside>
        )}

        <aside className={"pane " + (mode === "calendar" ? "evcal-rail" : "pane-detail")}>
          {detail}
        </aside>
      </div>
    </div>
  );
}

// ---- the month calendar -----------------------------------------------------

interface DayItem {
  sel: Selection;
  label: string;
  cls: string;
  live?: boolean;
}

function MonthCalendar({
  events,
  calEntries,
  past,
  googleConnected,
  selection,
  onPick,
  onMode,
  onAdd,
  onConnect,
}: {
  events: EventItem[];
  calEntries: CalendarEntry[];
  past: EventDigest[];
  googleConnected: boolean;
  selection: Selection | null;
  onPick: (s: Selection) => void;
  onMode: () => void;
  onAdd: () => void;
  onConnect: () => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const todayKey = dayKey(new Date().toISOString());

  // Everything that lands on a day, bucketed by local date.
  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const push = (key: string, item: DayItem) => {
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    };
    for (const e of events) {
      push(dayKey(e.startsAt), {
        sel: { kind: "event", id: e.id },
        label: e.name,
        cls: "ev",
        live: isLiveNow(e.startsAt, e.endsAt),
      });
    }
    for (const c of calEntries) {
      push(dayKey(c.startsAt), { sel: { kind: "cal", id: c.id }, label: c.name, cls: "gcal" });
    }
    for (const d of past) {
      push(dayKey(d.at), { sel: { kind: "past", key: d.key }, label: d.name, cls: "was" });
    }
    return map;
  }, [events, calEntries, past]);

  // 6 rows × 7 days, starting on the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(month);
    first.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      return d;
    });
  }, [month]);

  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const shift = (n: number) =>
    setMonth((m) => {
      const d = new Date(m);
      d.setMonth(d.getMonth() + n);
      return d;
    });

  const isSel = (a: Selection, b: Selection | null) =>
    !!b &&
    a.kind === b.kind &&
    ((a.kind === "past" && b.kind === "past" && a.key === b.key) ||
      (a.kind !== "past" && b.kind !== "past" && a.id === b.id));

  return (
    <div className="evcal">
      <div className="evcal-head">
        <div className="evcal-title">
          <div className="h1">{monthLabel}</div>
          <div className="sub" style={{ margin: "3px 0 0" }}>
            Every room, yours and your calendar's.
          </div>
        </div>
        <div className="evcal-tools">
          {googleConnected ? (
            <span className="evcal-src">
              <span className="evcal-src-dot" /> Google Calendar
            </span>
          ) : (
            <button className="evcal-connect" onClick={onConnect}>
              Connect your calendar
            </button>
          )}
          <div className="evcal-nav">
            <button className="evcal-navb" aria-label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft size={15} />
            </button>
            <button
              className="evcal-today"
              onClick={() =>
                setMonth(() => {
                  const d = new Date();
                  d.setDate(1);
                  d.setHours(0, 0, 0, 0);
                  return d;
                })
              }
            >
              Today
            </button>
            <button className="evcal-navb" aria-label="Next month" onClick={() => shift(1)}>
              <ChevronRight size={15} />
            </button>
          </div>
          <button className="evcal-mode" onClick={onMode} title="Rooms list">
            <LayoutList size={15} />
          </button>
          <button className="add-pill" onClick={onAdd}>
            <Plus size={14} /> New event
          </button>
        </div>
      </div>

      <div className="evcal-week">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="evcal-grid">
        {cells.map((d, i) => {
          const key = dayKey(d.toISOString());
          const items = byDay.get(key) ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = key === todayKey;
          return (
            <div
              className={
                "evcal-cell" + (inMonth ? "" : " is-out") + (isToday ? " is-today" : "")
              }
              key={i}
            >
              <span className={"evcal-daynum" + (isToday ? " is-today" : "")}>
                {d.getDate()}
              </span>
              {items.slice(0, 3).map((it, j) => (
                <button
                  key={j}
                  className={
                    "cchip is-" + it.cls + (isSel(it.sel, selection) ? " on" : "")
                  }
                  onClick={() => onPick(it.sel)}
                  title={it.label}
                >
                  {it.live && <span className="cchip-live" />}
                  {it.label}
                </button>
              ))}
              {items.length > 3 && (
                <button className="cchip is-more" onClick={() => onPick(items[3].sel)}>
                  +{items.length - 3} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- the rooms list (unchanged layout, now one of two modes) ----------------

function RoomsList({
  live,
  upcoming,
  past,
  adding,
  shownEventId,
  shownPastKey,
  onPick,
  onMode,
  onAdd,
}: {
  live: EventItem[];
  upcoming: EventItem[];
  past: EventDigest[];
  adding: boolean;
  shownEventId?: string;
  shownPastKey?: string;
  onPick: (s: Selection) => void;
  onMode: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="evl">
      <div className="evl-head">
        <div className="h1">Events</div>
        <div className="evl-head-tools">
          <button className="evcal-mode" onClick={onMode} title="Calendar">
            <CalendarDays size={15} />
          </button>
          <button className="add-pill" onClick={onAdd}>
            <Plus size={14} /> New event
          </button>
        </div>
      </div>
      <div className="sub">Prep before, capture during, follow up after.</div>

      <div className="evl-scroll">
        {live.length > 0 && (
          <>
            <div className="sec-label">Happening now</div>
            {live.map((e) => (
              <button
                key={e.id}
                className={"evl-row is-live" + (!adding && shownEventId === e.id ? " on" : "")}
                onClick={() => onPick({ kind: "event", id: e.id })}
              >
                <span className="evl-live-dot" />
                <span className="evl-main">
                  <span className="evl-name">{e.name}</span>
                  <span className="evl-meta">ends {formatWhen(e.endsAt)}</span>
                </span>
              </button>
            ))}
          </>
        )}

        <div className="sec-label">Coming up</div>
        {upcoming.length === 0 && <div className="evl-empty">Nothing on the calendar yet.</div>}
        {upcoming.map((e) => (
          <button
            key={e.id}
            className={"evl-row" + (!adding && shownEventId === e.id ? " on" : "")}
            onClick={() => onPick({ kind: "event", id: e.id })}
          >
            <span className="evl-main">
              <span className="evl-name">{e.name}</span>
              <span className="evl-meta">{formatWhen(e.startsAt)}</span>
            </span>
            <span className="evl-until">{untilLabel(e.startsAt)}</span>
          </button>
        ))}

        <div className="sec-label" style={{ marginTop: 14 }}>
          Past
        </div>
        {past.map((d) => (
          <button
            key={d.key}
            className={"evl-row" + (!adding && shownPastKey === d.key ? " on" : "")}
            onClick={() => onPick({ kind: "past", key: d.key })}
          >
            <span className="evl-main">
              <span className="evl-name">{d.name}</span>
              <span className="evl-meta">{formatDay(d.at)}</span>
            </span>
            <span className="evl-count">
              {d.people.length} met
              {d.followed < d.people.length && (
                <em className="evl-open-loop">{d.people.length - d.followed} open</em>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- detail: one upcoming (or live) event, with the AI's read ---------------

function UpcomingDetail({
  event,
  contacts,
  onPerson,
  onStart,
  removable,
  onRemove,
}: {
  event: EventItem;
  contacts: Contact[];
  onPerson: (c: Contact) => void;
  onStart: () => void;
  removable: boolean;
  onRemove: () => void;
}) {
  const prep = getEventPrep(event);
  const intel = getEventIntel(event);
  const attendees = getAttendeeIntel(event, contacts);
  const liveNow = isLiveNow(event.startsAt, event.endsAt);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // A new selection resets the quiet two-tap remove.
  useEffect(() => setConfirmRemove(false), [event.id]);

  return (
    <div className="evd" key={event.id}>
      <div className="evd-kicker">{liveNow ? "Live now" : "Event"}</div>
      <h2 className="evd-name">{event.name}</h2>
      <div className="evd-meta">
        <span>
          <Calendar size={13} /> {formatWhen(event.startsAt)}
        </span>
        {event.where && (
          <span>
            <MapPin size={13} /> {event.where}
          </span>
        )}
        {!liveNow && <span className="evd-until">{untilLabel(event.startsAt)}</span>}
      </div>

      {liveNow && (
        <button className="cta" onClick={onStart}>
          <Zap size={16} /> Start event
        </button>
      )}

      <div className="prep evd-prep">
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

      <div className="evd-block">
        <div className="evd-block-h">
          <Compass size={13} /> Field guide
        </div>
        <p className="evd-scene">{intel.scene}</p>
        {intel.moves.map((m, i) => (
          <div className="evd-move" key={i}>
            <span className="evd-move-n">{i + 1}</span>
            {m}
          </div>
        ))}
        <div className="evd-spots">
          {intel.spots.map((s) => (
            <div className="evd-spot" key={s.name}>
              <MapPin size={12} />
              <span>
                <b>{s.name}</b>, {s.why}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="evd-block">
        <div className="evd-block-h">
          <Eye size={13} /> Who to look for
        </div>
        {attendees.known.length > 0 && (
          <>
            <div className="evd-sub-label">Your people in the room</div>
            <div className="evd-known">
              {attendees.known.map((c) => (
                <button className="evd-known-chip" key={c.id} onClick={() => onPerson(c)}>
                  <Avatar contact={c} size={24} />
                  {c.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="evd-sub-label">New faces worth finding</div>
        {attendees.lookFor.map((l) => (
          <div className="evd-lead" key={l.name}>
            <span className="evd-lead-init">{l.init}</span>
            <span className="evd-person-main">
              <span className="evd-person-name">{l.name}</span>
              <span className="evd-person-sub">
                {l.role} · {l.org}
              </span>
            </span>
            <span className="evd-lead-why">{l.why}</span>
          </div>
        ))}
      </div>

      {removable && (
        <button
          className={"evd-remove" + (confirmRemove ? " is-armed" : "")}
          onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
        >
          <Trash2 size={13} />
          {confirmRemove ? "Tap again to remove it" : "Remove from calendar"}
        </button>
      )}
    </div>
  );
}

// ---- detail: a connected-calendar entry --------------------------------------

function CalendarEntryDetail({
  entry,
  contacts,
  onPerson,
}: {
  entry: CalendarEntry;
  contacts: Contact[];
  onPerson: (c: Contact) => void;
}) {
  // If the entry names someone in the rolodex, surface them, the calendar
  // becomes another doorway into the relationship.
  const matched = contacts.filter((c) =>
    entry.name.toLowerCase().includes(c.name.split(" ")[0].toLowerCase()) &&
    entry.name.toLowerCase().includes(c.name.split(" ").slice(-1)[0].toLowerCase()),
  );

  return (
    <div className="evd" key={entry.id}>
      <div className="evd-kicker">
        <span className="evcal-src-dot" style={{ marginRight: 6 }} />
        Google Calendar
      </div>
      <h2 className="evd-name">{entry.name}</h2>
      <div className="evd-meta">
        <span>
          <Calendar size={13} /> {formatWhen(entry.startsAt)}
        </span>
        {entry.where && (
          <span>
            <MapPin size={13} /> {entry.where}
          </span>
        )}
        <span className="evd-until">{untilLabel(entry.startsAt)}</span>
      </div>

      {matched.length > 0 && (
        <div className="evd-block">
          <div className="evd-block-h">
            <Flame size={13} /> You're meeting
          </div>
          {matched.map((c) => {
            const w = warmthOf(c.warmth);
            return (
              <button className="evd-roster-row" key={c.id} onClick={() => onPerson(c)}>
                <Avatar contact={c} size={34} />
                <span className="evd-person-main">
                  <span className="evd-person-name">{c.name}</span>
                  <span className="evd-person-sub">
                    {c.role}
                    {c.org ? ` · ${c.org}` : ""}
                  </span>
                </span>
                <span className="evd-person-band" style={{ color: w.c }}>
                  {w.label}
                </span>
              </button>
            );
          })}
          <p className="evd-cal-hint">
            Open their card for the full history before you sit down.
          </p>
        </div>
      )}

      <p className="evd-cal-note">
        Read only from your calendar. The app never writes back.
      </p>
    </div>
  );
}

// ---- detail: one past room ---------------------------------------------------

function PastDetail({
  digest,
  onPerson,
}: {
  digest: EventDigest;
  onPerson: (c: Contact) => void;
}) {
  const [draftFor, setDraftFor] = useState<Contact | null>(null);

  const met = digest.people.length;
  const warmNow = digest.people.filter((p) => warmthOf(p.warmth).label === "Warm").length;
  const followRate = met > 0 ? Math.round((digest.followed / met) * 100) : 0;
  // Coldest first: the loop most at risk of closing for good goes on top.
  const openLoop = digest.people
    .filter((p) => !hasFollowedUp(p))
    .sort((a, b) => a.warmth - b.warmth);

  return (
    <div className="evd" key={digest.key}>
      <div className="evd-kicker">Past event</div>
      <h2 className="evd-name">{digest.name}</h2>
      <div className="evd-meta">
        <span>
          <Calendar size={13} /> {formatDay(digest.at)}
        </span>
      </div>

      <div className="evd-stats">
        <div className="evd-stat">
          <div className="evd-stat-n">{met}</div>
          <div className="evd-stat-l">met</div>
        </div>
        <div className="evd-stat">
          <div className="evd-stat-n">{digest.followed}</div>
          <div className="evd-stat-l">followed up</div>
        </div>
        <div className="evd-stat">
          <div className="evd-stat-n">{followRate}%</div>
          <div className="evd-stat-l">follow rate</div>
        </div>
        <div className="evd-stat">
          <div className="evd-stat-n is-warm">
            <Flame size={15} /> {warmNow}
          </div>
          <div className="evd-stat-l">warm now</div>
        </div>
      </div>

      {openLoop.length > 0 && (
        <div className="evd-block">
          <div className="evd-block-h">
            <Send size={13} /> Close the loop · {openLoop.length} still waiting
          </div>
          {openLoop.map((p) => {
            const w = warmthOf(p.warmth);
            return (
              <div className="evd-sweep-row" key={p.id}>
                <Avatar contact={p} size={34} />
                <button className="evd-person-main" onClick={() => onPerson(p)}>
                  <span className="evd-person-name">{p.name}</span>
                  <span className="evd-person-sub">
                    {p.role}
                    {p.org ? ` · ${p.org}` : ""}
                  </span>
                </button>
                <span className="evd-person-band" style={{ color: w.c }}>
                  {w.label}
                </span>
                <button className="evd-draft" onClick={() => setDraftFor(p)}>
                  <Sparkles size={12} /> Draft
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="evd-block">
        <div className="evd-block-h">
          <Users size={13} /> Everyone you met · {met}
        </div>
        <div className="evd-roster">
          {digest.people.map((p) => {
            const w = warmthOf(p.warmth);
            return (
              <button className="evd-roster-row" key={p.id} onClick={() => onPerson(p)}>
                <Avatar contact={p} size={30} />
                <span className="evd-person-main">
                  <span className="evd-person-name">{p.name}</span>
                  <span className="evd-person-sub">
                    {p.role}
                    {p.org ? ` · ${p.org}` : ""}
                  </span>
                </span>
                <span className="evd-person-band" style={{ color: w.c }}>
                  {w.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {draftFor && <DraftSheet contact={draftFor} onClose={() => setDraftFor(null)} />}
    </div>
  );
}

// ---- the new-event form, given the whole detail pane -------------------------

function AddEventPane({
  onDone,
  onCancel,
}: {
  onDone: (event: EventItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayValue);
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [where, setWhere] = useState("");
  const [goal, setGoal] = useState("");

  const add = () => {
    const cleanName = name.trim();
    const startsAtMs = Date.parse(`${date}T${startTime || "18:00"}`);
    if (!cleanName || Number.isNaN(startsAtMs)) return;
    let endsAtMs = Date.parse(`${date}T${endTime || ""}`);
    if (Number.isNaN(endsAtMs) || endsAtMs <= startsAtMs) {
      endsAtMs = startsAtMs + 2 * 60 * 60 * 1000;
    }
    onDone({
      id: crypto.randomUUID(),
      name: cleanName,
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(endsAtMs).toISOString(),
      where: where.trim(),
      known: 0,
      goal: goal.trim(),
      talkingPoints: [],
    });
  };

  return (
    <div className="evd">
      <div className="evd-kicker">New event</div>
      <h2 className="evd-name">Put it on the calendar</h2>
      <form
        className="eadd-form evd-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
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
          <button type="button" className="eadd-cancel" onClick={onCancel}>
            Never mind
          </button>
          <button type="submit" className="eadd-save" disabled={!name.trim()}>
            <Plus size={14} /> Add event
          </button>
        </div>
      </form>
    </div>
  );
}
