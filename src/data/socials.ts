import { Linkedin, Twitter, Instagram, Globe, type LucideIcon } from "lucide-react";
import type { Social, SocialType } from "../types";
import { linkedinCanonicalSlug } from "../lib/linkedin";

// Presentation metadata for each social platform: label, brand-ish color, icon.
export const SOCIAL_META: Record<
  SocialType,
  { label: string; color: string; icon: LucideIcon }
> = {
  linkedin: { label: "LinkedIn", color: "#2F6FB0", icon: Linkedin },
  x: { label: "X", color: "#2A2622", icon: Twitter },
  instagram: { label: "Instagram", color: "#C2568C", icon: Instagram },
  site: { label: "Website", color: "#2F7E76", icon: Globe },
};

// Saved handles open as plain links the user visits themselves, never scraped.
export function socialUrl(s: Social): string {
  switch (s.type) {
    case "linkedin": {
      // Handles are normally bare slugs, but a pasted profile URL would
      // otherwise be prefixed onto itself and produce
      // ".../in/https://www.linkedin.com/in/slug". Reducing to the slug first
      // makes both forms open the same real profile.
      const slug = linkedinCanonicalSlug(s.handle) ?? s.handle.trim();
      return `https://www.linkedin.com/in/${slug}`;
    }
    case "x":
      return `https://x.com/${encodeURIComponent(s.handle.trim().replace(/^@/, ""))}`;
    case "instagram":
      return `https://www.instagram.com/${encodeURIComponent(s.handle.trim().replace(/^@/, ""))}`;
    case "site": {
      // startsWith("http") also passes "httpfoo://…", which is not a scheme.
      const handle = s.handle.trim();
      const absolute =
        handle.startsWith("http://") || handle.startsWith("https://");
      return absolute ? handle : `https://${handle}`;
    }
  }
}
