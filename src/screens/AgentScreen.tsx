import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bot, Briefcase, CalendarClock, CalendarDays, CircleCheck, Flag, HeartHandshake, Inbox,
  Lightbulb, PenLine, SendHorizontal, Sparkles, UserRoundPen, X, type LucideIcon,
} from "lucide-react";
import { useApp } from "../state/AppContext";
import { Avatar } from "../components/Avatar";
import { AgentDraftSheet } from "../components/AgentDraftSheet";
import { isTodayHidden, normalizeTodayPreferences, rememberTodayChoice } from "../services/today";
import {
  buildLocalBriefing, buildLocalDraft,
  type AgentCard, type AgentCardKind, type AgentChatMessage, type AgentDraft,
} from "../services/agent";
import {
  goalStepCards, localGoalsKey, readLocalGoals, weekStart, writeLocalGoals, type AgentGoal,
} from "../services/agentGoals";
import { localRulesKey } from "../services/agentRules";
import { AgentGoalsTab } from "../components/agent/AgentGoalsTab";
import { AgentRulesTab } from "../components/agent/AgentRulesTab";
import { AgentReportTab } from "../components/agent/AgentReportTab";
import { MeetingPrepSheet } from "../components/agent/MeetingPrepSheet";
import { FindTimeSheet } from "../components/agent/FindTimeSheet";
import type { Contact } from "../types";
import "./AgentScreen.css";

export type AgentTab = "today" | "goals" | "rules" | "report";
const TABS: { id: AgentTab; label: string }[] = [
  { id: "today", label: "Briefing" },
  { id: "goals", label: "Goals" },
  { id: "rules", label: "Rules" },
  { id: "report", label: "Report" },
];
const isTab = (value: string | null): value is AgentTab => TABS.some(t => t.id === value);

const CARD_META: Record<AgentCardKind, { label: string; icon: LucideIcon }> = {
  reconnect: { label: "Reconnect", icon: HeartHandshake },
  commitment: { label: "A promise to keep", icon: CircleCheck },
  career_moment: { label: "Career moment", icon: Briefcase },
  meeting_prep: { label: "Get ready", icon: CalendarDays },
  draft_ready: { label: "Draft ready", icon: PenLine },
  insight: { label: "Worth knowing", icon: Lightbulb },
  goal_step: { label: "Goal step", icon: Flag },
  reply_needed: { label: "Needs a reply", icon: Inbox },
  update_contact: { label: "Keep records current", icon: UserRoundPen },
};

const PROMPTS = [
  "Who should I reach out to this week?",
  "What did I promise people recently?",
  "Help me prepare for my next meeting",
];

interface ChatEntry extends AgentChatMessage { id: string; drafts?: AgentDraft[]; cards?: AgentCard[] }

interface SheetRequest { contact: Contact; draft?: AgentDraft; intent?: string }

function chatKey(owner: string | null, demo: boolean) {
  return `relapp.agent.chat.${demo ? "demo" : owner ?? "local"}`;
}

function readChat(key: string): ChatEntry[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((m): m is ChatEntry => !!m && typeof m === "object"
        && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && typeof m.id === "string")
      : [];
  } catch { return []; }
}

function writeChat(key: string, entries: ChatEntry[]) {
  try { window.sessionStorage.setItem(key, JSON.stringify(entries.slice(-40))); } catch { /* storage is optional */ }
}

export function AgentScreen() {
  return <AgentWorkspace />;
}

