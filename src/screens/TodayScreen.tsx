import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, Clock3, Leaf, RotateCcw, Sun, X } from "lucide-react";
import { useApp } from "../state/AppContext";
import { Avatar } from "../components/Avatar";
import { isTodayHidden, normalizeTodayPreferences, rememberTodayChoice, selectTodaySuggestions, type TodaySuggestion } from "../services/today";
import type { TodayPreference } from "../types";
import "./TodayScreen.css";

export function TodayScreen() {
  const { state, dispatch, demo } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [lastChoice, setLastChoice] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", tick); };
  }, []);

  const candidates = selectTodaySuggestions({
    contacts: state.contacts, events: state.events, now, preferences: state.settings.today,
  });
  const preferences = normalizeTodayPreferences(state.settings.today);
  const visible = candidates.filter(item => !isTodayHidden(item.key, preferences, now));
  const hiddenCount = candidates.length - visible.length;
  const choose = (item: TodaySuggestion, action: TodayPreference["action"]) => {
    dispatch({ type: "UPDATE_SETTINGS", patch: { today: rememberTodayChoice(preferences, item.key, action, now) } });
    setLastChoice(item.key);
    setNotice(action === "snoozed" ? "Set aside until tomorrow at 9 AM, your local time." : "Suggestion dismissed. We'll leave room for something new.");
  };
  const undo = () => {
    dispatch({ type: "UPDATE_SETTINGS", patch: { today: preferences.filter(p => p.key !== lastChoice) } });
    setLastChoice(null); setNotice("Suggestion restored.");
  };
  const firstName = state.settings.name.trim().split(" ")[0];
  const greeting = new Date(now).getHours() < 12 ? "Good morning" : new Date(now).getHours() < 18 ? "Good afternoon" : "Good evening";

  return <div className="today-screen">
    <header className="today-header">
      <div className="today-eyebrow"><Sun size={16} /><span>{new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div>
      <h1>Today</h1>
      <p>{greeting}{firstName && firstName !== "Demo" ? `, ${firstName}` : ""}. A little attention goes a long way.</p>
    </header>

    <div className="today-layout">
      <section className="today-main" aria-label="Today's suggestions">
        <div className="today-section-heading"><h2>Your next small steps</h2><span>{`${visible.length} suggestion${visible.length === 1 ? "" : "s"}`}</span></div>
        {demo && <p className="today-demo-note">Sample network. Try the actions here; demo choices reset on refresh.</p>}
        <div className="today-notice" role="status" aria-live="polite">{notice && <><Check size={16} /><span>{notice}</span>{lastChoice && <button onClick={undo}>Undo</button>}</>}</div>
        {visible.length ? <div className="today-actions">{visible.map((item, index) => <SuggestionCard key={item.key} item={item} index={index} choose={choose} />)}</div>
          : <div className="today-empty"><Check size={28} /><h3>{hiddenCount ? "A little breathing room." : "You're all caught up."}</h3><p>{hiddenCount ? "Your choices are remembered. Snoozed suggestions return tomorrow if they're still relevant." : "Nothing needs your attention right now. Add people, record a conversation, or save an upcoming event to give the app more to work with."}</p><Link to="/people">Explore your people <ArrowRight size={16} /></Link></div>}
        {hiddenCount > 0 && visible.length > 0 && <p className="today-set-aside">{hiddenCount} set aside. No extra suggestions to fill the space.</p>}
        {preferences.length > 0 && <details className="today-preferences"><summary>Manage hidden suggestions</summary><p>Bring back suggestions you previously snoozed or dismissed. Only suggestions that are still relevant will return.</p><button onClick={() => { dispatch({ type: "UPDATE_SETTINGS", patch: { today: [] } }); setNotice("Hidden suggestions restored where still relevant."); setLastChoice(null); }}><RotateCcw size={14} /> Restore suggestions</button></details>}
      </section>

      <aside className="today-aside">
        <div className="today-note"><div className="today-note-icon"><Leaf size={26} /></div><h2>Small gestures.<br />Lasting connections.</h2><p>A check-in, a next step, a little preparation. You don't need to do it all today.</p><div className="today-note-rule" /><span>Picked from recorded interactions and upcoming events.</span></div>
        <div className="today-links"><Link to="/people">Your people <ArrowRight size={16} /></Link><Link to="/events">Your events <ArrowRight size={16} /></Link><Link to="/settings">Settings <ArrowRight size={16} /></Link></div>
        <p className="today-storage-note">Demo choices stay in this session.</p>
      </aside>
    </div>
  </div>;
}

function SuggestionCard({ item, index, choose }: {
  item: TodaySuggestion; index: number; choose: (item: TodaySuggestion, action: TodayPreference["action"]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = item.kind === "event" ? "A little preparation" : "Make a little time";
  return <article className={`today-action${index === 0 ? " today-action-first" : ""}`} aria-label={item.title}>
    <div className="today-action-top"><span className="today-kind">{label}</span><span className="today-number">0{index + 1}</span></div>
    <div className="today-person">{item.contact ? <Avatar contact={item.contact} size={40} /> : <div className="today-event-icon"><CalendarDays size={24} /></div>}<div><h3>{item.title}</h3>{item.contact && <p>{[item.contact.role, item.contact.org].filter(Boolean).join(" · ")}</p>}</div></div>
    <p className="today-reason">{item.reason}</p>
    <div className="today-evidence">{item.evidence} · {new Date(item.sourceAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
    <div className="today-action-buttons">
      {item.contact ? <Link className="today-primary" to={`/contact/${encodeURIComponent(item.contact.id)}`}>Open contact <ArrowRight size={15} /></Link> : <button className="today-primary" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? "Close details" : "View event"}<ArrowRight size={15} /></button>}
      <button onClick={() => choose(item, "snoozed")}><Clock3 size={15} /> Tomorrow</button>
      <button className="today-dismiss" onClick={() => choose(item, "dismissed")}><X size={15} /> Dismiss</button>
    </div>
    {expanded && item.event && <div className="today-event-details"><p><strong>When</strong>{new Date(item.event.startsAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</p>{item.event.where && <p><strong>Where</strong>{item.event.where}</p>}{item.event.goal && <p><strong>Your goal</strong>{item.event.goal}</p>}<Link to="/events">Open your events <ArrowRight size={14} /></Link></div>}
  </article>;
}
