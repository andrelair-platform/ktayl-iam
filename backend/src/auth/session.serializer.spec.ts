import { describe, it, expect } from 'vitest';
import { SessionSerializer } from './session.serializer.js';
import { ADMIN_USER } from '../../test/fixtures/users.js';

describe('SessionSerializer', () => {
  const serializer = new SessionSerializer();

  it('serializes the whole user object into the session (no external store in v1)', () => {
    serializer.serializeUser(ADMIN_USER, (err, payload) => {
      expect(err).toBeNull();
      expect(payload).toEqual(ADMIN_USER);
    });
  });

  it('deserializes the session payload back to the user object', () => {
    serializer.deserializeUser(ADMIN_USER, (err, user) => {
      expect(err).toBeNull();
      expect(user).toEqual(ADMIN_USER);
    });
  });
});
