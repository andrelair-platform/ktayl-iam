import { describe, it, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { collectGroups, decodeJwtPayload, authorizeFromVerifyArgs } from './oidc.strategy.js';
import { ADMIN_GROUP as ADMIN, UI_PROFILE as uiProfile } from '../../test/fixtures/users.js';

/** Build an unsigned JWT (header.payload.sig) — enough for payload decoding under test. */
function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.sig`;
}

describe('decodeJwtPayload', () => {
  it('decodes the payload of a well-formed JWT', () => {
    expect(decodeJwtPayload(jwt({ sub: 'x', groups: ['A', 'B'] }))).toMatchObject({
      sub: 'x',
      groups: ['A', 'B'],
    });
  });

  it('returns undefined for a non-JWT string', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeUndefined();
    expect(decodeJwtPayload('a.b')).toBeUndefined();
  });
});

describe('collectGroups', () => {
  it('the arity-3 shape (iss, uiProfile, done) yields NO groups — reproduces the 401 bug', () => {
    const args = ['https://auth.devandre.sbs/', uiProfile, () => {}];
    expect(collectGroups(args)).toEqual([]);
  });

  it('extracts groups from the raw id_token JWT at the real arity-5 shape', () => {
    const idToken = jwt({ sub: 'hashed-sub', groups: [ADMIN, 'Développeurs', 'QA'] });
    // passport-openidconnect callbackArity 5 → (iss, profile, context, idToken, done)
    const args = ['https://auth.devandre.sbs/', uiProfile, {}, idToken, () => {}];
    expect(collectGroups(args)).toContain(ADMIN);
  });

  it('yields NO groups if only the 3-arg shape arrives (e.g. a wrong callbackArity like 6)', () => {
    // A callbackArity with no matching passport-openidconnect branch (6) falls through to
    // (iss, profile, done) — no idToken → groups=[]. Guards against re-introducing that bug.
    const args = ['iss', uiProfile, {}, () => {}]; // context present but no idToken
    expect(collectGroups(args)).toEqual([]);
  });

  it('extracts groups from an idProfile._json.groups object', () => {
    const idProfile = { id: 'hashed-sub', _json: { sub: 'hashed-sub', groups: [ADMIN] } };
    expect(collectGroups(['iss', uiProfile, idProfile, () => {}])).toContain(ADMIN);
  });

  it('extracts groups from a top-level .groups array on any arg', () => {
    expect(collectGroups(['iss', { groups: [ADMIN] }])).toEqual([ADMIN]);
  });

  it('de-duplicates groups found across multiple args', () => {
    const idToken = jwt({ groups: [ADMIN, 'QA'] });
    const args = ['iss', { groups: [ADMIN] }, {}, {}, idToken, () => {}];
    expect(collectGroups(args).filter((g) => g === ADMIN)).toHaveLength(1);
  });
});

describe('authorizeFromVerifyArgs (S008 multi-user login + isAdmin)', () => {
  it('admits a Platform Admins member with isAdmin=true, shaped from the profile', () => {
    const idToken = jwt({ sub: 'hashed-sub', groups: [ADMIN, 'Direction IT / SI'] });
    const args = ['iss', uiProfile, {}, idToken, () => {}];
    const user = authorizeFromVerifyArgs(args, ADMIN);
    expect(user).toMatchObject({
      id: uiProfile.id,
      username: uiProfile.username,
      email: uiProfile.emails[0].value,
      isAdmin: true,
    });
    expect(user.groups).toContain(ADMIN);
  });

  it('ADMITS a non-admin user with isAdmin=false (S008 — no longer 401 at login)', () => {
    const idToken = jwt({ sub: 'x', groups: ['Développeurs', 'QA'] });
    const args = ['iss', uiProfile, {}, idToken, () => {}];
    const user = authorizeFromVerifyArgs(args, ADMIN);
    expect(user.isAdmin).toBe(false);
    expect(user.username).toBe(uiProfile.username);
  });

  it('admits a user with no groups at all as isAdmin=false (arity-3, no staff gate)', () => {
    const args = ['iss', uiProfile, () => {}];
    const user = authorizeFromVerifyArgs(args, ADMIN);
    expect(user.isAdmin).toBe(false);
    expect(user.groups).toEqual([]);
  });

  it('when a staffGroup is configured, REJECTS (401) a user in neither staff nor admin', () => {
    const idToken = jwt({ sub: 'x', groups: ['QA'] });
    const args = ['iss', uiProfile, {}, idToken, () => {}];
    expect(() => authorizeFromVerifyArgs(args, ADMIN, 'ktayl-staff')).toThrow(UnauthorizedException);
  });

  it('when a staffGroup is configured, ADMITS a staff member (isAdmin=false)', () => {
    const idToken = jwt({ sub: 'x', groups: ['ktayl-staff'] });
    const args = ['iss', uiProfile, {}, idToken, () => {}];
    const user = authorizeFromVerifyArgs(args, ADMIN, 'ktayl-staff');
    expect(user.isAdmin).toBe(false);
  });
});
