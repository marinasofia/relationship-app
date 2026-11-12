import { useMemo, useState, type FormEvent } from "react";
import { BellRing, PenLine, Play, Plus, Repeat, Trash2 } from "lucide-react";
import type { Contact, PastEvent } from "../../types";
import { AgentError, type AgentDraft } from "../../services/agent";
import {
  MAX_KEEP_IN_TOUCH_CONTACTS, MAX_RULES, RULE_BOUNDS, RULE_TEMPLATES, describeRule, evaluateLocalRules,
  readLocalRules, validateRuleParams,
  writeLocalRules, type AgentRule, type AgentRuleKind, type AgentRuleReminder,
} from "../../services/agentRules";
import "./AgentTabs.css";

interface Props {
  contacts: Contact[];
  past: PastEvent[];
  /** When the screen opened; on-device evaluation is relative to it. */
  now: number;
  /** localRulesKey(owner, demo): scopes on-device rules to this account or the demo. */
  storageKey: string;
  onReview: (contact: Contact, draft?: AgentDraft, intent?: string) => void;
}

interface Editing { id?: string; kind: AgentRuleKind; params: Record<string, unknown>; enabled: boolean }

const KIND_ORDER: AgentRuleKind[] = ["KEEP_IN_TOUCH", "THANK_AFTER_EVENT", "BIRTHDAY", "REPLY_REMINDER"];
const PARAM_FIELD: Record<AgentRuleKind, { key: keyof typeof RULE_BOUNDS; label: string; unit: string }> = {
  KEEP_IN_TOUCH: { key: "cadenceDays", label: "At least every", unit: "days" },
  THANK_AFTER_EVENT: { key: "withinHours", label: "Within", unit: "hours of the event" },
  BIRTHDAY: { key: "daysBefore", label: "Remind me", unit: "days before" },
  REPLY_REMINDER: { key: "afterDays", label: "After", unit: "days without a reply" },
};
const SERVER_ONLY = new Set<AgentRuleKind>(["BIRTHDAY", "REPLY_REMINDER"]);

const message = (cause: unknown, fallback: string) => cause instanceof AgentError ? cause.message : fallback;

