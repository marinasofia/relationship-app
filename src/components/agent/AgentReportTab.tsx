import { useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import type { Contact, PastEvent } from "../../types";
import { weekStart } from "../../services/agentGoals";
import {
  buildLocalWeeklyReport, readLocalRules, type AgentWeeklyReport,
} from "../../services/agentRules";
import "./AgentTabs.css";

interface Props {
  contacts: Contact[];
  past: PastEvent[];
  now: number;
  storageKey: string;
  goalStepsDone: number;
}

const COUNTS: { key: keyof AgentWeeklyReport["counts"]; label: string }[] = [
  { key: "drafted", label: "Drafts prepared" },
  { key: "approved", label: "Approved" },
  { key: "remindersDue", label: "Reminders due" },
  { key: "goalStepsDone", label: "Goal steps done" },
  { key: "signalsFound", label: "Moments spotted" },
];

function shiftWeek(weekOf: string, weeks: number): string {
  const d = new Date(`${weekOf}T12:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return weekStart(d.getTime());
}

export function AgentReportTab({ contacts, past, now, storageKey, goalStepsDone }: Props) {
  const current = weekStart(now);
  const [weekOf, setWeekOf] = useState(current);
  const report = useMemo(
    () => buildLocalWeeklyReport({ contacts, rules: readLocalRules(storageKey), past, goalStepsDone, weekOf, now }),
    [contacts, past, goalStepsDone, weekOf, now, storageKey],
  );

  const label = new Date(`${weekOf}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const byId = new Map(contacts.map(c => [c.id, c]));

  return <section className="agent-tab-panel" aria-label="Weekly report">
    <div className="agent-tab-head">
      <div>
        <h2>Weekly report</h2>
        <p className="agent-muted">What your agent prepared, what you approved, and where your goals stand.</p>
      </div>
      <div className="agent-week" role="group" aria-label="Choose week">
        <button className="agent-ghost" aria-label="Previous week" onClick={() => setWeekOf(shiftWeek(weekOf, -1))}><ChevronLeft size={14} /></button>
        <span>{weekOf === current ? "This week" : `Week of ${label}`}</span>
        <button className="agent-ghost" aria-label="Next week" disabled={weekOf >= current} onClick={() => setWeekOf(shiftWeek(weekOf, 1))}><ChevronRight size={14} /></button>
      </div>
    </div>
    {report && <>
        <p className="agent-report-summary">{report.summary}</p>
        <dl className="agent-counts">{COUNTS.map(c => <div key={c.key}><dt>{c.label}</dt><dd>{report.counts[c.key]}</dd></div>)}</dl>
        {report.highlights.length > 0 && <div className="agent-goal-section"><h4>Highlights</h4>
          <ul className="agent-highlights">{report.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
        {report.activity.length > 0 && <div className="agent-goal-section"><h4>Activity</h4>
          <ul className="agent-activity">{report.activity.map(a => <li key={a.id}>
            <span>{a.summary}{a.contactId && byId.get(a.contactId) && !a.summary.includes(byId.get(a.contactId)!.name) ? ` · ${byId.get(a.contactId)!.name}` : ""}</span>
            {a.createdAt && <time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</time>}
          </li>)}</ul></div>}
        {!report.highlights.length && !report.activity.length && <div className="agent-empty"><BarChart3 size={24} /><p>Nothing recorded for this week yet.</p></div>}
      </>}
  </section>;
}
