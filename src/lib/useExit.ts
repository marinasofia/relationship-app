import { useEffect, useState } from "react";

/** One exit beat, in ms, matches --dur-2 in tokens.css. */
export const EXIT_MS = 240;

// Keeps an overlay mounted for one beat after its `open` flag drops so it can
// animate out instead of unmounting mid-frame. `closing` drives the exit class.
export function useExit(open: boolean, ms: number = EXIT_MS) {
  const [phase, setPhase] = useState<"idle" | "open" | "closing">(open ? "open" : "idle");

  useEffect(() => {
    if (open) {
      setPhase("open");
      return;
    }
    setPhase((p) => (p === "open" ? "closing" : p));
    const t = window.setTimeout(() => setPhase("idle"), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);

  return { mounted: open || phase === "closing", closing: !open && phase === "closing" };
}
