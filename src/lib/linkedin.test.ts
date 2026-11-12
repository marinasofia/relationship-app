import { describe, expect, it } from "vitest";
import {
  isLinkedinSlug,
  linkedinCanonicalSlug,
  linkedinSlugFromUrl,
} from "./linkedin";

// The load-bearing rule: linkedinSlugFromUrl is the only evidence that binds a
// contact without asking the user, so every address that is not unambiguously a
// LinkedIn profile must come back null.

describe("linkedinSlugFromUrl, real profile addresses", () => {
  it("accepts the canonical form", () => {
    expect(linkedinSlugFromUrl("https://www.linkedin.com/in/samplename/")).toBe(
      "samplename",
    );
  });

  it("accepts scheme-less forms", () => {
    expect(linkedinSlugFromUrl("linkedin.com/in/samplename")).toBe("samplename");
    expect(linkedinSlugFromUrl("www.linkedin.com/in/SampleName")).toBe("samplename");
  });

  it("accepts locale subdomains", () => {
    expect(linkedinSlugFromUrl("https://de.linkedin.com/in/samplename")).toBe(
      "samplename",
    );
    expect(linkedinSlugFromUrl("https://uk.linkedin.com/in/samplename")).toBe(
      "samplename",
    );
  });

  it("ignores tracking queries and fragments", () => {
    expect(linkedinSlugFromUrl("https://linkedin.com/in/samplename?trk=abc")).toBe(
      "samplename",
    );
    expect(linkedinSlugFromUrl("https://linkedin.com/in/samplename#about")).toBe(
      "samplename",
    );
  });

  it("keeps the person when the link points at a sub-page of their profile", () => {
    expect(
      linkedinSlugFromUrl(
        "https://linkedin.com/in/sample-name-1a2b3c/details/experience/",
      ),
    ).toBe("sample-name-1a2b3c");
  });

  it("decodes percent escapes", () => {
    expect(linkedinSlugFromUrl("https://linkedin.com/in/%C3%A9milie-durand")).toBe(
      "émilie-durand",
    );
  });

  it("keeps a malformed escape rather than throwing", () => {
    expect(() => linkedinSlugFromUrl("https://linkedin.com/in/%zz")).not.toThrow();
    expect(linkedinSlugFromUrl("https://linkedin.com/in/%zz")).toBe("%zz");
  });
});

describe("linkedinSlugFromUrl, addresses that only look like LinkedIn", () => {
  const hostile = [
    ["a lookalike domain", "https://notlinkedin.com/in/samplename"],
    ["a hostile suffix", "https://linkedin.com.evil.com/in/samplename"],
    ["the real host in the path", "https://evil.com/linkedin.com/in/samplename"],
    [
      "the real host in the fragment",
      "https://user:pw@evil.com/#linkedin.com/in/samplename",
    ],
    ["credentials in the authority", "https://user:pw@linkedin.com/in/samplename"],
    ["an unexpected port", "https://linkedin.com:8080/in/samplename"],
    ["a script scheme", "javascript:alert(1)//linkedin.com/in/samplename"],
    ["a data scheme", "data:text/html,linkedin.com/in/samplename"],
    ["a trailing-dot host", "https://linkedin.com./in/samplename"],
  ] as const;

  for (const [why, url] of hostile) {
    it(`refuses ${why}`, () => {
      expect(linkedinSlugFromUrl(url)).toBeNull();
    });
  }
});

describe("linkedinSlugFromUrl, LinkedIn addresses that are not profiles", () => {
  const notProfiles = [
    "https://linkedin.com/company/acme",
    "https://linkedin.com/school/mit",
    "https://linkedin.com/pub/samplename",
    "https://linkedin.com/in/",
    "https://linkedin.com/feed",
    "https://linkedin.com",
  ];

  for (const url of notProfiles) {
    it(`refuses ${url}`, () => {
      expect(linkedinSlugFromUrl(url)).toBeNull();
    });
  }
});

