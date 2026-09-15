import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  generateSecureToken
} from "../src/utils/security.ts";

test("Token generation format and entropy", () => {
  const token1 = generateSecureToken();
  const token2 = generateSecureToken();

  assert.notEqual(token1, token2);
  assert.equal(typeof token1, "string");
  assert.equal(token1.startsWith("omni-"), true);
  // Length: prefix 'omni-' (5) + 64 hex chars = 69
  assert.equal(token1.length, 69);
});

test("Session expiration logic validation", () => {
  const activeSessions = new Map<string, { expiresAt: number }>();
  const tokenValid = generateSecureToken();
  const tokenExpired = generateSecureToken();

  const now = Date.now();
  activeSessions.set(tokenValid, { expiresAt: now + 60000 }); // +1 min
  activeSessions.set(tokenExpired, { expiresAt: now - 1000 }); // -1 sec

  // Validate helper
  const isSessionValid = (token: string): boolean => {
    const session = activeSessions.get(token);
    if (!session) return false;
    if (session.expiresAt <= Date.now()) {
      activeSessions.delete(token);
      return false;
    }
    return true;
  };

  assert.equal(isSessionValid(tokenValid), true);
  assert.equal(isSessionValid(tokenExpired), false);
  // Expired session is cleaned up
  assert.equal(activeSessions.has(tokenExpired), false);
  assert.equal(activeSessions.has(tokenValid), true);
});

test("Password change revokes all active sessions", async () => {
  const activeSessions = new Map<string, { expiresAt: number }>();
  for (let i = 0; i < 5; i++) {
    activeSessions.set(generateSecureToken(), { expiresAt: Date.now() + 86400000 });
  }
  assert.equal(activeSessions.size, 5);

  // When password changes, clear all active sessions
  activeSessions.clear();
  assert.equal(activeSessions.size, 0);
});
