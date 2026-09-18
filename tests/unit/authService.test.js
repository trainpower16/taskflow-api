'use strict';

const authService = require('../../src/services/authService');
const userRepository = require('../../src/repositories/userRepository');
const { setupDb, resetDb, teardownDb } = require('../helpers/testDb');

describe('authService', () => {
  beforeAll(setupDb);
  beforeEach(resetDb);
  afterAll(teardownDb);

  const credentials = { email: 'Alice@Example.com', name: 'Alice', password: 'password123' };

  describe('register', () => {
    it('creates a user, normalises the email and never returns the password hash', async () => {
      const user = await authService.register(credentials);

      expect(user).toMatchObject({ email: 'alice@example.com', name: 'Alice', role: 'member' });
      expect(user.password_hash).toBeUndefined();
      expect(userRepository.count()).toBe(1);
    });

    it('stores the password as a hash rather than in plain text', async () => {
      await authService.register(credentials);
      const stored = userRepository.findByEmail(credentials.email);

      expect(stored.password_hash).not.toBe(credentials.password);
      expect(stored.password_hash).toMatch(/^\$2[aby]\$/);
    });

    it('rejects a duplicate email with a 409', async () => {
      await authService.register(credentials);

      await expect(authService.register(credentials)).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
      });
    });

    it('honours an explicit admin role', async () => {
      const admin = await authService.register({ ...credentials, role: 'admin' });
      expect(admin.role).toBe('admin');
    });
  });

  describe('login', () => {
    it('returns a signed token and the public user fields', async () => {
      await authService.register(credentials);
      const result = await authService.login({ email: credentials.email, password: 'password123' });

      expect(typeof result.token).toBe('string');
      expect(result.token.split('.')).toHaveLength(3);
      expect(result.user).toMatchObject({ email: 'alice@example.com', role: 'member' });
      expect(result.user.password_hash).toBeUndefined();
    });

    it('rejects a wrong password', async () => {
      await authService.register(credentials);

      await expect(
        authService.login({ email: credentials.email, password: 'wrong-password' })
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('returns the same generic error for an unknown email, preventing account enumeration', async () => {
      await authService.register(credentials);

      const unknown = await authService
        .login({ email: 'nobody@example.com', password: 'password123' })
        .catch((err) => err);
      const wrongPassword = await authService
        .login({ email: credentials.email, password: 'wrong-password' })
        .catch((err) => err);

      expect(unknown.message).toBe(wrongPassword.message);
      expect(unknown.statusCode).toBe(401);
    });
  });

  describe('verifyToken', () => {
    it('round-trips a token it issued', async () => {
      const user = await authService.register(credentials);
      const payload = authService.verifyToken(authService.issueToken({ ...user }));

      expect(payload.sub).toBe(user.id);
      expect(payload.role).toBe('member');
    });

    it('rejects a tampered token', () => {
      expect(() => authService.verifyToken('not.a.token')).toThrow(/Invalid or expired token/);
    });
  });
});
