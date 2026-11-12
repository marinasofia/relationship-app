import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { EXIT_MS } from "../../lib/useExit";
import "../DraftSheet.css";
import "./AgentTabs.css";

// The bottom-sheet shell shared by the agent's sheets (meeting prep and
// finding a time). Same look and keyboard
// behaviour as the draft sheet: Escape closes, Tab stays inside.
export function AgentSheet({ label, icon, onClose, children }: {
  label: string; icon?: ReactNode; onClose: () => void; children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  return (
    <div className={"sheet-bg agent-sheet-bg" + (closing ? " is-out" : "")} onClick={close}>
      <div className="sheet agent-sheet agent-flow-sheet" role="dialog" aria-modal="true" aria-label={label}
        tabIndex={-1} ref={dialogRef} onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key !== "Tab") return;
          const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea:not(:disabled)');
          if (!nodes?.length) return;
          const first = nodes[0]; const last = nodes[nodes.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }}>
        <div className="sheet-grab" />
        <div className="sheet-h">{icon} {label}
          <button className="draft-close" aria-label="Close" onClick={close}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
