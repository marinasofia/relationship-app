import type { CSSProperties } from "react";
import "./BrandMark.css";

interface BrandMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

/** The app mark: you at the center, with two people nearby. */
export function BrandMark({ size = 28, className = "", title }: BrandMarkProps) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle className="brand-dot" cx="11" cy="15" r="5" />
      <circle className="brand-dot" cx="21" cy="8" r="3" opacity="0.6" />
      <circle className="brand-dot" cx="21" cy="21" r="2.5" opacity="0.4" />
    </svg>
  );
}

interface BrandLockupProps extends BrandMarkProps {
  compact?: boolean;
  style?: CSSProperties;
}

export function BrandLockup({ size = 28, className = "", compact = false, style }: BrandLockupProps) {
  return (
    <span className={`brand-lockup ${compact ? "is-compact" : ""} ${className}`.trim()} style={style}>
      <BrandMark size={size} />
      <span>Relationship App</span>
    </span>
  );
}
