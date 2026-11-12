import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  Building2,
  CircleDot,
  Search,
  Sparkles,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../../state/AppContext";
import { matchesQuery } from "../../lib/filters";
import { daysSince } from "../../lib/dates";
import { getCompanyIntel } from "../../services/companyIntel";
import { getDecayRisk, meanModelScore, warmthOf } from "../../services/warmth";
import type { Contact } from "../../types";
import { useExit, EXIT_MS } from "../../lib/useExit";
import { ContactPanel } from "./ContactPanel";
import { CompanyPanel } from "./CompanyPanel";
import { bandForRisk, ORBIT_ZONES, type OrbitZoneInfo } from "./orbitZones";
import "./TreeScreen.css";

type OrbitMode = "orbit" | "companies" | "relevance";

interface PositionedContact {
  contact: Contact;
  x: number;
  y: number;
  angle: number;
  risk: number;
  modelScore: number | null;
  relevance: number;
  radius: number;
  color: string;
  band: number;
}

interface CompanyGroup {
  name: string;
  contacts: Contact[];
  start: number;
  end: number;
  color: string;
  /** The tail of small companies collapses into one unnamed segment. */
  isOthers: boolean;
}

const CENTER = 380;
const TAU = Math.PI * 2;
const BAND_RADII = [102, 174, 246, 318];
const CLAY_BAND_COLORS = ["#a83b35", "#c95235", "#dc7930", "#c79a22"];
const COMPANY_COLORS = [
  "#7559e8",
  "#e879a9",
  "#20a985",
  "#ed8c4a",
  "#4e8fe8",
  "#be6bda",
  "#ef6461",
  "#6e9c43",
  "#2fa8b8",
  "#c9962c",
];
const OTHERS_COLOR = "#a9a2b3";
/** Companies get one colour each; past this the tail collapses so no two arcs share a hue. */
const NAMED_COMPANIES = COMPANY_COLORS.length;
/** The company ribbon rides outside the dormant band (318 + 28 of stroke) and inside the viewBox. */
const COMPANY_RING_R = 360;
/** Tried largest first; a tight arc keeps its whole name by dropping a size. */
const COMPANY_LABEL_SIZES = [18, 16, 14, 12];

const MODE_OPTIONS: Array<{ key: OrbitMode; label: string; icon: typeof CircleDot }> = [
  { key: "orbit", label: "Orbit", icon: CircleDot },
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "relevance", label: "Relevant now", icon: Sparkles },
];

function stableNumber(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Company names become SVG ids, so strip them down to something an id can hold. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

function polar(radius: number, angle: number) {
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function arcPath(radius: number, start: number, end: number): string {
  const a = polar(radius, start);
  const b = polar(radius, end);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${b.x} ${b.y}`;
}

/**
 * Same arc, but drawn backwards once its midpoint crosses into the lower half of
 * the circle so text riding it never comes out upside down.
 */
function labelArcPath(radius: number, start: number, end: number): string {
  const flipped = Math.sin((start + end) / 2) > 0;
  const a = polar(radius, flipped ? end : start);
  const b = polar(radius, flipped ? start : end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} ${flipped ? 0 : 1} ${b.x} ${b.y}`;
}

/**
 * Advance width of a label, in user units. A flat per-character average costs
 * whole size steps here, because a capital-heavy name ("JPMorgan Chase") runs
 * far wider than a lowercase one ("Goldman Sachs") of the same length, one
 * constant is either too loose for the first or too tight for the second.
 * Bucketing by glyph class tracks the real face to within a few percent.
 */
function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) {
    if ("iljtI|!.,'·:;".includes(ch)) em += 0.3;
    else if ("fr()[]/ ".includes(ch)) em += 0.34;
    else if ("MW@".includes(ch)) em += 0.86;
    else if (ch >= "A" && ch <= "Z") em += 0.63;
    else if (ch >= "0" && ch <= "9") em += 0.56;
    else em += 0.53;
  }
  return em * size;
}

