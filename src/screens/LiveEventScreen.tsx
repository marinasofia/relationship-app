import { X, Clock, Sparkles, Check } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useApp } from "../state/AppContext";
import { CaptureBar } from "../components/CaptureBar";
import { enrichContact } from "../services/enrich";
import { useExit } from "../lib/useExit";
import type { CaptureKind } from "../types";
import "./LiveEventScreen.css";

// Nudges are tied to the event's schedule, not a dumb timer: a midpoint check-in,
// then a before-you-leave prompt, and only ever when nothing has been captured.
const NUDGE_MIDPOINT = 0.45;
const NUDGE_CLOSING = 0.85;
const TICK_MS = 30_000;

// "During" mode: one-tap capture and gentle, schedule-timed nudges.
export function LiveEventScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, dispatch, flash } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const event = state.events.find((e) => e.id === id);

  // Leaving an event without an explicit End should not strand captured people.
  useEffect(() => {
    return () => {
      dispatch({ type: "CLEAR_CAPTURED" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const start = event ? Date.parse(event.startsAt) : 0;
  const end = event ? Date.parse(event.endsAt) : 0;
  const fraction = event ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0;

  const canNudge = !!event && state.settings.nudges && state.captured.length === 0;
  const nudge = !canNudge ? null : fraction >= NUDGE_CLOSING ? (
    <>
      <b>Almost over.</b> Anyone worth remembering before you head out?
    </>
  ) : fraction >= NUDGE_MIDPOINT ? (
    <>
      <b>You're halfway in.</b> You haven't saved anyone yet. Who was worth remembering?
    </>
  ) : null;

  // The nudge eases away (first capture, threshold passed) instead of vanishing.
  const nudgeExit = useExit(nudge !== null);
  const lastNudge = useRef<ReactNode>(nudge);
  if (nudge !== null) lastNudge.current = nudge;

  if (!event) {
    navigate("/events");
    return null;
  }

  const minutesLeft = Math.max(0, Math.ceil((end - now) / 60_000));
  const meta =
    now < start
      ? "starting soon"
      : now > end
        ? "wrapping up"
        : `in progress · ${minutesLeft} min left`;

  const capture = async (kind: CaptureKind, raw?: string) => {
    // MODEL: raw text (a quick note) flows into enrichment so what you typed
    // lands on the captured person, not just a generic capture stamp. The
    // seam is async (real OCR/vision later; instant mock today).
    const person = await enrichContact({ kind, raw, sequence: state.captured.length });
    dispatch({
      type: "ADD_CAPTURED",
      person: { name: person.name, init: person.init, kind, note: person.note || undefined },
    });
  };

  const endEvent = () => {
    const count = state.captured.length;
    if (count > 0) {
      dispatch({
        type: "SAVE_CAPTURED",
        eventName: event.name,
        at: new Date().toISOString(),
      });
      flash(`${count} ${count === 1 ? "person" : "people"} saved from ${event.name}`);
    }
    navigate("/events");
  };

  return (
    <div className="screen live">
      <div className="live-top">
        <button className="ghost" onClick={endEvent}>
          <X size={18} /> End
        </button>
        <span className="live-dot">● live</span>
      </div>

      <div className="live-title">{event.name}</div>
      <div className="live-meta">
        <Clock size={13} /> {meta}
      </div>
      <div className="prog">
        <div className="prog-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>

      {nudgeExit.mounted && (
        <div className={"nudge" + (nudgeExit.closing ? " is-out" : "")}>
          <Sparkles size={16} />
          <div>{lastNudge.current}</div>
        </div>
      )}

      <div className="cap-label">Capture someone</div>
      <CaptureBar onCapture={capture} />

      <div className="cap-label" style={{ marginTop: 18 }}>
        Saved here{" "}
        {state.captured.length > 0 && (
          <span className="count">{state.captured.length}</span>
        )}
      </div>
      <div className="cap-list">
        {state.captured.length === 0 && (
          <div className="empty">
            Nobody yet. Tap a button above the moment you meet someone.
          </div>
        )}
        {state.captured.map((p, i) => (
          <div className="crow" key={i}>
            <div className="ava sm" style={{ background: "#EDE6DB", color: "#7A7266" }}>
              {p.init}
            </div>
            <div className="crow-main">
              <div className="crow-name">{p.name}</div>
              <div className="crow-sub">just now · {p.note || p.kind}</div>
            </div>
            <Check size={16} color="#5E9A8E" style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}
