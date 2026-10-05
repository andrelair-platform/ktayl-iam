import { describe, expect, it } from 'vitest';
import { buildEmail, deriveLocalPart } from './email.js';

describe('deriveLocalPart', () => {
  it('firstname.lastname, lowercased', () => {
    expect(deriveLocalPart('Sophie Bernard')).toBe('sophie.bernard');
  });
  it('folds accents', () => {
    expect(deriveLocalPart('Benoît Lefèvre')).toBe('benoit.lefevre');
  });
  it('drops middle names (first + last only)', () => {
    expect(deriveLocalPart('Jean Paul Marie Dupont')).toBe('jean.dupont');
  });
  it('drops apostrophes + hyphens collapse', () => {
    expect(deriveLocalPart("O'Brien")).toBe('obrien');
    expect(deriveLocalPart('Anne-Marie Claire')).toBe('anne.claire'); // hyphen → space → 2 tokens
  });
  it('single token → itself', () => {
    expect(deriveLocalPart('Cher')).toBe('cher');
  });
  it('empty → empty', () => {
    expect(deriveLocalPart('')).toBe('');
    expect(deriveLocalPart('   ')).toBe('');
  });
});

describe('buildEmail', () => {
  it('no collision suffix', () => {
    expect(buildEmail('sophie.bernard', 'devandre.sbs')).toBe('sophie.bernard@devandre.sbs');
  });
  it('collision suffix appends a number', () => {
    expect(buildEmail('sophie.bernard', 'devandre.sbs', 1)).toBe('sophie.bernard2@devandre.sbs');
    expect(buildEmail('sophie.bernard', 'devandre.sbs', 2)).toBe('sophie.bernard3@devandre.sbs');
  });
});
