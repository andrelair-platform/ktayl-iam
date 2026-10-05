import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, verifySignature } from './hmac.js';

// Golden vector cross-verified against Python:
//   json.dumps(ev, sort_keys=True, separators=(",",":"))  # ensure_ascii defaults True
//   hmac.new(key.encode(), body, sha256).hexdigest()
// This locks our canonical form to the ERPNext producer's signing bytes (incl. accented FR text).
const EVENT = {
  schema: 'ktayl.hr.lifecycle/v1',
  event: 'joiner',
  occurred_at: '2026-10-04T21:00:00+00:00',
  effective_date: null,
  source: 'erpnext',
  subject: {
    matricule: '100004',
    employee: 'HR-EMP-00007',
    employee_name: 'Benoît Lefèvre',
    email: '100004@ktayl.local',
    job: null,
    department: 'Région Sud — Souscription',
    grade: null,
    entity: 'Ktayl Solutions',
    country: 'France',
    status: 'Active',
  },
};
const KEY = 'testkey-éàü-123';
const GOLDEN = 'fae853531afaf9d7d16799b71f62761ecab2a3bb132bde907bda2e55c842cbc6';

describe('canonicalJson / verifySignature', () => {
  it('matches the Python producer HMAC (golden vector, accented text)', () => {
    const got = createHmac('sha256', KEY).update(canonicalJson(EVENT), 'utf8').digest('hex');
    expect(got).toBe(GOLDEN);
  });
  it('verifySignature accepts the golden signature', () => {
    expect(verifySignature(EVENT, GOLDEN, KEY)).toBe(true);
  });
  it('rejects a tampered event', () => {
    const tampered = { ...EVENT, event: 'leaver' };
    expect(verifySignature(tampered, GOLDEN, KEY)).toBe(false);
  });
  it('rejects a wrong-length / empty signature', () => {
    expect(verifySignature(EVENT, '', KEY)).toBe(false);
    expect(verifySignature(EVENT, 'deadbeef', KEY)).toBe(false);
  });
  it('empty key disables verification (dev unsigned)', () => {
    expect(verifySignature(EVENT, '', '')).toBe(true);
  });
  it('canonical form: sorted keys, no spaces', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ x: 'é' })).toBe('{"x":"\\u00e9"}');
  });
});
