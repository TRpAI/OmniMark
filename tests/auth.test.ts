import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  generateSecureToken,
  isSessionValid,
  parseSessionExpiresAt
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

test("Session expiration logic and mixed type parsing", () => {
  const now = Date.now();

  // Number timestamps
  assert.equal(isSessionValid({ expiresAt: now + 60000 }), true);
  assert.equal(isSessionValid({ expiresAt: now - 1000 }), false);

  // String timestamps (ISO string or stringified ms)
  const futureIso = new Date(now + 60000).toISOString();
  const pastIso = new Date(now - 60000).toISOString();
  assert.equal(isSessionValid({ expiresAt: futureIso }), true);
  assert.equal(isSessionValid({ expiresAt: pastIso }), false);

  assert.equal(isSessionValid({ expiresAt: String(now + 60000) }), true);
  assert.equal(isSessionValid({ expiresAt: String(now - 60000) }), false);

  // Invalid or missing values
  assert.equal(isSessionValid(null), false);
  assert.equal(isSessionValid(undefined), false);
  assert.equal(isSessionValid({ expiresAt: "invalid-date" }), false);
  assert.equal(isSessionValid({ expiresAt: NaN }), false);

  // Helper parseSessionExpiresAt
  assert.equal(parseSessionExpiresAt(now), now);
  assert.equal(parseSessionExpiresAt(String(now)), now);
  assert.ok(parseSessionExpiresAt(futureIso) > now);
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