/**
 * Most label the arc can hold. Preference order is name-with-count, then the
 * bare name, then the name minus its trailing words ("Warner Bros Discovery"
 * -> "Warner Bros", "JPMorgan Chase" -> "JPMorgan"), each tried large first, so a
 * whole name at 12px wins over a clipped one at 14px. Hovering always spells
 * the full story out in the centre, so dropping the label is the last resort.
 */
function fitCompanyLabel(group: CompanyGroup): { text: string; size: number } | null {
  const room = COMPANY_RING_R * (group.end - group.start) - 8;
  const words = group.name.split(" ");
  const candidates = [`${group.name} · ${group.contacts.length}`];
  for (let take = words.length; take > 0; take -= 1) candidates.push(words.slice(0, take).join(" "));

  for (const text of candidates) {
    for (const size of COMPANY_LABEL_SIZES) {
      if (textWidth(text, size) <= room) return { text, size };
    }
  }
  return null;
}

function dayLabel(contact: Contact): string {
  const days = daysSince(contact.lastInteractionAt);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function TreeScreen() {
  const { state } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const zoomTimerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<OrbitMode>("orbit");
  const [query, setQuery] = useState("");
  const [hoveredBand, setHoveredBand] = useState<number | null>(null);
  const [hoveredCompany, setHoveredCompany] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [departingZone, setDepartingZone] = useState<(OrbitZoneInfo & { band: number }) | null>(null);

  useEffect(() => () => {
    if (zoomTimerRef.current !== null) window.clearTimeout(zoomTimerRef.current);
  }, []);

  const enterZone = (zone: OrbitZoneInfo, band: number) => {
    if (departingZone) return;
    const destination = { ...zone, band };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigate(`/orbit/${zone.slug}`, { state: { fromOrbit: true } });
      return;
    }
    setHoveredBand(null);
    setDepartingZone(destination);
    zoomTimerRef.current = window.setTimeout(() => {
      navigate(`/orbit/${zone.slug}`, { state: { fromOrbit: true } });
    }, 880);
  };

  useEffect(() => {
    const company = searchParams.get("company");
    if (!company) return;
    setMode("companies");
    setSelectedCompany(company);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        if (selectedId) setSelectedId(null);
        else if (selectedCompany) setSelectedCompany(null);
        else if (query) setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query, selectedCompany, selectedId]);

  const companyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of state.contacts) {
      const org = contact.org.trim() || "Independent";
      counts.set(org, (counts.get(org) ?? 0) + 1);
    }
    return counts;
  }, [state.contacts]);

  const companyGroups = useMemo<CompanyGroup[]>(() => {
    const byCompany = new Map<string, Contact[]>();
    for (const contact of state.contacts) {
      const org = contact.org.trim() || "Independent";
      byCompany.set(org, [...(byCompany.get(org) ?? []), contact]);
    }
    const ordered = [...byCompany.entries()].sort((a, b) =>
      b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
    const tail = ordered.slice(NAMED_COMPANIES).flatMap(([, contacts]) => contacts);
    const segments: Array<[string, Contact[], boolean]> = ordered
      .slice(0, NAMED_COMPANIES)
      .map(([name, contacts]) => [name, contacts, false]);
    if (tail.length > 0) segments.push(["Others", tail, true]);

    let cursor = 0;
    return segments.map(([name, contacts, isOthers], index) => {
      const start = -Math.PI / 2 + TAU * (cursor / Math.max(1, state.contacts.length));
      cursor += contacts.length;
      const end = -Math.PI / 2 + TAU * (cursor / Math.max(1, state.contacts.length));
      return {
        name,
        contacts,
        start,
        end,
        color: isOthers ? OTHERS_COLOR : COMPANY_COLORS[index],
        isOthers,
      };
    });
  }, [state.contacts]);

  const positions = useMemo<PositionedContact[]>(() => {
    const companyRank = new Map<string, number>();
    const companyColor = new Map<string, string>();
    let rank = 0;
    for (const group of companyGroups) {
      for (const contact of group.contacts) {
        companyRank.set(contact.id, rank++);
        companyColor.set(contact.id, group.color);
      }
    }

    return state.contacts.map((contact, index) => {
      const decay = getDecayRisk(contact);
      const band = bandForRisk(decay.risk);
      const orgDepth = companyCounts.get(contact.org.trim() || "Independent") ?? 1;
      const relevance = Math.round(
        Math.min(100, contact.warmth * 0.62 + Math.min(orgDepth * 3.2, 20) + (100 - decay.risk) * 0.18),
      );
      const jitter = stableNumber(`${contact.id}:radial`) - 0.5;
      const radialSpread = [28, 30, 30, 28][band];
      const radius = BAND_RADII[band] + jitter * radialSpread;
      const orderedRank = companyRank.get(contact.id) ?? index;
      const companyAngle = -Math.PI / 2 + TAU * ((orderedRank + 0.5) / Math.max(1, state.contacts.length));
      const freeAngle = -Math.PI / 2 + stableNumber(`${contact.id}:angle`) * TAU;
      const relevantAngle = -Math.PI / 2 + TAU * ((index + 0.5) / Math.max(1, state.contacts.length));
      const angle = mode === "companies" ? companyAngle : mode === "relevance" ? relevantAngle : freeAngle;
      const point = polar(radius, angle);
      return {
        contact,
        x: point.x,
        y: point.y,
        angle,
        risk: decay.risk,
        modelScore: decay.modelScore,
        relevance,
        radius: mode === "relevance" ? 3.8 + relevance / 18 : 4.2 + contact.warmth / 25,
        color: mode === "companies"
          ? companyColor.get(contact.id) ?? OTHERS_COLOR
          : mode === "orbit"
            ? CLAY_BAND_COLORS[band]
            : warmthOf(100 - decay.risk).c,
        band,
      };
    });
    // dyadRev invalidates the module-level decay registry read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyCounts, companyGroups, mode, state.contacts, state.dyadRev]);

  const focusedBand = hoveredCompany ? null : hoveredBand;
  const zoneSummaries = useMemo(() => ORBIT_ZONES.map((zone, band) => {
    const people = positions.filter((item) => item.band === band);
    const averageRisk = meanModelScore(people.map(item => item.modelScore));
    const companies = new Map<string, number>();
    for (const item of people) {
      const company = item.contact.org.trim() || "Independent";
      companies.set(company, (companies.get(company) ?? 0) + 1);
    }
    const leadCompany = [...companies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No company yet";
    return { ...zone, band, people, averageRisk, leadCompany };
  }), [positions]);
  const focusedZone = focusedBand === null ? null : zoneSummaries[focusedBand];
  const visibleIds = useMemo(() => {
    if (!query.trim()) return null;
    return new Set(state.contacts.filter((contact) => matchesQuery(contact, query)).map((contact) => contact.id));
  }, [query, state.contacts]);

  const atRisk = useMemo(
    () => positions.filter(item => item.modelScore !== null).sort((a, b) => b.modelScore! - a.modelScore!).slice(0, 5),
    [positions],
  );
  const focusedCompany = useMemo(() => {
    if (!hoveredCompany) return null;
    const group = companyGroups.find((item) => item.name === hoveredCompany);
    if (!group) return null;
    const people = positions.filter((item) => group.contacts.some((c) => c.id === item.contact.id));
    const averageRisk = meanModelScore(people.map(item => item.modelScore));
    const anchor = polar(COMPANY_RING_R - 15, (group.start + group.end) / 2);
    const orgCount = new Set(group.contacts.map((c) => c.org.trim() || "Independent")).size;
    return { group, people, averageRisk, anchor, orgCount };
  }, [companyGroups, hoveredCompany, positions]);

  const strongestCompanies = companyGroups.filter((group) => !group.isOthers).slice(0, 5);
  const coldCount = positions.filter((item) => item.band === 3).length;
  const warmCount = positions.filter((item) => item.band === 0).length;
  const selected = selectedId ? state.contacts.find((contact) => contact.id === selectedId) : undefined;
  const intel = useMemo(
    () => selectedCompany ? getCompanyIntel(selectedCompany, state.contacts) : null,
    // Company intel reads decay risk from the same module-level registry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCompany, state.contacts, state.dyadRev],
  );

  const contactExit = useExit(!!selected);
  const lastContact = useRef<Contact | null>(selected ?? null);
  if (selected) lastContact.current = selected;
  const companyExit = useExit(!!intel && !selected, selected ? 0 : EXIT_MS);
  const lastIntel = useRef(intel);
  if (intel) lastIntel.current = intel;

  if (state.contacts.length === 0) {
    return (
      <div className="orbit-screen orbit-empty">
        <h2>Your orbit starts with one person.</h2>
        <p>Capture the people you meet and the app will keep the right relationships close.</p>
        <button onClick={() => navigate("/events")}>Open events</button>
      </div>
    );
  }

  return (
    <div
      className={`orbit-screen${departingZone ? ` is-zone-zooming zoom-to-${departingZone.slug}` : ""}`}
      style={departingZone ? { "--zone-zoom": [5, 3.2, 2.4, 1.9][departingZone.band] } as CSSProperties : undefined}
    >
      <header className="orbit-header">
        <div>
          <p className="orbit-eyebrow">Relationship intelligence</p>
          <h1>Your orbit</h1>
          <p className="orbit-subtitle">The people who matter, before they drift away.</p>
        </div>
        <div className="orbit-summary" aria-label="Network summary">
          <span><strong>{state.contacts.length}</strong> people</span>
          <i />
          <span><strong>{companyCounts.size}</strong> companies</span>
          <i />
          <span className="orbit-summary-alert"><strong>{coldCount}</strong> drifting</span>
        </div>
      </header>

      <div className="orbit-toolbar">
        <div className="orbit-search">
          <Search size={16} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people, roles, or companies"
            aria-label="Search relationships"
          />
          <kbd>/</kbd>
        </div>
        <div className="orbit-modes" aria-label="Orbit view">
          {MODE_OPTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} className={mode === key ? "is-active" : ""} onClick={() => setMode(key)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <main className="orbit-workspace">
        <section className="orbit-canvas-card" aria-label="Relationship orbit visualization">
          <div className="orbit-canvas-title">
            <span>{mode === "companies" ? "Company clusters" : mode === "relevance" ? "Relevant now" : "Relationship temperature"}</span>
            <span className="orbit-live"><i /> Hover a zone · click to open</span>
          </div>
          <svg className="orbit-map" viewBox="0 0 760 760" role="img" aria-label="Relationships arranged by warmth and decay risk">
            <defs>
              <radialGradient id="orbit-center-glow">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#faf9fc" />
              </radialGradient>
              {/* Warmth gradient approximating the clay texture: paints the rings
                  immediately and whenever the texture is late or unavailable. */}
              <radialGradient id="orbit-warmth" gradientUnits="userSpaceOnUse" cx={CENTER} cy={CENTER} r={CENTER}>
                <stop offset="0%" stopColor="#c8402c" />
                <stop offset="34%" stopColor="#e5602c" />
                <stop offset="68%" stopColor="#f08c22" />
                <stop offset="100%" stopColor="#f6b022" />
              </radialGradient>
              <pattern id="orbit-surface" patternUnits="userSpaceOnUse" width="760" height="760">
                <rect width="760" height="760" fill="url(#orbit-warmth)" />
              </pattern>
              <filter id="orbit-node-shadow" x="-80%" y="-80%" width="260%" height="260%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#2d2445" floodOpacity="0.2" />
              </filter>
            </defs>

            {ORBIT_ZONES.map((zone, band) => {
              const active = focusedBand === band;
              const muted = focusedBand !== null && !active;
              const circumference = 2 * Math.PI * BAND_RADII[band];
              const share = zoneSummaries[band].people.length / Math.max(1, state.contacts.length);
              const ringStyle = {
                "--zone-length": circumference,
                "--zone-progress": circumference * share,
                "--zone-delay": `${band * 115}ms`,
              } as CSSProperties;
              return (
                <g
                  key={zone.label}
                  className={`orbit-zone${active ? " is-focused" : ""}${muted ? " is-muted" : ""}${departingZone?.band === band ? " is-departing" : ""}`}
                  onMouseEnter={() => setHoveredBand(band)}
                  onMouseLeave={() => setHoveredBand((current) => current === band ? null : current)}
                  onFocus={() => setHoveredBand(band)}
                  onBlur={() => setHoveredBand((current) => current === band ? null : current)}
                  onClick={() => enterZone(zone, band)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      enterZone(zone, band);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${zone.label} zone, ${zoneSummaries[band].people.length} people. Open zone details.`}
                >
                  <circle className="orbit-zone-hit" cx={CENTER} cy={CENTER} r={BAND_RADII[band]} />
                  <circle className="orbit-band-track" cx={CENTER} cy={CENTER} r={BAND_RADII[band]} />
                  <circle
                    className={`orbit-band orbit-band-${band === 0 ? "core" : band === 1 ? "active" : band === 2 ? "cooling" : "dormant"}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={BAND_RADII[band]}
                    style={ringStyle}
                  />
                </g>
              );
            })}
            {[75, 139, 211, 283].map((radius) => (
              <circle key={radius} className="orbit-guide" cx={CENTER} cy={CENTER} r={radius} />
            ))}

            <g className={`company-ring${mode === "companies" ? " is-primary" : ""}${hoveredCompany ? " has-focus" : ""}`}>
              {companyGroups.map((group) => {
                const label = fitCompanyLabel(group);
                const focused = hoveredCompany === group.name;
                const select = () => { if (!group.isOthers) setSelectedCompany(group.name); };
                return (
                  <g
                    key={group.name}
                    className={`company-sector${focused ? " is-focused" : ""}${group.isOthers ? " is-others" : ""}`}
                    onMouseEnter={() => setHoveredCompany(group.name)}
                    onMouseLeave={() => setHoveredCompany((current) => current === group.name ? null : current)}
                    onFocus={() => setHoveredCompany(group.name)}
                    onBlur={() => setHoveredCompany((current) => current === group.name ? null : current)}
                    onClick={select}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        select();
                      }
                    }}
                    tabIndex={group.isOthers ? -1 : 0}
                    role={group.isOthers ? undefined : "button"}
                    aria-label={group.isOthers
                      ? undefined
                      : `${group.name}, ${group.contacts.length} connections. Open company details.`}
                  >
                    <path
                      className="company-sector-hit"
                      d={arcPath(COMPANY_RING_R, group.start + 0.006, group.end - 0.006)}
                    />
                    <path
                      className="company-sector-band"
                      d={arcPath(COMPANY_RING_R, group.start + 0.006, group.end - 0.006)}
                      style={{ stroke: group.color }}
                    />
                    {label && (
                      <>
                        <path
                          id={`company-label-${slug(group.name)}`}
                          className="company-label-track"
                          d={labelArcPath(COMPANY_RING_R, group.start + 0.006, group.end - 0.006)}
                        />
                        <text
                          className="company-sector-label"
                          style={{ fontSize: label.size }}
                          dy={label.size / 3}
                        >
                          <textPath href={`#company-label-${slug(group.name)}`} startOffset="50%" textAnchor="middle">
                            {label.text}
                          </textPath>
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </g>

            {/* The collapsed tail is dozens of unrelated companies; drawing a
                spoke to each of its people is noise, so it only lights its band. */}
            {focusedCompany && !focusedCompany.group.isOthers && (
              <g className="company-fan" aria-hidden="true">
                {focusedCompany.people.map((item) => (
                  <line
                    key={`spoke-${item.contact.id}`}
                    x1={focusedCompany.anchor.x}
                    y1={focusedCompany.anchor.y}
                    x2={item.x}
                    y2={item.y}
                    style={{ stroke: focusedCompany.group.color }}
                  />
                ))}
                {focusedCompany.people.map((item, index) => (
                  <circle
                    key={`node-${item.contact.id}`}
                    className="company-fan-dot"
                    cx={item.x}
                    cy={item.y}
                    r={item.radius}
                    style={{ fill: focusedCompany.group.color, "--node-index": index } as CSSProperties}
                  />
                ))}
              </g>
            )}

            {positions.filter((item) => item.band === hoveredBand).map((item, index) => {
              const dim = visibleIds ? !visibleIds.has(item.contact.id) : false;
              return (
                <g
                  key={item.contact.id}
                  className={`orbit-person is-preview${dim ? " is-dim" : ""}`}
                  transform={`translate(${item.x},${item.y})`}
                  aria-hidden="true"
                  style={{ "--node-color": item.color, "--node-index": index } as CSSProperties}
                >
                  <circle className="orbit-person-dot" r={item.radius} />
                </g>
              );
            })}

            <g className="orbit-center">
              <circle cx={CENTER} cy={CENTER} r="72" />
              {focusedCompany?.group.isOthers ? (
                <>
                  <text className="orbit-center-kicker" x={CENTER} y={CENTER - 38}>THE LONG TAIL</text>
                  <text className="orbit-center-score orbit-center-zone-count" x={CENTER} y={CENTER + 3}>{focusedCompany.orgCount}</text>
                  <text className="orbit-center-name" x={CENTER} y={CENTER + 24}>smaller companies</text>
                  <text className="orbit-center-role" x={CENTER} y={CENTER + 43}>
                    {focusedCompany.people.length} people · {Math.round(focusedCompany.people.length / state.contacts.length * 100)}% of network
                  </text>
                  <text className="orbit-center-action" x={CENTER} y={CENTER + 60}>OUTSIDE YOUR TOP TEN</text>
                </>
              ) : focusedCompany ? (
                <>
                  <text className="orbit-center-kicker" x={CENTER} y={CENTER - 38}>COMPANY</text>
                  <text className="orbit-center-score orbit-center-zone-count" x={CENTER} y={CENTER + 3}>{focusedCompany.people.length}</text>
                  <text className="orbit-center-name" x={CENTER} y={CENTER + 24}>{focusedCompany.group.name}</text>
                  <text className="orbit-center-role" x={CENTER} y={CENTER + 43}>
                    {focusedCompany.averageRisk === null ? "No model scores" : `Avg score ${focusedCompany.averageRisk}/100`} · {Math.round(focusedCompany.people.length / state.contacts.length * 100)}% of network
                  </text>
                  <text className="orbit-center-action" x={CENTER} y={CENTER + 60}>CLICK TO OPEN COMPANY</text>
                </>
              ) : focusedZone ? (
                <>
                  <text className="orbit-center-kicker" x={CENTER} y={CENTER - 38}>{focusedZone.eyebrow.toUpperCase()}</text>
                  <text className="orbit-center-score orbit-center-zone-count" x={CENTER} y={CENTER + 3}>{focusedZone.people.length}</text>
                  <text className="orbit-center-name" x={CENTER} y={CENTER + 24}>{focusedZone.label} · {Math.round(focusedZone.people.length / state.contacts.length * 100)}% of network</text>
                  <text className="orbit-center-role" x={CENTER} y={CENTER + 43}>{focusedZone.averageRisk === null ? "No model scores" : `Avg score ${focusedZone.averageRisk}/100`} · {focusedZone.leadCompany}</text>
                  <text className="orbit-center-action" x={CENTER} y={CENTER + 60}>CLICK TO OPEN ZONE</text>
                </>
              ) : (
                <>
                  <text className="orbit-center-kicker" x={CENTER} y={CENTER - 27}>YOUR NETWORK</text>
                  <text className="orbit-center-score" x={CENTER} y={CENTER + 11}>{warmCount}</text>
                  <text className="orbit-center-role" x={CENTER} y={CENTER + 34}>close connections</text>
                </>
              )}
            </g>

            <g className="orbit-ring-labels" aria-hidden="true">
              <text className={focusedBand === 0 ? "is-focused" : ""} x="380" y="282">WARM · {Math.round(zoneSummaries[0].people.length / state.contacts.length * 100)}%</text>
              <text className={focusedBand === 1 ? "is-focused" : ""} x="380" y="210">ACTIVE · {Math.round(zoneSummaries[1].people.length / state.contacts.length * 100)}%</text>
              <text className={focusedBand === 2 ? "is-focused" : ""} x="380" y="138">DRIFTING · {Math.round(zoneSummaries[2].people.length / state.contacts.length * 100)}%</text>
              <text className={focusedBand === 3 ? "is-focused" : ""} x="380" y="66">DORMANT · {Math.round(zoneSummaries[3].people.length / state.contacts.length * 100)}%</text>
            </g>
          </svg>
          <div className="orbit-canvas-foot">
            <span>Closer means stronger</span>
            <span className="orbit-gradient-key"><i /> warmth &amp; relevance <i /></span>
            <span>Position uses warmth and available cadence</span>
          </div>
        </section>

        <aside className="orbit-insights">
          <section className="insight-card attention-card" aria-label="Cadence signals">
            <div className="insight-heading">
              <div>
                <p>Cadence signals</p>
                <span>Highest model scores</span>
              </div>
              <button aria-label="View all people" onClick={() => navigate("/people")}><ArrowUpRight size={15} /></button>
            </div>
            <div className="attention-list">
              {atRisk.length === 0 && <p>No model scores yet. Connect consented conversation history to assess relationship cadence.</p>}
              {atRisk.map((item) => (
                <button key={item.contact.id} onClick={() => setSelectedId(item.contact.id)}>
                  <span className="attention-avatar" style={{ background: item.color }}>{item.contact.init}</span>
                  <span className="attention-person">
                    <strong>{item.contact.name}</strong>
                    <small>{item.contact.org} · {dayLabel(item.contact)}</small>
                  </span>
                  <span className="attention-risk">{item.modelScore}/100</span>
                </button>
              ))}
            </div>
          </section>

          <section className="insight-card company-card">
            <div className="insight-heading">
              <div>
                <p>Strongest footholds</p>
                <span>Your company clusters</span>
              </div>
              <Building2 size={15} />
            </div>
            <div className="company-list">
              {strongestCompanies.map((group) => (
                <button
                  key={group.name}
                  className={hoveredCompany === group.name ? "is-linked" : ""}
                  onMouseEnter={() => setHoveredCompany(group.name)}
                  onMouseLeave={() => setHoveredCompany((current) => current === group.name ? null : current)}
                  onFocus={() => setHoveredCompany(group.name)}
                  onBlur={() => setHoveredCompany((current) => current === group.name ? null : current)}
                  onClick={() => { setMode("companies"); setSelectedCompany(group.name); }}
                >
                  <span className="company-mark" style={{ background: group.color }} />
                  <span><strong>{group.name}</strong><small>{group.contacts.length} connections</small></span>
                  <span className="company-meter"><i style={{ width: `${Math.max(16, group.contacts.length / strongestCompanies[0].contacts.length * 100)}%`, background: group.color }} /></span>
                </button>
              ))}
            </div>
          </section>

          <section className="insight-card orbit-explainer">
            <div><strong>Your network is always moving.</strong><span>Positions use saved warmth and available cadence estimates. Model scores are shown separately.</span></div>
          </section>
        </aside>
      </main>

      {contactExit.mounted && lastContact.current && (
        <ContactPanel contact={lastContact.current} closing={contactExit.closing} onClose={() => setSelectedId(null)} />
      )}
      {companyExit.mounted && lastIntel.current && (
        <CompanyPanel
          intel={lastIntel.current}
          closing={companyExit.closing}
          onSelect={(contact) => setSelectedId(contact.id)}
          onClose={() => setSelectedCompany(null)}
        />
      )}
    </div>
  );
}
