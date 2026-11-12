import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Building2, Clock3, Search, Users } from "lucide-react";
import { useApp } from "../../state/AppContext";
import { daysSince } from "../../lib/dates";
import { matchesQuery } from "../../lib/filters";
import { decayScoreLabel, getDecayRisk, meanModelScore } from "../../services/warmth";
import { bandForRisk, zoneForSlug } from "./orbitZones";
import "./ZoneDetailScreen.css";

function recencyLabel(timestamp: string): string {
  const days = daysSince(timestamp);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function ZoneDetailScreen() {
  const { zone: slug } = useParams();
  const zone = zoneForSlug(slug);
  const { state } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");

  const people = useMemo(() => {
    if (!zone) return [];
    return state.contacts
      .map((contact) => ({ contact, decay: getDecayRisk(contact) }))
      .filter((item) => bandForRisk(item.decay.risk) === zone.band)
      .sort((a, b) => zone.band >= 2 ? b.decay.risk - a.decay.risk : b.contact.warmth - a.contact.warmth);
    // Decay risk reads the module-level dyad registry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.contacts, state.dyadRev, zone?.band]);

  const filtered = useMemo(
    () => query.trim() ? people.filter((item) => matchesQuery(item.contact, query)) : people,
    [people, query],
  );

  const companies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { contact } of people) {
      const company = contact.org.trim() || "Independent";
      counts.set(company, (counts.get(company) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [people]);

  if (!zone) return <Navigate to="/orbit" replace />;

  const averageRisk = meanModelScore(people.map(item => item.decay.modelScore));
  const scoredCount = people.filter(item => item.decay.modelScore !== null).length;
  const averageWarmth = people.length
    ? Math.round(people.reduce((sum, item) => sum + item.contact.warmth, 0) / people.length)
    : 0;
  const networkShare = state.contacts.length ? Math.round(people.length / state.contacts.length * 100) : 0;
  const maxCompanyCount = companies[0]?.[1] ?? 1;

  return (
    <div className={`zone-page zone-page-${zone.slug}${(location.state as { fromOrbit?: boolean } | null)?.fromOrbit ? " is-zoom-arrival" : ""}`}>
      <header className="zone-page-header">
        <button className="zone-back" onClick={() => navigate("/orbit")}>
          <ArrowLeft size={16} /> Back to orbit
        </button>
        <div className="zone-heading-row">
          <div>
            <p>{scoredCount ? zone.eyebrow : "Saved relationship warmth"}</p>
            <h1>{zone.label}</h1>
            <span>{scoredCount ? zone.description : "Placement reflects saved warmth; no model scores are available for this zone."}</span>
          </div>
          <div className="zone-status-orb" aria-hidden="true"><i /><i /><i /></div>
        </div>
      </header>

      <section className="zone-metrics" aria-label={`${zone.label} zone summary`}>
        <article><Users size={16} /><span>Relationships</span><strong>{people.length}</strong><small>{networkShare}% of your network</small></article>
        <article><Clock3 size={16} /><span>Average model score</span><strong>{averageRisk === null ? "Not scored" : `${averageRisk}/100`}</strong><small>{scoredCount} of {people.length} relationships scored</small></article>
        <article><ArrowUpRight size={16} /><span>Average warmth</span><strong>{averageWarmth}</strong><small>Across this zone</small></article>
        <article><Building2 size={16} /><span>Companies</span><strong>{companies.length}</strong><small>{companies[0]?.[0] ?? "No company data"} leads</small></article>
      </section>

      <main className="zone-detail-grid">
        <section className="zone-people-panel">
          <div className="zone-panel-heading">
            <div><h2>People in {zone.label.toLowerCase()}</h2><p>Ordered by what deserves your attention now.</p></div>
            <label className="zone-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this zone" /></label>
          </div>
          <div className="zone-table-head"><span>Person</span><span>Last contact</span><span>Warmth</span><span>Cadence signal</span></div>
          <div className="zone-person-list">
            {filtered.map(({ contact, decay }) => (
              <button key={contact.id} onClick={() => navigate(`/contact/${contact.id}`)}>
                <span className="zone-person-main"><i>{contact.init}</i><span><strong>{contact.name}</strong><small>{contact.role} · {contact.org}</small></span></span>
                <span className="zone-recency">{recencyLabel(contact.lastInteractionAt)}</span>
                <span className="zone-warmth"><i><b style={{ width: `${contact.warmth}%` }} /></i>{contact.warmth}</span>
                <span className="zone-risk">{decayScoreLabel(decay)} <ArrowUpRight size={13} /></span>
              </button>
            ))}
            {filtered.length === 0 && <div className="zone-no-results">No relationships match that search.</div>}
          </div>
        </section>

        <aside className="zone-side-panel">
          <section className="zone-guidance">
            <p>What to do here</p>
            <h2>{scoredCount ? zone.guidance : "Review your last conversation and your goal before choosing a next step."}</h2>
            <span>Zone placement uses saved warmth and available cadence. Model scores are not calibrated outcome probabilities.</span>
          </section>
          <section className="zone-companies">
            <div><p>Company footprint</p><span>Where this zone is concentrated</span></div>
            {companies.slice(0, 6).map(([company, count]) => (
              <button key={company} onClick={() => navigate(`/?company=${encodeURIComponent(company)}`)}>
                <span><strong>{company}</strong><small>{count} {count === 1 ? "person" : "people"}</small></span>
                <i><b style={{ width: `${Math.max(8, count / maxCompanyCount * 100)}%` }} /></i>
              </button>
            ))}
          </section>
        </aside>
      </main>
    </div>
  );
}