function AgentWorkspace() {
  const { state, dispatch, demo } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: AgentTab = isTab(requested) ? requested : "today";
  const selectTab = (next: AgentTab) => {
    const copy = new URLSearchParams(params);
    if (next === "today") copy.delete("tab"); else copy.set("tab", next);
    setParams(copy, { replace: true });
  };
  const owner = null; // the demo has no accounts
  const [now] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [doneCards, setDoneCards] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [prepEvent, setPrepEvent] = useState<string | null>(null);
  const [findTime, setFindTime] = useState<{ contactId?: string } | null>(null);
  const storageKey = chatKey(owner, demo);
  const [chat, setChat] = useState<ChatEntry[]>(() => readChat(storageKey));
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const contactsById = useMemo(() => new Map(state.contacts.map(c => [c.id, c])), [state.contacts]);
  const goalsKey = localGoalsKey(owner, demo);
  const [localGoals, setLocalGoalsState] = useState<AgentGoal[]>(() => readLocalGoals(goalsKey));
  const setLocalGoals = (next: AgentGoal[]) => { setLocalGoalsState(next); writeLocalGoals(goalsKey, next); };
  const weekOf = weekStart(now);
  const baseLocal = buildLocalBriefing({
    contacts: state.contacts, events: state.events, name: state.settings.name, now, owner,
  });
  // Goal steps for this week join the briefing feed.
  const local = { ...baseLocal, cards: [...goalStepCards(localGoals, weekOf).map(({ goal, step }): AgentCard => ({
    id: `local:goal-step:${step.id}`, kind: "goal_step", title: step.action,
    body: `For your goal “${goal.title}”. ${step.rationale}`.trim(),
    contactId: step.contactId ?? undefined,
    action: step.draftIntent && step.contactId ? { type: "draft", intent: step.draftIntent } : { type: "mark_step_done", stepId: step.id },
  })), ...baseLocal.cards] };

  useEffect(() => {
    writeChat(storageKey, chat);
  }, [storageKey, chat]);
  useEffect(() => {
    const messages = chatEnd.current?.parentElement;
    if (messages && chat.length) messages.scrollTop = messages.scrollHeight;
  }, [chat.length, thinking]);

  const shown = local;
  const preferences = normalizeTodayPreferences(state.settings.today);
  const cards = shown.cards.filter(card => !doneCards.has(card.id) && !isTodayHidden(`agent:${card.id}`, preferences, now));

  const dismiss = (card: AgentCard) => {
    dispatch({ type: "UPDATE_SETTINGS", patch: { today: rememberTodayChoice(preferences, `agent:${card.id}`, "dismissed", Date.now()) } });
    setNotice("Dismissed. Your agent will leave it alone.");
  };

  const markDone = async (card: AgentCard) => {
    setDoneCards(prev => new Set(prev).add(card.id));
    setNotice("Marked done.");
  };

  const markStepDone = (card: AgentCard, stepId: string) => {
    setLocalGoals(localGoals.map(goal => ({ ...goal, steps: goal.steps.map(step => step.id === stepId ? { ...step, state: "DONE" as const } : step) })));
    setDoneCards(prev => new Set(prev).add(card.id));
    setNotice("Step done. Nice work.");
  };

  const acceptUpdate = (card: AgentCard) => {
    if (!card.contactId) return;
    const proposed = {
      ...(card.proposedRole ? { role: card.proposedRole } : {}),
      ...(card.proposedOrg ? { org: card.proposedOrg } : {}),
    };
    dispatch({ type: "UPDATE_CONTACT", contactId: card.contactId, patch: proposed });
    setDoneCards(prev => new Set(prev).add(card.id));
    setNotice("Contact updated.");
  };

  const act = (card: AgentCard) => {
    const contact = card.contactId ? contactsById.get(card.contactId) : undefined;
    if (card.draft) { if (contact) setSheet({ contact, draft: card.draft }); return; }
    if (!card.action) return;
    if (card.action.type === "prep") { if (card.eventId) setPrepEvent(card.eventId); return; }
    if (card.action.type === "accept_update") { acceptUpdate(card); return; }
    if (card.action.type === "mark_done") { void markDone(card); return; }
    if (card.action.type === "mark_step_done") { if (card.action.stepId) markStepDone(card, card.action.stepId); return; }
    if (!contact) return;
    if (card.action.type === "open_contact") navigate(`/contact/${encodeURIComponent(contact.id)}`);
    else setSheet({ contact, intent: card.action.intent ?? card.title });
  };

  const localReply = (text: string): ChatEntry => {
    const lower = text.toLowerCase();
    const contact = state.contacts.find(c => {
      const first = c.name.trim().split(/\s+/)[0]?.toLowerCase();
      return first && first.length > 1 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower);
    });
    if (contact && /(draft|write|message|email|text|reach out|follow up|check in)/.test(lower)) {
      const draft = buildLocalDraft(contact, `A short, warm check-in with ${contact.name.split(" ")[0]}`, contact.email ? "EMAIL" : "IMESSAGE");
      return { id: crypto.randomUUID(), role: "assistant", content: `Here's a starting point for ${contact.name.split(" ")[0]}. Review it before you send it.`, drafts: [draft] };
    }
    const top = local.cards.slice(0, 3).map(card => `• ${card.title}`).join("\n");
    return {
      id: crypto.randomUUID(), role: "assistant",
      content: top ? `Here's what I'd focus on today:\n${top}\n\nAsk me to draft a message to someone by name.` : "Add a few people and I'll start suggesting who to reach out to.",
      cards: local.cards.slice(0, 2),
    };
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    const user: ChatEntry = { id: crypto.randomUUID(), role: "user", content };
    setChat([...chat, user]); setInput("");
    setThinking(true);
    window.setTimeout(() => { setChat(prev => [...prev, localReply(content)]); setThinking(false); }, 350);
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };

  const resolveDraft = (resolved: AgentDraft) => {
    setChat(prev => prev.map(entry => entry.drafts?.some(d => d.id === resolved.id)
      ? { ...entry, drafts: entry.drafts.map(d => d.id === resolved.id ? resolved : d) } : entry));
  };

  const dateLabel = new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return <div className="agent-screen">
    <header className="agent-header">
      <div className="agent-eyebrow"><span><Sparkles size={15} /> Your relationship agent</span><time>{dateLabel}</time></div>
      <h1>{shown.greeting}.</h1>
      <p className="agent-summary">{shown.summary}</p>
      {demo && <p className="agent-note">Sample network. The agent runs on sample data and nothing is sent.</p>}
    </header>

    <nav className="agent-tabs" role="tablist" aria-label="Agent">
      {TABS.map(t => <button key={t.id} role="tab" id={`agent-tab-${t.id}`} aria-selected={tab === t.id}
        aria-controls={`agent-panel-${t.id}`} className={tab === t.id ? "agent-tab is-active" : "agent-tab"}
        onClick={() => selectTab(t.id)}>{t.label}</button>)}
    </nav>

    <div role="tabpanel" id={`agent-panel-${tab}`} aria-labelledby={`agent-tab-${tab}`}>
    {tab === "today" && <div className="agent-layout">
      <section className="agent-chat" aria-label="Ask your agent">
        <div className="agent-chat-head"><Bot size={17} /><h2>Ask your agent</h2>
          <button className="agent-ghost" onClick={() => setFindTime({})}><CalendarClock size={14} /> Find a time</button>
          {chat.length > 0 && <button className="agent-ghost" onClick={() => setChat([])}>Clear</button>}</div>
        <div className="agent-messages" aria-live="polite">
          {chat.length === 0 && <div className="agent-prompts">
            <div className="agent-chat-intro"><span className="agent-chat-mark"><Sparkles size={24} /></span>
              <h3>What would you like to move forward?</h3>
              <p>Plan a next step, prepare for a meeting, or write a message. You review every draft.</p></div>
            {PROMPTS.map(prompt => <button key={prompt} className="agent-prompt" onClick={() => void send(prompt)}>{prompt}</button>)}
          </div>}
          {chat.map(entry => <div key={entry.id} className={`agent-msg agent-msg-${entry.role}`}>
            <p>{entry.content}</p>
            {entry.drafts?.map(draft => {
              const contact = contactsById.get(draft.contactId);
              return <div key={draft.id} className="agent-inline-draft">
                <div className="agent-inline-draft-head"><PenLine size={13} /> Draft to {contact?.name ?? "a contact"}
                  <span className={`agent-draft-state state-${draft.state.toLowerCase()}`}>{draft.state === "PROPOSED" ? "Needs your approval" : draft.state.toLowerCase()}</span></div>
                <p>{draft.body.length > 220 ? `${draft.body.slice(0, 220)}…` : draft.body}</p>
                {contact && (draft.state === "PROPOSED" || draft.state === "APPROVED") && <button className="agent-primary agent-small" onClick={() => setSheet({ contact, draft })}>{draft.state === "APPROVED" ? "Open approved draft" : "Review & approve"}</button>}
              </div>;
            })}
            {entry.cards?.map(card => <p key={card.id} className="agent-inline-card"><strong>{card.title}</strong> {card.body}</p>)}
          </div>)}
          {thinking && <div className="agent-msg agent-msg-assistant agent-thinking" role="status"><span /><span /><span /><em className="sr-only">Your agent is thinking</em></div>}
          <div ref={chatEnd} />
        </div>
        <form className="agent-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="agent-input">Message your agent</label>
          <textarea id="agent-input" rows={2} value={input} maxLength={2000} placeholder="Ask your agent to plan, prepare, or draft…"
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} />
          <button type="submit" className="agent-send" aria-label="Send" disabled={!input.trim() || thinking}><SendHorizontal size={17} /></button>
        </form>
      </section>
      <section className="agent-feed" aria-label="Your briefing">
        <div className="agent-feed-head">
          <h2>Your briefing</h2>
        </div>
        <div className="agent-notice" role="status" aria-live="polite">{notice}</div>
        {cards.length ? <div className="agent-cards">{cards.map(card => (
            <AgentCardView key={card.id} card={card} contact={card.contactId ? contactsById.get(card.contactId) : undefined}
              busy={false} onAct={act} onDismiss={dismiss} onDone={markDone}
              onFindTime={contactId => setFindTime({ contactId })} />
          ))}</div>
            : <div className="agent-empty"><CircleCheck size={24} /><p>You're all caught up. Ask your agent to plan your next step.</p></div>}
      </section>
    </div>}
    {tab === "goals" && <AgentGoalsTab contacts={state.contacts} now={now}
      localGoals={localGoals} onLocalGoals={setLocalGoals}
      onDraft={(contact, intent) => setSheet({ contact, intent })} />}
    {tab === "rules" && <AgentRulesTab contacts={state.contacts} past={state.past} now={now}
      storageKey={localRulesKey(owner, demo)}
      onReview={(contact, draft, intent) => setSheet({ contact, draft, intent })} />}
    {tab === "report" && <AgentReportTab contacts={state.contacts} past={state.past} now={now}
      storageKey={localRulesKey(owner, demo)}
      goalStepsDone={localGoals.reduce((n, g) => n + g.steps.filter(s => s.state === "DONE").length, 0)} />}
    </div>

    {prepEvent && <MeetingPrepSheet eventId={prepEvent} events={state.events} contacts={state.contacts}
      goalTitles={localGoals.filter(g => g.state === "ACTIVE").map(g => g.title)}
      onClose={() => setPrepEvent(null)}
      onDraft={(contact, intent) => { setPrepEvent(null); setSheet({ contact, intent }); }} />}
    {findTime && <FindTimeSheet contacts={state.contacts} contactId={findTime.contactId} events={state.events}
      onClose={() => setFindTime(null)}
      onDraft={(contact, draft) => { setFindTime(null); setSheet({ contact, draft }); }} />}
    {sheet && <AgentDraftSheet contact={sheet.contact} draft={sheet.draft} intent={sheet.intent}
      onClose={() => setSheet(null)} onResolved={resolveDraft} />}
  </div>;
}

