// LinkedIn profile identity: interpreting a handle, whatever form it arrives in.
//
// Two forms exist in the wild and the app has been broken on both.
//
// What contacts actually store is a bare vanity slug, "maya-okonkwo", and the
// old parser only understood full links, so a stored social could never match
// anything. Meanwhile the URL side searched for "linkedin.com/in/" *anywhere in
// the string* instead of parsing the address, so notlinkedin.com/in/sarahchen
// and evil.com/linkedin.com/in/sarahchen both produced the same slug as the
// real profile, and that path binds a contact with no confirmation.
//
// One module owns interpretation so the two forms cannot drift apart again.
// src/data/socials.ts owns the opposite direction (building a link to open).

/** Hosts that can serve a real profile: linkedin.com and its locale subdomains. */
function isLinkedinHost(hostname: string): boolean {
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

/**
 * The slug from a LinkedIn profile URL, or null if the address is not one.
 *
 * Parsed rather than pattern-matched, because every interesting attack is an
 * address that *contains* the right text in the wrong place. Anything that is
 * not unambiguously a profile on a LinkedIn host is refused, this is the only
 * evidence that binds a contact automatically, so it has to be evidence.
 */
export function linkedinSlugFromUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Scheme-less forms are common and legitimate ("linkedin.com/in/x"). Adding
  // the scheme also forces the authority to parse, which is what catches
  // "user:pw@evil.com/#linkedin.com/in/x", its host is evil.com.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // A profile link carries no credentials and no port; both are smuggling shapes.
  if (url.username || url.password || url.port) return null;
  if (!isLinkedinHost(url.hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  // "/in/<slug>", trailing segments are that same person's sub-pages
  // ("/details/experience"), so they are ignored rather than refused.
  //
  // The comparison is case-insensitive because `URL` lowercases the host but
  // leaves the path alone, so "HTTPS://LINKEDIN.COM/IN/x" arrives with "/IN/x".
  // Rejecting that looked like a harmless false negative and was not: the two
  // call sites normalized differently, so the same profile canonicalized two
  // ways and a confirmed binding stopped resolving when the case changed.
  if (segments[0]?.toLowerCase() !== "in" || !segments[1]) return null;

  return decodeSlug(segments[1]);
}

/**
 * Whether a bare string is shaped like a vanity slug.
 *
 * Deliberately excludes dots and spaces: LinkedIn slugs contain neither, and
 * excluding them keeps display-name fragments like "maya.o" or "Sarah Chen" on
 * the name-matching path where a human confirms them.
 */
export function isLinkedinSlug(raw: string): boolean {
  const trimmed = raw.trim();
  // Letters of any script, because vanity links are internationalised, but no
  // whitespace, slashes, dots, at-signs or control characters, which is what
  // keeps a decoded slug from wandering into the namespace display names use.
  return /^[\p{L}\p{N}%-]{3,100}$/u.test(trimmed);
}

/**
 * The canonical slug for a handle in *either* form, the app's stored bare slug
 * or a full URL. Null when the value is neither.
 *
 * Used for canonicalization and for the stored-contact side of matching, where
 * both forms are app-controlled and equally trustworthy. It is deliberately NOT
 * used for handles observed elsewhere.
 */
export function linkedinCanonicalSlug(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fromUrl = linkedinSlugFromUrl(trimmed);
  if (fromUrl) return fromUrl;

  return isLinkedinSlug(trimmed) ? decodeSlug(trimmed) : null;
}

/**
 * Percent-decode where possible, lowercase always, and only if the result is
 * still a slug.
 *
 * Re-checking the shape after decoding is the point. `%20` decodes to a space,
 * so `/in/Sarah%20Chen` produced the canonical `"sarah chen"`, which is
 * exactly what `normalizeName` produces for the *display name* "Sarah Chen".
 * A binding confirmed for the URL then silently matched the bare name, which
 * is the one thing name evidence is never allowed to do.
 *
 * Malformed escapes keep their raw form rather than throwing: an OCR-mangled
 * URL should fail to match, not abort resolution for everything else in the
 * batch, and an identically-mangled pair still matches itself.
 */
function decodeSlug(segment: string): string | null {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the raw form; it is still slug-shaped and still matches itself.
  }
  const lowered = decoded.toLowerCase();
  return isLinkedinSlug(lowered) ? lowered : null;
}
