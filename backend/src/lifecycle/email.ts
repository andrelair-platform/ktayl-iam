/**
 * Derive the workplace email local-part from a person's name — `firstname.lastname`.
 * Pure + unit-tested. Accents are folded (Benoît → benoit), non-alnum runs collapse to a single
 * separator, and the result is lowercased. Collision handling (append -2, -3, …) is done by the
 * caller against existing identities — see LifecycleService.
 */
export function deriveLocalPart(fullName: string): string {
  const cleaned = (fullName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/['’]/g, '') // drop apostrophes (O'Brien → obrien)
    .replace(/[^a-z0-9]+/g, ' ') // everything else → space
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  // first token = given name, last token = family name (drops middle names)
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

/** Build the full address from a local-part + domain, applying an optional collision suffix. */
export function buildEmail(localPart: string, domain: string, suffix = 0): string {
  const lp = suffix > 0 ? `${localPart}${suffix + 1}` : localPart;
  return `${lp}@${domain}`;
}
