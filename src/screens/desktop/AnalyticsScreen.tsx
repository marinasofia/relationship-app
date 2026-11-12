import { useMemo, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../state/AppContext";
import { Avatar } from "../../components/Avatar";
import { DraftSheet } from "../../components/DraftSheet";
import {
  getContactRhythm,
  getEventRoi,
  getFocusQueue,
  getMomentum,
  getNetworkHealth,
  getTopCompanies,
  type ContactRhythm,
} from "../../services/analytics";
import { warmthOf } from "../../services/warmth";
import type { Contact, WarmthLabel } from "../../types";
import "./AnalyticsScreen.css";

// The desktop dashboard: a calm read on your network. Every number comes from
// src/services/analytics, the components below only map values to pixels.

const DAY_MS = 24 * 60 * 60 * 1000;

const BAND_ORDER: WarmthLabel[] = ["Warm", "Steady", "Cooling", "Going cold"];

// A representative warmth value inside each band, used to fetch its gradient.
const BAND_SAMPLE: Record<WarmthLabel, number> = {
  Warm: 85,
  Steady: 55,
  Cooling: 35,
  "Going cold": 10,
};

// Kicker + Fraunces headline + one-line sub, the header every card shares.
function CardHead({ kicker, title, sub }: { kicker: string; title: string; sub: ReactNode }) {
  return (
    <>
      <div className="ana-kicker">{kicker}</div>
      <h2 className="ana-h">{title}</h2>
      <div className="ana-hsub">{sub}</div>
    </>
  );
}

// A focus score as a small ring: hairline track, warmth-gradient arc,
// tabular number in the middle.
function ScoreRing({ contact, score }: { contact: Contact; score: number }) {
  const S = 26;
  const R = 11;
  const C = 2 * Math.PI * R;
  const w = warmthOf(contact.warmth);
  const gid = `fq-ring-${contact.id}`;
  return (
    <svg
      className="fq-ring"
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      role="img"
      aria-label={`Focus score ${score}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={w.c} />
          <stop offset="100%" stopColor={w.c2} />
        </linearGradient>
      </defs>
      <circle className="fq-ring-track" cx={S / 2} cy={S / 2} r={R} />
      <circle
        className="fq-ring-arc"
        cx={S / 2}
        cy={S / 2}
        r={R}
        stroke={`url(#${gid})`}
        strokeDasharray={`${(score / 100) * C} ${C}`}
        transform={`rotate(-90 ${S / 2} ${S / 2})`}
      />
      <text className="fq-ring-num" x={S / 2} y={S / 2}>
        {score}
      </text>
    </svg>
  );
}

// 12-week average warmth, drawn by hand: ember line over a fading ember fill,
// three faint gridlines, a dashed line back to where you were 12 weeks ago,
// and the current value pinned to the end of the line.
function Sparkline({ points }: { points: number[] }) {
  const W = 560;
  const H = 110;
  const PAD_L = 6;
  const PAD_R = 40; // room for gridline labels
  const PAD_T = 10;
  const PAD_B = 8;
  const n = points.length;
  const x = (i: number) => PAD_L + (i / Math.max(1, n - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v / 100) * (H - PAD_T - PAD_B);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(n - 1)},${H - PAD_B} L${x(0)},${H - PAD_B} Z`;
  const first = points[0] ?? 0;
  const last = points[n - 1] ?? 0;
  const GRID = [40, 60, 80];
  const endLeft = (x(n - 1) / W) * 100;
  const endTop = (y(last) / H) * 100;
  return (
    <div className="spark-wrap">
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0864a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#e0864a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {GRID.map((v) => (
          <line key={v} className="spark-grid" x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} />
        ))}
        <line className="spark-ref" x1={x(0)} y1={y(first)} x2={x(n - 1)} y2={y(first)} />
        <path className="spark-area" d={area} />
        <path className="spark-line" d={line} />
      </svg>
      {GRID.map((v) => (
        <span key={v} className="spark-glabel" style={{ top: `${(y(v) / H) * 100}%` }}>
          {v}
        </span>
      ))}
      <span className="spark-reflabel" style={{ top: `${(y(first) / H) * 100}%` }}>
        12w ago
      </span>
      <span className="spark-enddot" style={{ left: `${endLeft}%`, top: `${endTop}%` }} />
      <span className="spark-now" style={{ left: `${endLeft}%`, top: `${endTop}%` }}>
        {Math.round(last)} now
      </span>
    </div>
  );
}

// One contact's cadence: a dot per touchpoint, thin arcs spanning each gap,
// the current silence dashed, and a tick where their usual gap says the next
// touch is due (its label shows on hover).
function RhythmStrip({ contact, rhythm }: { contact: Contact; rhythm: ContactRhythm }) {
  const W = 560;
  const H = 46;
  const PAD = 14;
  const midY = 22;
  const times = contact.interactions.map((ix) => Date.parse(ix.at)).sort((a, b) => a - b);
  if (times.length === 0) return null;
  const now = Date.now();
  const lastAt = times[times.length - 1];
  const dueAt = rhythm.medianGap !== null ? lastAt + rhythm.medianGap * DAY_MS : null;
  const t0 = times[0];
  const t1 = Math.max(now, dueAt ?? now);
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => PAD + ((t - t0) / span) * (W - PAD * 2);

  return (
    <svg className="rhythm" viewBox={`0 0 ${W} ${H}`}>
      <line className="rhythm-base" x1={x(t0)} y1={midY} x2={x(t1)} y2={midY} />
      {times.slice(1).map((t, i) => {
        const a = x(times[i]);
        const b = x(t);
        const lift = Math.min(13, 4 + (b - a) * 0.05);
        return (
          <path
            key={i}
            className="rhythm-arc"
            d={`M${a},${midY} Q${(a + b) / 2},${midY - lift} ${b},${midY}`}
          />
        );
      })}
      <line className="rhythm-silence" x1={x(lastAt)} y1={midY} x2={x(now)} y2={midY} />
      {dueAt !== null && (
        <g className="rhythm-due" transform={`translate(${x(dueAt)},0)`}>
          <line className="rhythm-due-hit" x1={0} y1={2} x2={0} y2={H - 2} />
          <line x1={0} y1={midY - 9} x2={0} y2={midY + 9} />
          <text y={midY + 21}>usual pace</text>
        </g>
      )}
      {times.map((t, i) => (
        <circle
          key={i}
          className={"rhythm-dot" + (i === 0 ? " first" : "")}
          cx={x(t)}
          cy={midY}
          r={i === 0 ? 5 : 4}
        />
      ))}
      <circle className="rhythm-now" cx={x(now)} cy={midY} r={3} />
    </svg>
  );
}

// One momentum stat: the number, its label, and where it's heading.
function MomentumStat({ label, value, prev }: { label: string; value: number; prev: number }) {
  const d = value - prev;
  return (
    <div className="mo-stat">
      <div className="mo-value">{value}</div>
      <div className="mo-label">{label}</div>
      <div className={"mo-delta " + (d > 0 ? "up" : d < 0 ? "down" : "flat")}>
        {d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : "no change"}
      </div>
    </div>
  );
}

export function AnalyticsScreen() {
  const { state } = useApp();
  const navigate = useNavigate();
  const [draftFor, setDraftFor] = useState<Contact | null>(null);
  const [rhythmId, setRhythmId] = useState<string | null>(null);

  const queue = useMemo(() => getFocusQueue(state.contacts), [state.contacts]);
  const health = useMemo(
    () => getNetworkHealth(state.contacts),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dyadRev invalidates the dyad registry getDecayRisk reads
    [state.contacts, state.dyadRev],
  );
  const roi = useMemo(
    () => getEventRoi(state.past, state.contacts),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dyadRev invalidates the dyad registry getDecayRisk reads
    [state.past, state.contacts, state.dyadRev],
  );
  const companies = useMemo(() => getTopCompanies(state.contacts), [state.contacts]);
  const momentum = useMemo(() => getMomentum(state.contacts), [state.contacts]);

  const rhythmContact =
    state.contacts.find((c) => c.id === rhythmId) ?? queue[0]?.contact ?? state.contacts[0];
  const rhythm = rhythmContact ? getContactRhythm(rhythmContact) : null;

  if (state.contacts.length === 0) {
    return (
      <div className="ana">
        <div className="ana-empty">
          <Sparkles size={22} />
          <div className="ana-empty-h">Numbers need people first.</div>
          <div className="ana-empty-sub">
            Capture someone at your next event and this page lights up.
          </div>
          <button className="cta" onClick={() => navigate("/events")}>
            Open events
          </button>
        </div>
      </div>
    );
  }

  const maxBand = Math.max(1, ...BAND_ORDER.map((b) => health.bands[b]));
  const maxMet = Math.max(1, ...roi.map((e) => e.met));
  const maxCompany = Math.max(1, ...companies.map((co) => co.count));
  const deltaDir = health.delta > 0 ? "up" : health.delta < 0 ? "down" : "flat";
  const deltaText =
    health.delta === 0
      ? "even with a month ago"
      : `${health.delta > 0 ? "+" : "−"}${Math.abs(health.delta)} vs a month ago`;
  const ratioTone =
    rhythm?.ratio == null
      ? ""
      : rhythm.ratio <= 1.5
        ? " calm"
        : rhythm.ratio <= 3
          ? " drifting"
          : " cold";

  return (
    <div className="ana">
      <div className="ana-inner">
        <div className="h1">Analytics</div>
        <div className="sub">Your network's pulse, at a glance.</div>

        <div className="ana-grid">
          {/* 1, focus queue */}
          <section className="ana-card wide">
            <CardHead
              kicker="Tend"
              title="Who to focus on"
              sub="Ranked by focus score, warmth, recency, and risk blended."
            />
            {queue.map(({ contact, score, reason }, i) => {
              const band = warmthOf(contact.warmth);
              return (
                <div className="fq-row" key={contact.id}>
                  <span className="fq-rank">{String(i + 1).padStart(2, "0")}</span>
                  <Avatar contact={contact} size={40} />
                  <div className="fq-main">
                    <div className="fq-name">{contact.name}</div>
                    <div className="fq-sub">
                      {contact.role}
                      {contact.org ? ` · ${contact.org}` : ""}
                    </div>
                  </div>
                  <span
                    className="fq-reason"
                    style={{
                      color: band.c,
                      borderColor: `${band.c}55`,
                      background: `${band.c}12`,
                    }}
                  >
                    {reason}
                  </span>
                  <ScoreRing contact={contact} score={score} />
                  <button className="fq-draft" onClick={() => setDraftFor(contact)}>
                    <Sparkles size={13} /> Draft follow-up
                  </button>
                </div>
              );
            })}
          </section>

          {/* 2, network health */}
          <section className="ana-card wide">
            <CardHead
              kicker="Pulse"
              title="Network health"
              sub={
                <>
                  Average warmth across your network, last 12 weeks.{" "}
                  <span className={`hs-delta ${deltaDir}`}>{deltaText}</span>
                </>
              }
            />
            <Sparkline points={health.trajectory} />

            <div className="bands">
              {BAND_ORDER.map((label) => {
                const w = warmthOf(BAND_SAMPLE[label]);
                const count = health.bands[label];
                return (
                  <div className="band-row" key={label}>
                    <span className="band-label">{label}</span>
                    <span className="band-track">
                      <span
                        className="band-fill"
                        style={{
                          width: `${(count / maxBand) * 100}%`,
                          background: `linear-gradient(90deg, ${w.c}, ${w.c2})`,
                        }}
                      />
                    </span>
                    <span className="band-count">{count}</span>
                  </div>
                );
              })}
            </div>

            <div className="stat-chips">
              <span className="stat-chip">
                <b>{Math.round(health.followUpRate * 100)}%</b> followed up
              </span>
              <span className="stat-chip">
                <b>{health.cooling}</b> cooling
              </span>
              <span className="stat-chip">
                <b>{health.reconnected}</b> reconnected
              </span>
            </div>
          </section>

          {/* 3, where your network works */}
          <section className="ana-card wide">
            <CardHead
              kicker="Terrain"
              title="Where your network works"
              sub="The companies your people cluster in."
            />
            <div className="co-grid">
              {companies.map((co) => (
                <div className="co-row" key={co.org}>
                  <div className="co-top">
                    <span className="co-name">{co.org}</span>
                    <span className="co-meta">
                      {", "}
                      {co.count} {co.count === 1 ? "person" : "people"} ·{" "}
                      <b className={co.warmCount > 0 ? "lit" : ""}>{co.warmCount} warm</b>
                    </span>
                  </div>
                  <div className="co-track">
                    <div className="co-fill" style={{ width: `${(co.count / maxCompany) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {companies.length === 0 && (
              <div className="ana-quiet">Add where people work and the map draws itself.</div>
            )}
          </section>

          {/* 4, event ROI */}
          <section className="ana-card">
            <CardHead kicker="Returns" title="Event ROI" sub="What each event turned into." />
            {roi.map((e) => (
              <div className="roi-row" key={e.id}>
                <div className="roi-top">
                  <span className="roi-name">{e.name}</span>
                  <span className={"roi-warm" + (e.warmNow > 0 ? " lit" : "")}>
                    {e.warmNow} still warm
                  </span>
                </div>
                <div className="roi-track" style={{ width: `${(e.met / maxMet) * 100}%` }}>
                  <div className="roi-fill" style={{ width: `${e.followRate * 100}%` }} />
                </div>
                <div className="roi-sub">
                  {e.met} met → {e.followed} followed up
                </div>
              </div>
            ))}
            {roi.length === 0 && (
              <div className="ana-quiet">Your first event's story lands here.</div>
            )}
          </section>

          {/* 5, momentum */}
          <section className="ana-card">
            <CardHead kicker="Motion" title="Momentum" sub="Last 30 days vs the 30 before." />
            <div className="mo-grid">
              <MomentumStat label="Met" value={momentum.met30} prev={momentum.met30Prev} />
              <MomentumStat
                label="Follow-ups sent"
                value={momentum.followups30}
                prev={momentum.followups30Prev}
              />
              <MomentumStat
                label="Est. replies"
                value={momentum.replies30}
                prev={momentum.replies30Prev}
              />
            </div>
          </section>

          {/* 6, per-contact rhythm */}
          <section className="ana-card wide">
            <CardHead kicker="Cadence" title="Rhythm" sub="How often you actually talk." />
            {rhythmContact && rhythm && (
              <>
                <select
                  className="rhythm-pick"
                  value={rhythmContact.id}
                  onChange={(e) => setRhythmId(e.target.value)}
                >
                  {state.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <RhythmStrip contact={rhythmContact} rhythm={rhythm} />
                <div className={"rhythm-read" + ratioTone}>
                  {rhythm.ratio !== null && rhythm.medianGap !== null ? (
                    <>
                      Quiet for <b>{rhythm.silenceDays}d</b>, {rhythm.ratio}× their usual ~
                      {Math.round(rhythm.medianGap)}d gap.
                    </>
                  ) : (
                    <>One more touchpoint and their rhythm shows up here.</>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {draftFor && <DraftSheet contact={draftFor} onClose={() => setDraftFor(null)} />}
    </div>
  );
}
