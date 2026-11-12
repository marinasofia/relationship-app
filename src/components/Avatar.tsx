import type { Contact } from "../types";
import { warmthOf } from "../services/warmth";
import "./Avatar.css";

interface AvatarProps {
  contact: Contact;
  size?: number;
}

// A person's initials inside a warmth-gradient ring, the signature warmth cue.
export function Avatar({ contact, size = 52 }: AvatarProps) {
  const w = warmthOf(contact.warmth);
  return (
    <div
      className="ring"
      style={{
        background: `linear-gradient(140deg, ${w.c}, ${w.c2})`,
        width: size + 6,
        height: size + 6,
      }}
    >
      <div className="ava" style={{ width: size, height: size, fontSize: size * 0.34 }}>
        {contact.init}
      </div>
    </div>
  );
}
