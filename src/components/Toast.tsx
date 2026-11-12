import { useRef } from "react";
import { Check } from "lucide-react";
import { useApp } from "../state/AppContext";
import { useExit } from "../lib/useExit";

// The single, quiet confirmation surface: a soft icon disc + the message,
// sliding up once, settling, and easing away. Styles live in global.css (.toast).
export function Toast() {
  const { state } = useApp();
  const { mounted, closing } = useExit(!!state.toast);
  const last = useRef(state.toast);
  if (state.toast) last.current = state.toast;
  if (!mounted) return null;
  return (
    <div className={"toast" + (closing ? " is-out" : "")}>
      <span className="toast-icon">
        <Check size={13} strokeWidth={2.75} />
      </span>
      <span>{last.current}</span>
    </div>
  );
}
