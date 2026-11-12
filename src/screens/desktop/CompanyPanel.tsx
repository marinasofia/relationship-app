import { Briefcase, Clock, Flame, MapPin, Snowflake, X } from "lucide-react";
import type { Contact, WarmthLabel } from "../../types";
import type { CompanyIntel } from "../../services/companyIntel";
import { warmthOf } from "../../services/warmth";
import { Avatar } from "../../components/Avatar";
import "./CompanyPanel.css";

interface CompanyPanelProps {
  intel: CompanyIntel;
  /** true while the tree keeps the panel mounted for its exit beat */
  closing?: boolean;
  onSelect: (contact: Contact) => void;
  onClose: () => void;
}

// A representative warmth per band, so warmthOf yields each band's own gradient.
const BAND_WARMTH: Record<WarmthLabel, number> = {
  Warm: 85,
  Steady: 55,
  Cooling: 35,
  "Going cold": 10,
};

// The zoom-in story's third beat: after the camera lands on a company's
// cluster, this panel tells you where you stand there, and reserves the
// stage for live openings (API seam in services/companyIntel.ts).
export function CompanyPanel({ intel, closing = false, onSelect, onClose }: CompanyPanelProps) {
  const pct = Math.round(intel.share * 100);
  const maxBand = Math.max(1, ...intel.bands.map((b) => b.count));

  return (
    <aside className={"company-panel" + (closing ? " is-out" : "")}>
      <button className="cp-close" aria-label="Release company focus" onClick={onClose}>
        <X size={16} />
      </button>

      <div className="cp-kicker">Company</div>
      <h2 className="cp-name">{intel.org}</h2>
      <div className="cp-sub">
        {intel.count} {intel.count === 1 ? "person" : "people"} · {pct}% of your network
      </div>

      <div className="cp-bands">
        {intel.bands.map((b) => {
          const w = warmthOf(BAND_WARMTH[b.label]);
          return (
            <div className="cp-band" key={b.label}>
              <span className="cp-band-label">{b.label}</span>
              <span className="cp-band-track">
                <i
                  style={{
                    width: `${(b.count / maxBand) * 100}%`,
                    background: `linear-gradient(90deg, ${w.c}, ${w.c2})`,
                  }}
                />
              </span>
              <span className="cp-band-n">{b.count}</span>
            </div>
          );
        })}
      </div>

      {intel.warmest && (
        <button className="cp-row" onClick={() => onSelect(intel.warmest!)}>
          <Flame size={14} className="cp-row-icon cp-warmicon" />
          <span className="cp-row-label">Warmest</span>
          <span className="cp-row-value">{intel.warmest.name}</span>
        </button>
      )}
      {intel.atRisk && intel.atRisk.id !== intel.warmest?.id && (
        <button className="cp-row" onClick={() => onSelect(intel.atRisk!)}>
          <Snowflake size={14} className="cp-row-icon cp-coldicon" />
          <span className="cp-row-label">Reconnect first</span>
          <span className="cp-row-value">{intel.atRisk.name}</span>
        </button>
      )}
      <div className="cp-row cp-row-static">
        <Clock size={14} className="cp-row-icon" />
        <span className="cp-row-label">Last touch</span>
        <span className="cp-row-value">
          {intel.lastTouchDays === 0 ? "today" : `${intel.lastTouchDays}d ago`}
        </span>
      </div>
      {intel.topEvents.length > 0 && (
        <div className="cp-row cp-row-static cp-row-wrap">
          <MapPin size={14} className="cp-row-icon" />
          <span className="cp-row-label">Where you met</span>
          <span className="cp-row-value cp-events">
            {intel.topEvents.map((e) => (
              <em key={e.label}>
                {e.label}
                {e.count > 1 ? ` ·${e.count}` : ""}
              </em>
            ))}
          </span>
        </div>
      )}

      <div className="cp-people">
        {intel.people.map((p, i) => (
          <button
            className="cp-person"
            key={p.id}
            style={{ animationDelay: `${240 + i * 45}ms` }}
            onClick={() => onSelect(p)}
          >
            <Avatar contact={p} size={30} />
            <span className="cp-person-main">
              <span className="cp-person-name">{p.name}</span>
              <span className="cp-person-role">{p.role}</span>
            </span>
            <span className="cp-person-band" style={{ color: warmthOf(p.warmth).c }}>
              {warmthOf(p.warmth).label}
            </span>
          </button>
        ))}
      </div>

      <div className="cp-openings">
        <div className="cp-kicker">
          <Briefcase size={12} /> Open roles
        </div>
        <p>
          Live roles and internships at {intel.org} will land here, apply without leaving
          your orbit.
        </p>
        <span className="cp-soon">Arriving with live data</span>
      </div>
    </aside>
  );
}
