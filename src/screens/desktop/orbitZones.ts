export const ORBIT_ZONE_SLUGS = ["core", "active", "drifting", "dormant"] as const;

export type OrbitZoneSlug = (typeof ORBIT_ZONE_SLUGS)[number];

export interface OrbitZoneInfo {
  slug: OrbitZoneSlug;
  label: string;
  eyebrow: string;
  description: string;
  guidance: string;
}

export const ORBIT_ZONES: OrbitZoneInfo[] = [
  {
    slug: "core",
    label: "Warm",
    eyebrow: "Closest relationships",
    description: "Strong, recent, and reliably active",
    guidance: "Protect the rhythm. Small, genuine touches keep these relationships strong.",
  },
  {
    slug: "active",
    label: "Active",
    eyebrow: "Healthy momentum",
    description: "Connected and moving at a natural rhythm",
    guidance: "Build on the momentum. Follow through on shared ideas and recent conversations.",
  },
  {
    slug: "drifting",
    label: "Drifting",
    eyebrow: "Worth a nudge",
    description: "Momentum is fading; a small note could help",
    guidance: "Reach out while context is still fresh. A lightweight check-in is usually enough.",
  },
  {
    slug: "dormant",
    label: "Dormant",
    eyebrow: "Ready to reconnect",
    description: "Quiet relationships with room to restart",
    guidance: "Restart with relevance. Lead with a real reason to reconnect, not an empty hello.",
  },
];

export function bandForRisk(risk: number): number {
  if (risk < 31) return 0;
  if (risk < 56) return 1;
  if (risk < 76) return 2;
  return 3;
}

export function zoneForSlug(slug: string | undefined): (OrbitZoneInfo & { band: number }) | null {
  const band = ORBIT_ZONES.findIndex((zone) => zone.slug === slug);
  return band < 0 ? null : { ...ORBIT_ZONES[band], band };
}
