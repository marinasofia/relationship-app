import type { CaptureInput, Contact } from "../types";

// Mock pool of people "recognized" from a capture, cycled deterministically by the
// capture sequence number.
const MOCK_NAMES = ["Riley Al-Amin", "Noah Frost", "Tomas Vega", "Ivy Chen", "Owen Park"];

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("");
}

// MODEL: parse a photo / scanned card / voice memo / note into a clean contact card
// in the background. This mock returns a deterministic person from the capture input
// alone. Swap in real OCR / vision / speech-to-text enrichment here, the
// contract is async so a real version drops in unchanged.
export async function enrichContact(
  input: CaptureInput,
): Promise<Partial<Contact> & { name: string; init: string }> {
  const name = MOCK_NAMES[(input.sequence ?? 0) % MOCK_NAMES.length];
  return {
    name,
    init: initialsOf(name),
    note: input.raw ?? "",
  };
}
