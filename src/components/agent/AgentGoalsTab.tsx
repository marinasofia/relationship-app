import { useState, type FormEvent } from "react";
import { Check, Flag, PenLine, Plus, RefreshCw, SkipForward, Target } from "lucide-react";
import type { Contact } from "../../types";
import { Avatar } from "../Avatar";
import { AgentError } from "../../services/agent";
import {
  GOAL_DETAIL_MAX, GOAL_TITLE_MAX, MAX_ACTIVE_GOALS, buildLocalGoalPlan, newLocalGoal, validateGoalInput, weekStart,
  type AgentGoal, type AgentGoalInput, type AgentGoalState, type AgentGoalStepState,
} from "../../services/agentGoals";
import "./AgentTabs.css";

interface Props {
  contacts: Contact[];
  now: number;
  localGoals: AgentGoal[];
  onLocalGoals: (goals: AgentGoal[]) => void;
  onDraft: (contact: Contact, intent: string) => void;
}

const EMPTY: AgentGoalInput = { title: "", detail: "", targetDate: "" };
const FIT_LABEL = { HIGH: "Strong fit", MEDIUM: "Good fit", LOW: "Could know someone" } as const;

const message = (cause: unknown, fallback: string) => cause instanceof AgentError ? cause.message : fallback;

export function AgentGoalsTab({ contacts, now, localGoals, onLocalGoals, onDraft }: Props) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<AgentGoalInput | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const weekOf = weekStart(now);
  const goals = localGoals;
  const byId = new Map(contacts.map(c => [c.id, c]));
  const activeCount = goals.filter(g => g.state === "ACTIVE").length;

  const replace = (goal: AgentGoal) => {
    onLocalGoals(localGoals.some(g => g.id === goal.id) ? localGoals.map(g => g.id === goal.id ? goal : g) : [goal, ...localGoals]);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    const invalid = validateGoalInput(editing);
    if (invalid) { setFormError(invalid); return; }
    if (!editing.id && activeCount >= MAX_ACTIVE_GOALS) { setFormError(`You can have up to ${MAX_ACTIVE_GOALS} active goals. Finish or archive one first.`); return; }
    setBusy("form"); setFormError("");
    try {
      const existing = localGoals.find(g => g.id === editing.id);
      replace(existing
        ? { ...existing, title: editing.title.trim(), detail: editing.detail.trim() || null, targetDate: editing.targetDate || null }
        : newLocalGoal(editing));
      setEditing(null);
      setNotice(editing.id ? "Goal updated." : "Goal saved. Plan this week to see who can help.");
    } catch (cause) { setFormError(message(cause, "Couldn't save your goal. Try again.")); } finally { setBusy(null); }
  };

  const plan = async (goal: AgentGoal) => {
    if (busy) return;
    setBusy(goal.id); setNotice(""); setError("");
    try {
      replace(buildLocalGoalPlan(goal, contacts, weekOf, Date.now()));
      setNotice(`This week's plan for “${goal.title}” is ready.`);
    } catch (cause) { setError(message(cause, "Your agent couldn't plan that goal. Try again.")); } finally { setBusy(null); }
  };

  const setState = async (goal: AgentGoal, state: AgentGoalState) => {
    if (busy) return;
    if (state === "ACTIVE" && activeCount >= MAX_ACTIVE_GOALS) { setError(`You can have up to ${MAX_ACTIVE_GOALS} active goals.`); return; }
    setBusy(goal.id);
    try {
      replace({ ...goal, state });
      setNotice(state === "ACHIEVED" ? "Congratulations! Goal marked achieved." : state === "ARCHIVED" ? "Goal archived." : "Goal is active again.");
    } catch (cause) { setError(message(cause, "Couldn't update that goal.")); } finally { setBusy(null); }
  };

  const setStep = async (goal: AgentGoal, stepId: string, state: AgentGoalStepState) => {
    if (busy) return;
    setBusy(stepId);
    try {
      replace({ ...goal, steps: goal.steps.map(s => s.id === stepId ? { ...s, state } : s) });
    } catch (cause) { setError(message(cause, "Couldn't update that step.")); } finally { setBusy(null); }
  };

  const ordered = [...goals].sort((a, b) => Number(b.state === "ACTIVE") - Number(a.state === "ACTIVE"));

  return <section className="agent-tab-panel" aria-label="Goals">
    <div className="agent-tab-head">
      <div>
        <h2>Your goals</h2>
        <p className="agent-muted">Tell your agent what you're working toward. Each week it maps your people to the goal and suggests a few concrete steps.</p>
      </div>
      {!editing && <button className="agent-primary agent-small" onClick={() => { setEditing(EMPTY); setFormError(""); }}
        disabled={activeCount >= MAX_ACTIVE_GOALS}><Plus size={14} /> New goal</button>}
    </div>
    {activeCount >= MAX_ACTIVE_GOALS && !editing && <p className="agent-muted">You have {MAX_ACTIVE_GOALS} active goals, the most at once.</p>}
    <div className="agent-notice" role="status" aria-live="polite">{notice}</div>
    {error && <p className="agent-error-line" role="alert">{error}</p>}

    {editing && <form className="agent-form" onSubmit={save} aria-label={editing.id ? "Edit goal" : "New goal"}>
      <label htmlFor="goal-title">Goal</label>
      <input id="goal-title" value={editing.title} maxLength={GOAL_TITLE_MAX} placeholder="e.g. Move into product management by spring"
        onChange={e => setEditing({ ...editing, title: e.target.value })} />
      <label htmlFor="goal-detail">Details <span className="agent-muted">(optional)</span></label>
      <textarea id="goal-detail" rows={3} value={editing.detail} maxLength={GOAL_DETAIL_MAX}
        placeholder="What would success look like? Any companies, people or skills in mind?"
        onChange={e => setEditing({ ...editing, detail: e.target.value })} />
      <label htmlFor="goal-date">Target date <span className="agent-muted">(optional)</span></label>
      <input id="goal-date" type="date" value={editing.targetDate} onChange={e => setEditing({ ...editing, targetDate: e.target.value })} />
      {formError && <p className="agent-error-line" role="alert">{formError}</p>}
      <div className="agent-form-actions">
        <button type="submit" className="agent-primary agent-small" disabled={busy === "form"}>{editing.id ? "Save changes" : "Save goal"}</button>
        <button type="button" className="agent-ghost" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </form>}

    {!ordered.length && !editing ? <div className="agent-empty"><Target size={24} /><p>No goals yet. Try “Meet three people in climate tech” or “Land a product role”.</p></div>
        : <div className="agent-cards">{ordered.map(goal => {
          const thisWeek = goal.steps.filter(s => s.weekOf === weekOf);
          return <article key={goal.id} className={`agent-card agent-goal state-${goal.state.toLowerCase()}`} aria-label={goal.title}>
            <div className="agent-card-top">
              <span className="agent-kind"><Flag size={14} /> {goal.state === "ACTIVE" ? "Active goal" : goal.state === "ACHIEVED" ? "Achieved" : "Archived"}</span>
              {goal.targetDate && <span className="agent-due">By {new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>}
            </div>
            <h3>{goal.title}</h3>
            {goal.detail && <p className="agent-goal-detail">{goal.detail}</p>}

            {goal.people.length > 0 && <div className="agent-goal-section">
              <h4>Who can help</h4>
              <ul className="agent-people">{goal.people.map(person => {
                const contact = byId.get(person.contactId);
                if (!contact) return null;
                return <li key={person.contactId}>
                  <Avatar contact={contact} size={32} />
                  <div><strong>{contact.name}</strong> <span className={`agent-fit fit-${person.fit.toLowerCase()}`}>{FIT_LABEL[person.fit]}</span>
                    <p>{person.why}</p></div>
                </li>;
              })}</ul>
            </div>}

            {thisWeek.length > 0 && <div className="agent-goal-section">
              <h4>This week</h4>
              <ul className="agent-steps">{thisWeek.map(step => {
                const contact = step.contactId ? byId.get(step.contactId) : undefined;
                return <li key={step.id} className={`agent-step state-${step.state.toLowerCase()}`}>
                  <div><p className="agent-step-action">{step.action}</p>{step.rationale && <p className="agent-muted">{step.rationale}</p>}</div>
                  {step.state === "OPEN" ? <div className="agent-step-actions">
                    {contact && step.draftIntent && <button className="agent-primary agent-small" onClick={() => onDraft(contact, step.draftIntent!)}><PenLine size={13} /> Draft</button>}
                    <button className="agent-ghost" disabled={busy === step.id} onClick={() => void setStep(goal, step.id, "DONE")} aria-label={`Mark done: ${step.action}`}><Check size={13} /> Done</button>
                    <button className="agent-ghost agent-dismiss" disabled={busy === step.id} onClick={() => void setStep(goal, step.id, "SKIPPED")} aria-label={`Skip: ${step.action}`}><SkipForward size={13} /> Skip</button>
                  </div> : <span className="agent-step-state">{step.state === "DONE" ? "Done" : "Skipped"}</span>}
                </li>;
              })}</ul>
            </div>}

            <div className="agent-card-actions">
              {goal.state === "ACTIVE" && <button className="agent-primary agent-small" disabled={busy === goal.id} onClick={() => void plan(goal)}>
                <RefreshCw size={13} className={busy === goal.id ? "agent-spin" : undefined} /> {thisWeek.length ? "Re-plan this week" : "Plan this week"}</button>}
              {goal.state === "ACTIVE" && <button className="agent-ghost" onClick={() => { setEditing({ id: goal.id, title: goal.title, detail: goal.detail ?? "", targetDate: goal.targetDate ?? "" }); setFormError(""); }}>Edit</button>}
              {goal.state === "ACTIVE" && <button className="agent-ghost" disabled={busy === goal.id} onClick={() => void setState(goal, "ACHIEVED")}>Achieved</button>}
              {goal.state === "ACTIVE" ? <button className="agent-ghost agent-dismiss" disabled={busy === goal.id} onClick={() => void setState(goal, "ARCHIVED")}>Archive</button>
                : <button className="agent-ghost" disabled={busy === goal.id} onClick={() => void setState(goal, "ACTIVE")}>Reactivate</button>}
            </div>
          </article>;
        })}</div>}
  </section>;
}
