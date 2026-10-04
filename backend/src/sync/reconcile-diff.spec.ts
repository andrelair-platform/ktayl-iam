import { describe, it, expect } from 'vitest';
import { computeDrift } from './reconcile-diff.js';

const set = (...xs: string[]) => new Set(xs);

describe('computeDrift (S005 reconcile, AC-4)', () => {
  it('no drift when desired == actual', () => {
    const d = new Map([['g', set('900001', '900002')]]);
    const a = new Map([['g', set('900001', '900002')]]);
    expect(computeDrift(d, a)).toEqual([]);
  });

  it('emits ADD for a desired member missing in Authentik (hand-removed / failed sync)', () => {
    const d = new Map([['g', set('900001', '900002')]]);
    const a = new Map([['g', set('900001')]]);
    const drift = computeDrift(d, a);
    expect(drift).toEqual([{ group: 'g', user: '900002', op: 'add', reason: expect.any(String) }]);
  });

  it('emits REMOVE for an actual member with no active assignment (hand-added)', () => {
    const d = new Map([['g', set('900001')]]);
    const a = new Map([['g', set('900001', '900099')]]);
    const drift = computeDrift(d, a);
    expect(drift).toEqual([{ group: 'g', user: '900099', op: 'remove', reason: expect.any(String) }]);
  });

  it('handles a governed group that exists only in Authentik (all members extraneous)', () => {
    const d = new Map<string, Set<string>>();
    const a = new Map([['g', set('900099')]]);
    expect(computeDrift(d, a)).toEqual([{ group: 'g', user: '900099', op: 'remove', reason: expect.any(String) }]);
  });
});
