import type { Contact } from "../types";

/** When you met: the first "met" interaction, falling back to the latest touchpoint. */
export function metAtOf(c: Contact): string {
  return c.interactions.find((ix) => ix.kind === "met")?.at ?? c.lastInteractionAt;
}