function AgentCardView({ card, contact, busy, onAct, onDismiss, onDone, onFindTime }: {
  card: AgentCard; contact?: Contact; busy: boolean;
  onAct: (card: AgentCard) => void; onDismiss: (card: AgentCard) => void; onDone: (card: AgentCard) => Promise<void>;
  onFindTime: (contactId: string) => void;
}) {
  const meta = CARD_META[card.kind];
  const Icon = meta.icon;
  const actionLabel = card.draft ? "Review & approve"
    : card.action?.type === "prep" ? "Prep"
    : card.action?.type === "accept_update" ? "Update contact"
    : card.action?.type === "draft" ? (card.kind === "reply_needed" ? "Draft reply" : "Draft a message")
    : card.action?.type === "open_contact" ? "Open contact"
    : card.action?.type === "mark_done" || card.action?.type === "mark_step_done" ? "Mark done" : null;
  const canAct = card.draft ? Boolean(contact)
    : card.action && (card.action.type === "mark_done" || card.action.type === "mark_step_done" || card.action.type === "prep"
      || (card.action.type === "accept_update" && contact) || contact);
  const proposed = card.kind === "update_contact" && (card.proposedRole || card.proposedOrg)
    ? [card.proposedRole, card.proposedOrg].filter(Boolean).join(" at ") : "";
  return <article className={`agent-card agent-card-${card.kind}`} aria-label={card.title}>
    <div className="agent-card-top">
      <span className="agent-kind"><Icon size={14} /> {meta.label}</span>
      {card.dueAt && <span className="agent-due">{new Date(card.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
    </div>
    <div className="agent-card-main">
      {contact && <Avatar contact={contact} size={38} />}
      <div><h3>{card.title}</h3><p>{card.body}</p>
        {proposed && contact && <p className="agent-proposed"><span>{[contact.role, contact.org].filter(Boolean).join(" at ") || "No role saved"}</span> → <strong>{proposed}</strong></p>}
      </div>
    </div>
    <div className="agent-card-actions">
      {canAct && actionLabel && <button className="agent-primary agent-small" disabled={busy} onClick={() => onAct(card)}>
        {(card.draft || card.action?.type === "draft") && <PenLine size={14} />}{actionLabel}</button>}
      {card.kind === "reconnect" && contact && <button className="agent-ghost" onClick={() => onFindTime(contact.id)}><CalendarClock size={14} /> Find a time</button>}
      {card.signalId && card.action?.type !== "mark_done" && card.kind !== "update_contact" && <button className="agent-ghost" disabled={busy} onClick={() => void onDone(card)}><CircleCheck size={14} /> Done</button>}
      <button className="agent-ghost agent-dismiss" onClick={() => onDismiss(card)} aria-label={`Dismiss ${card.title}`}><X size={14} /> Dismiss</button>
    </div>
  </article>;
}
