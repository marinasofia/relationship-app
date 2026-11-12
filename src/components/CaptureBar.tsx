import { useState } from "react";
import { Camera, Check, ScanLine, Mic, Pencil } from "lucide-react";
import type { CaptureKind } from "../types";
import "./CaptureBar.css";

interface CaptureBarProps {
  /** raw is the typed text for quick notes; other kinds capture instantly */
  onCapture: (kind: CaptureKind, raw?: string) => void;
}

const BUTTONS: { kind: CaptureKind; label: string; Icon: typeof Camera }[] = [
  { kind: "photo", label: "Photo", Icon: Camera },
  { kind: "card", label: "Scan card", Icon: ScanLine },
  { kind: "voice", label: "Voice memo", Icon: Mic },
  { kind: "note", label: "Quick note", Icon: Pencil },
];

// One-tap capture: the effortless way to remember someone mid-conversation.
// Quick note is the exception, it opens a one-line input so what you type
// lands on the captured person.
export function CaptureBar({ onCapture }: CaptureBarProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const closeNote = () => {
    setNote("");
    setNoteOpen(false);
  };

  const saveNote = () => {
    onCapture("note", note.trim() || undefined);
    closeNote();
  };

  return (
    <div>
      <div className="cap-grid">
        {BUTTONS.map(({ kind, label, Icon }) => (
          <button
            className={"cap" + (kind === "note" && noteOpen ? " active" : "")}
            key={kind}
            onClick={() => (kind === "note" ? setNoteOpen((v) => !v) : onCapture(kind))}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {noteOpen && (
        <form
          className="cap-note"
          onSubmit={(e) => {
            e.preventDefault();
            saveNote();
          }}
        >
          <input
            className="cap-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeNote();
            }}
            placeholder="One line about them…"
            aria-label="Quick note"
            autoFocus
          />
          <button className="cap-note-save" type="submit" aria-label="Save note">
            <Check size={15} />
          </button>
        </form>
      )}
    </div>
  );
}
