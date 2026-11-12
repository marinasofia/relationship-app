import { describe, expect, it } from "vitest";
import { socialUrl } from "./socials";
import { CONTACTS } from "./contacts";
import { generateContacts } from "./generateContacts";
import { linkedinCanonicalSlug } from "../lib/linkedin";
import type { Social } from "../types";

// The round trip is the point. A stored handle must survive being turned into a
// link and read back, that property is what the identity seam depends on, and
// its absence is why a whole matching path sat dead without any test noticing.

const linkedinSocials = (contacts: { socials: Social[] }[]) =>
  contacts.flatMap((c) => c.socials.filter((s) => s.type === "linkedin"));

describe("socialUrl round-trips real seed data", () => {
  it("has seed contacts with LinkedIn socials to check", () => {
    expect(linkedinSocials(CONTACTS).length).toBeGreaterThan(0);
    expect(linkedinSocials(generateContacts(192)).length).toBeGreaterThan(0);
  });

  it("recovers the handle from the link for every handwritten contact", () => {
    for (const social of linkedinSocials(CONTACTS)) {
      expect(linkedinCanonicalSlug(socialUrl(social)), social.handle).toBe(
        social.handle,
      );
    }
  });

  it("recovers the handle from the link for every generated contact", () => {
    for (const social of linkedinSocials(generateContacts(192))) {
      expect(linkedinCanonicalSlug(socialUrl(social)), social.handle).toBe(
        social.handle,
      );
    }
  });
});

describe("socialUrl", () => {
  it("builds a profile link from a bare slug", () => {
    expect(socialUrl({ type: "linkedin", handle: "maya-okonkwo-demo" })).toBe(
      "https://www.linkedin.com/in/maya-okonkwo-demo",
    );
  });

  it("does not prefix a URL onto itself", () => {
    // Previously produced ".../in/https://www.linkedin.com/in/samplename".
    expect(
      socialUrl({
        type: "linkedin",
        handle: "https://www.linkedin.com/in/samplename",
      }),
    ).toBe("https://www.linkedin.com/in/samplename");
  });

  it("passes through an absolute site URL and prefixes a bare host", () => {
    expect(socialUrl({ type: "site", handle: "https://example.com" })).toBe(
      "https://example.com",
    );
    expect(socialUrl({ type: "site", handle: "example.com" })).toBe(
      "https://example.com",
    );
  });

  it("treats a scheme-shaped lookalike as relative", () => {
    // "httpfoo://x" passed the old startsWith("http") check and was returned
    // verbatim as if it were a real address.
    expect(socialUrl({ type: "site", handle: "httpfoo://x" })).toBe(
      "https://httpfoo://x",
    );
  });
});
