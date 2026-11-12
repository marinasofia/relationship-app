import { useState } from "react";
import { Plus, Search, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state/AppContext";
import { Avatar } from "../components/Avatar";
import { AddPersonSheet } from "../components/AddPersonSheet";
import { WeaveCard } from "../components/WeaveCard";
import { warmthOf } from "../services/warmth";
import { getFocusScore } from "../services/focus";
import type { Contact } from "../types";
import { formatDay } from "../lib/dates";
import { metAtOf } from "../lib/contacts";
import { FILTERS, matchesFilter, matchesQuery } from "../lib/filters";
import { BrandMark } from "../components/BrandMark";
import "./PeopleScreen.css";

type SortKey = "Focus" | "Warmest" | "Newest" | "A to Z";

const SORTS: Record<SortKey, (a: Contact, b: Contact) => number> = {
  // Who deserves attention right now, the default, model-backed order.
  Focus: (a, b) => getFocusScore(b) - getFocusScore(a),
  Warmest: (a, b) => b.warmth - a.warmth,
  Newest: (a, b) => Date.parse(b.lastInteractionAt) - Date.parse(a.lastInteractionAt),
  "A to Z": (a, b) => a.name.localeCompare(b.name),
};

// The home: a people-first rolodex. Warm to cold, felt rather than alarmed,
// ordered by who deserves attention right now.
export function PeopleScreen() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("Focus");
  const [adding, setAdding] = useState(false);

  const filtered = state.contacts
    .filter((c) => matchesFilter(c, state.filter) && matchesQuery(c, query))
    .sort(SORTS[sort]);

  return (
    <div className="screen">
    <div className="scroll">
      <div className="people-head">
        <div className="screen-brand-title"><BrandMark size={23} /><div className="h1">People</div></div>
        <div className="people-head-actions">
          <button className="add-pill" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add someone
          </button>
          <button
            className="gear"
            aria-label="Settings"
            onClick={() => navigate("/settings")}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
      <div className="sub">Everyone you've met, warm to cold.</div>

      <WeaveCard />

      <div className="searchbar">
        <Search size={16} color="#A79E92" />
        <input
          className="search-input"
          placeholder="Search your people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={"chip" + (state.filter === f ? " on" : "")}
            onClick={() => dispatch({ type: "SET_FILTER", filter: f })}
          >
            {f}
          </button>
        ))}
        <select
          className="sort-select"
          aria-label="Sort people"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          {(Object.keys(SORTS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      {/* re-keying on filter/sort lets the list settle in with one soft fade
          instead of snapping into its new order; typing doesn't re-key */}
      <div className="plist" key={`${state.filter}·${sort}`}>
        {filtered.map((c) => {
          const w = warmthOf(c.warmth);
          return (
            <button className="prow" key={c.id} onClick={() => navigate(`/contact/${c.id}`)}>
              <Avatar contact={c} />
              <div className="prow-main">
                <div className="prow-name">{c.name}</div>
                <div className="prow-sub">
                  {c.role}
                  {c.org ? ` · ${c.org}` : ""}
                </div>
                <div className="prow-met">
                  {c.met} · {formatDay(metAtOf(c))}
                </div>
              </div>
              <div className="warm-tag" style={{ color: w.c }}>
                {w.label}
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="people-empty">
            No one here yet. Add someone above, or capture them at your next event.
          </div>
        )}
      </div>

      <div style={{ height: 90 }} />
    </div>

    {adding && <AddPersonSheet onClose={() => setAdding(false)} />}
    </div>
  );
}
