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

/**
 * Allocate a unique `firstname.lastname@domain` address, appending 2/3/… on collision. `isTaken` is the
 * caller's existence check — for the workplace namespace it must span **both** the employee `identity` AND the
 * `external_collaborator` tables (ADR-015), so an external never collides with an employee of the same name (or
 * vice-versa). `uniqueFallback` is a guaranteed-unique local part (matricule / `ext-*` username) used only in the
 * pathological 50-same-name case. Pure except for the injected async predicate → easy to unit-test.
 */
export async function allocateUniqueEmail(
  base: string,
  domain: string,
  isTaken: (email: string) => Promise<boolean>,
  uniqueFallback: string,
): Promise<string> {
  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = buildEmail(base, domain, suffix);
    if (!(await isTaken(candidate))) return candidate;
  }
  return buildEmail(uniqueFallback, domain); // pathological fallback — the key is unique
}