export function AgentRulesTab({ contacts, past, now, storageKey, onReview }: Props) {
  const key = storageKey;
  const [rules, setRules] = useState<AgentRule[]>(() => readLocalRules(key));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [run, setRun] = useState<{ drafted: AgentDraft[]; reminders: AgentRuleReminder[] } | null>(null);
  const byId = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);

  const commit = (next: AgentRule[]) => { setRules(next); writeLocalRules(key, next); };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busy) return;
    const invalid = validateRuleParams(editing.kind, editing.params);
    if (invalid) { setFormError(invalid); return; }
    if (!editing.id && rules.length >= MAX_RULES) { setFormError(`You can have up to ${MAX_RULES} rules.`); return; }
    setBusy("form"); setFormError("");
    try {
      const stamp = new Date().toISOString();
      const saved: AgentRule = {
        id: editing.id ?? `local-rule:${crypto.randomUUID()}`, kind: editing.kind, params: editing.params, enabled: editing.enabled,
        createdAt: rules.find(r => r.id === editing.id)?.createdAt ?? stamp, updatedAt: stamp, lastEvaluatedAt: null,
      };
      commit(rules.some(r => r.id === saved.id) ? rules.map(r => r.id === saved.id ? saved : r) : [...rules, saved]);
      setEditing(null);
      setNotice(editing.id ? "Rule updated." : "Rule saved. Your agent will keep an eye on it.");
    } catch (cause) { setFormError(message(cause, "Couldn't save that rule.")); } finally { setBusy(null); }
  };

  const toggle = async (rule: AgentRule) => {
    if (busy) return;
    setBusy(rule.id);
    try {
      commit(rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (cause) { setError(message(cause, "Couldn't update that rule.")); } finally { setBusy(null); }
  };

  const remove = async (rule: AgentRule) => {
    if (busy) return;
    setBusy(rule.id);
    try {
      commit(rules.filter(r => r.id !== rule.id));
      setNotice("Rule deleted.");
    } catch (cause) { setError(message(cause, "Couldn't delete that rule.")); } finally { setBusy(null); }
  };

  const runNow = async () => {
    if (busy) return;
    setBusy("run"); setError(""); setNotice("");
    try {
      const result = { drafted: [] as AgentDraft[], reminders: evaluateLocalRules(rules, { contacts, past, now }) };
      setRun(result);
      const total = result.drafted.length + result.reminders.length;
      setNotice(total ? `Your agent found ${total} thing${total === 1 ? "" : "s"} to do.` : "All clear. Nothing is due right now.");
    } catch (cause) { setError(message(cause, "Your agent couldn't run your rules. Try again.")); } finally { setBusy(null); }
  };

  const field = editing ? PARAM_FIELD[editing.kind] : null;
  const selected = editing && Array.isArray(editing.params.contactIds) ? editing.params.contactIds as string[] : [];
  const filtered = contacts.filter(c => !search.trim() || `${c.name} ${c.org}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <section className="agent-tab-panel" aria-label="Rules">
    <div className="agent-tab-head">
      <div>
        <h2>Standing rules</h2>
        <p className="agent-muted">Rules your agent follows every day. It prepares drafts and reminders; nothing is sent until you approve it.</p>
      </div>
      <button className="agent-primary agent-small" onClick={() => void runNow()} disabled={busy === "run" || !rules.some(r => r.enabled)}>
        <Play size={13} /> Run now</button>
    </div>
    <div className="agent-notice" role="status" aria-live="polite">{notice}</div>
    {error && <p className="agent-error-line" role="alert">{error}</p>}

    {run && (run.drafted.length > 0 || run.reminders.length > 0) && <div className="agent-run" aria-label="Rule results">
      {run.drafted.map(draft => {
        const contact = byId.get(draft.contactId);
        return <div key={draft.id} className="agent-run-item"><PenLine size={14} />
          <span>Draft to {contact?.name ?? "a contact"}: {draft.intent}</span>
          {contact && <button className="agent-primary agent-small" onClick={() => onReview(contact, draft)}>Review</button>}
        </div>;
      })}
      {run.reminders.map(reminder => {
        const contact = byId.get(reminder.contactId);
        return <div key={`${reminder.ruleId}:${reminder.contactId}`} className="agent-run-item"><BellRing size={14} />
          <span><strong>{contact?.name ?? "Someone"}</strong> · {reminder.reason}</span>
          {contact && <button className="agent-ghost" onClick={() => onReview(contact, undefined, `A short, warm check-in with ${contact.name.split(" ")[0]}`)}>Draft</button>}
        </div>;
      })}
    </div>}

    {!editing && <div className="agent-templates" aria-label="Add a rule">
      {KIND_ORDER.map(kind => <button key={kind} className="agent-template" disabled={rules.length >= MAX_RULES}
        onClick={() => { setEditing({ kind, params: { ...RULE_TEMPLATES[kind].defaults }, enabled: true }); setFormError(""); setSearch(""); }}>
        <span className="agent-template-title"><Plus size={14} /> {RULE_TEMPLATES[kind].title}</span>
        <span className="agent-muted">{RULE_TEMPLATES[kind].description}</span>
        {SERVER_ONLY.has(kind) && <span className="agent-muted agent-template-note">Needs message history, which the demo does not have.</span>}
      </button>)}
    </div>}

    {editing && field && <form className="agent-form" onSubmit={save} aria-label={`${RULE_TEMPLATES[editing.kind].title} rule`}>
      <h3>{RULE_TEMPLATES[editing.kind].title}</h3>
      <p className="agent-muted">{RULE_TEMPLATES[editing.kind].description}</p>
      {editing.kind === "KEEP_IN_TOUCH" && <fieldset className="agent-picker">
        <legend>People ({selected.length}/{MAX_KEEP_IN_TOUCH_CONTACTS})</legend>
        <input type="search" aria-label="Search people" placeholder="Search people…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="agent-picker-list">{filtered.map(contact => {
          const checked = selected.includes(contact.id);
          return <label key={contact.id} className="agent-picker-item">
            <input type="checkbox" checked={checked} disabled={!checked && selected.length >= MAX_KEEP_IN_TOUCH_CONTACTS}
              onChange={() => setEditing({ ...editing, params: { ...editing.params, contactIds: checked ? selected.filter(id => id !== contact.id) : [...selected, contact.id] } })} />
            <span>{contact.name}</span>{contact.org && <span className="agent-muted">{contact.org}</span>}
          </label>;
        })}{!filtered.length && <p className="agent-muted">No matches.</p>}</div>
      </fieldset>}
      <label className="agent-inline-field" htmlFor="rule-param">{field.label}
        <input id="rule-param" type="number" inputMode="numeric" min={RULE_BOUNDS[field.key].min} max={RULE_BOUNDS[field.key].max}
          value={String(editing.params[field.key] ?? "")}
          onChange={e => setEditing({ ...editing, params: { ...editing.params, [field.key]: e.target.value === "" ? "" : Number(e.target.value) } })} />
        {field.unit}</label>
      <label className="agent-inline-field"><input type="checkbox" checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })} /> Turn this rule on</label>
      {formError && <p className="agent-error-line" role="alert">{formError}</p>}
      <div className="agent-form-actions">
        <button type="submit" className="agent-primary agent-small" disabled={busy === "form"}>{editing.id ? "Save changes" : "Save rule"}</button>
        <button type="button" className="agent-ghost" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </form>}

    {rules.length === 0 ? (!editing && <div className="agent-empty"><Repeat size={24} /><p>No rules yet. Pick one above to put your follow-ups on autopilot.</p></div>)
        : <ul className="agent-rules">{rules.map(rule => <li key={rule.id} className={rule.enabled ? "agent-rule" : "agent-rule is-off"}>
          <div className="agent-rule-text">
            <strong>{RULE_TEMPLATES[rule.kind].title}</strong>
            <p>{describeRule(rule, contacts)}</p>
          </div>
          <div className="agent-rule-actions">
            <label className="agent-switch">
              <input type="checkbox" role="switch" checked={rule.enabled} disabled={busy === rule.id} onChange={() => void toggle(rule)}
                aria-label={`${RULE_TEMPLATES[rule.kind].title} ${rule.enabled ? "on" : "off"}`} />
              <span aria-hidden="true" />
            </label>
            <button className="agent-ghost" onClick={() => { setEditing({ id: rule.id, kind: rule.kind, params: { ...rule.params }, enabled: rule.enabled }); setFormError(""); setSearch(""); }}>Edit</button>
            <button className="agent-ghost agent-dismiss" disabled={busy === rule.id} onClick={() => void remove(rule)} aria-label={`Delete ${RULE_TEMPLATES[rule.kind].title} rule`}><Trash2 size={13} /></button>
          </div>
        </li>)}</ul>}
  </section>;
}