describe("linkedinSlugFromUrl, not addresses at all", () => {
  it("refuses a bare slug, which is not URL evidence", () => {
    expect(linkedinSlugFromUrl("maya-okonkwo-demo")).toBeNull();
  });

  it("refuses names and empty input", () => {
    for (const value of ["Sarah Chen", "maya.o", "", "   "]) {
      expect(linkedinSlugFromUrl(value)).toBeNull();
    }
  });
});

describe("isLinkedinSlug", () => {
  it("accepts real vanity slugs", () => {
    expect(isLinkedinSlug("maya-okonkwo-demo")).toBe(true);
    expect(isLinkedinSlug("sample-name-1a2b3c")).toBe(true);
  });

  it("rejects anything with a space, dot, slash or at-sign", () => {
    for (const value of [
      "Sarah Chen",
      "maya.o",
      "linkedin.com/in/x",
      "sarah@example.com",
      "ab",
      "",
    ]) {
      expect(isLinkedinSlug(value), value).toBe(false);
    }
  });
});

describe("linkedinCanonicalSlug, the unifier", () => {
  it("gives the same answer for the URL and bare forms of one profile", () => {
    const bare = linkedinCanonicalSlug("sample-name-1a2b3c");
    const url = linkedinCanonicalSlug(
      "https://www.linkedin.com/in/sample-name-1a2b3c/",
    );
    expect(bare).toBe("sample-name-1a2b3c");
    expect(url).toBe(bare);
  });

  it("keeps digits, which the old name-based fallback stripped", () => {
    // normalizeName's [^a-z\s'-] filter turned this into "sarah-chen-a b c",
    // so the two forms of one profile canonicalized differently and a
    // confirmed binding could stop resolving.
    expect(linkedinCanonicalSlug("sample-name-1a2b3c")).toBe("sample-name-1a2b3c");
  });

  it("still refuses a hostile address", () => {
    expect(linkedinCanonicalSlug("https://notlinkedin.com/in/samplename")).toBeNull();
  });

  it("refuses display names so they stay on the name-matching path", () => {
    expect(linkedinCanonicalSlug("Sarah Chen")).toBeNull();
    expect(linkedinCanonicalSlug("maya.o")).toBeNull();
  });
});

describe("case and decoding cannot split one profile into two identities", () => {
  it("accepts an uppercase path segment", () => {
    // URL lowercases the host but not the path, so this arrived as "/IN/x".
    expect(linkedinSlugFromUrl("HTTPS://LINKEDIN.COM/IN/samplename")).toBe(
      "samplename",
    );
  });

  it("gives one canonical form regardless of how the URL was typed", () => {
    const forms = [
      "https://www.linkedin.com/in/dana-r",
      "HTTPS://LINKEDIN.COM/IN/dana-r",
      "linkedin.com/in/Dana-R",
      "https://de.linkedin.com/in/DANA-R/",
    ];
    const slugs = new Set(forms.map((f) => linkedinSlugFromUrl(f)));
    expect(slugs).toEqual(new Set(["dana-r"]));
  });

  it("refuses a percent-escape that decodes out of slug shape", () => {
    // "%20" decodes to a space, and "sarah chen" is exactly what normalizeName
    // produces for the display name, so a confirmed URL binding would have
    // started matching the bare name, which name evidence may never do.
    expect(linkedinSlugFromUrl("https://linkedin.com/in/Sarah%20Chen")).toBeNull();
    expect(linkedinSlugFromUrl("https://linkedin.com/in/a%2Fb")).toBeNull();
    expect(linkedinSlugFromUrl("https://linkedin.com/in/x%2ey")).toBeNull();
  });

  it("still accepts an internationalised vanity URL", () => {
    expect(linkedinSlugFromUrl("https://linkedin.com/in/%C3%A9milie-durand")).toBe(
      "émilie-durand",
    );
  });
});
