import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Canonical JSON byte-identical to Python's
 *   json.dumps(obj, sort_keys=True, separators=(",",":"), ensure_ascii=True)
 * which is how the ERPNext producer (erpnext_hr_lifecycle) signs each event. We MUST rebuild these
 * exact bytes (sorted keys, no spaces, non-ASCII → \uXXXX) before the HMAC check — re-serialising
 * with JSON.stringify would reorder/space differently and the signature would never match. Proven
 * identical to the producer incl. accented FR names (see the n8n fan-out Code node).
 */
export function canonicalJson(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return pyStr(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return '{' + keys.map((k) => pyStr(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}

function pyStr(s: string): string {
  let o = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') o += '\\"';
    else if (ch === '\\') o += '\\\\';
    else if (c === 8) o += '\\b';
    else if (c === 9) o += '\\t';
    else if (c === 10) o += '\\n';
    else if (c === 12) o += '\\f';
    else if (c === 13) o += '\\r';
    else if (c < 0x20) o += '\\u' + c.toString(16).padStart(4, '0');
    else if (c < 0x80) o += ch;
    else if (c > 0xffff) {
      const h = Math.floor((c - 0x10000) / 0x400) + 0xd800;
      const l = ((c - 0x10000) % 0x400) + 0xdc00;
      o += '\\u' + h.toString(16).padStart(4, '0') + '\\u' + l.toString(16).padStart(4, '0');
    } else o += '\\u' + c.toString(16).padStart(4, '0');
  }
  return o + '"';
}

/**
 * Verify the `HR-Signature` (hex HMAC-SHA256 over the canonical event) with the shared signing key.
 * Empty key → verification is disabled (returns true) for dev-only unsigned events, matching the
 * producer (an empty HR_LIFECYCLE_SIGNING_KEY emits an unsigned event). Constant-time compare.
 */
export function verifySignature(event: unknown, signatureHex: string, key: string): boolean {
  return verifyRawSignature(canonicalJson(event), signatureHex, key);
}

/**
 * Verify over the EXACT raw body bytes the producer signed + published (the NATS message data is
 * already the canonical JSON). Preferred on the NATS path — no re-serialisation, so it can't drift.
 */
export function verifyRawSignature(rawBody: string, signatureHex: string, key: string): boolean {
  if (!key) return true; // unsigned/dev
  const want = createHmac('sha256', key).update(rawBody, 'utf8').digest('hex');
  if (!signatureHex || signatureHex.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(signatureHex), Buffer.from(want));
}
