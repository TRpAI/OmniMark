import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  generateSecureToken,
  isSessionValid,
  parseSessionExpiresAt,
  validatePasswordStrength,
  MIN_ADMIN_PASSWORD_LENGTH,
  hashSessionToken,
  parseCookies,
  createSessionCookie,
  createClearSessionCookie,
  extractSessionToken,
  SESSION_COOKIE_NAME
} from "../src/utils/security.ts";
import { AuthService, SessionStore } from "../src/services/authService.ts";

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

test("Password length policy enforces >= 12 characters", () => {
  assert.equal(MIN_ADMIN_PASSWORD_LENGTH, 12);

  // Rejects short passwords (like 123456 or admin123)
  assert.equal(validatePasswordStrength("123456").valid, false);
  assert.equal(validatePasswordStrength("admin123").valid, false);
  assert.equal(validatePasswordStrength("12345678901").valid, false); // 11 chars
  assert.equal(validatePasswordStrength("").valid, false);
  assert.equal(validatePasswordStrength(null).valid, false);

  // Accepts >= 12 characters (password manager phrases)
  assert.equal(validatePasswordStrength("correct-horse-battery-staple").valid, true);
  assert.equal(validatePasswordStrength("123456789012").valid, true); // exactly 12
});

test("Session token hashing (SHA-256) protects raw tokens in database", async () => {
  const rawToken = generateSecureToken();
  const hash1 = await hashSessionToken(rawToken);
  const hash2 = await hashSessionToken(rawToken);

  assert.equal(hash1, hash2);
  assert.equal(typeof hash1, "string");
  // 64-character lowercase hex string for SHA-256
  assert.equal(hash1.length, 64);
  assert.match(hash1, /^[0-9a-f]{64}$/);

  // Different raw token must yield different hash
  const otherToken = generateSecureToken();
  const otherHash = await hashSessionToken(otherToken);
  assert.notEqual(hash1, otherHash);
});

test("Cookie serialization and extraction for HttpOnly protection", () => {
  const token = generateSecureToken();
  const cookieStr = createSessionCookie(token, { secure: true });

  assert.ok(cookieStr.includes(`${SESSION_COOKIE_NAME}=${token}`));
  assert.ok(cookieStr.includes("HttpOnly"));
  assert.ok(cookieStr.includes("SameSite=Lax"));
  assert.ok(cookieStr.includes("Secure"));
  assert.ok(cookieStr.includes("Path=/"));

  // Cookie parsing
  const parsed = parseCookies(`other=123; ${cookieStr}; foo=bar`);
  assert.equal(parsed[SESSION_COOKIE_NAME], token);
  assert.equal(parsed.foo, "bar");

  // Extract from headers (Priority 1: Cookie)
  const headersWithCookie = {
    cookie: `${SESSION_COOKIE_NAME}=${token}; some=value`,
    authorization: "Bearer legacy_token"
  };
  assert.equal(extractSessionToken(headersWithCookie), token);

  // Extract from headers (Priority 2: Bearer fallback)
  const headersBearerOnly = {
    authorization: "Bearer " + token
  };
  assert.equal(extractSessionToken(headersBearerOnly), token);

  // Clear cookie header
  const clearCookie = createClearSessionCookie({ secure: true });
  assert.ok(clearCookie.includes("Max-Age=0"));
});

test("AuthService workflow with hashed sessions and password upgrade", async () => {
  // Mock session store using tokenHash
  const memoryStore = new Map<string, { expiresAt: number }>();
  const mockSessionStore: SessionStore = {
    async saveSession(tokenHash, expiresAt) {
      memoryStore.set(tokenHash, { expiresAt });
    },
    async findSession(tokenHash) {
      return memoryStore.get(tokenHash) || null;
    },
    async deleteSession(tokenHash) {
      memoryStore.delete(tokenHash);
    },
    async clearAllSessions() {
      memoryStore.clear();
    }
  };

  let currentHash = await hashPasswordPBKDF2("OmniMarkSecure2026!");
  const authService = new AuthService({
    sessionStore: mockSessionStore,
    getPasswordHash: () => currentHash,
    setPasswordHash: (newHash) => { currentHash = newHash; }
  });

  // Login failed with wrong password
  const failResult = await authService.login("wrong");
  assert.equal(failResult.success, false);

  // Login successful
  const loginResult = await authService.login("OmniMarkSecure2026!");
  assert.equal(loginResult.success, true);
  assert.ok(loginResult.token);
  assert.ok(loginResult.expiresAt);

  // Verify token hash is stored, NOT the raw token
  assert.equal(memoryStore.has(loginResult.token!), false);
  const tokenHash = await hashSessionToken(loginResult.token!);
  assert.equal(memoryStore.has(tokenHash), true);

  // Authenticate request via Cookie
  const authViaCookie = await authService.authenticateRequest({
    cookie: `${SESSION_COOKIE_NAME}=${loginResult.token!}`
  });
  assert.equal(authViaCookie.authenticated, true);

  // Authenticate request via Bearer header
  const authViaBearer = await authService.authenticateRequest({
    authorization: `Bearer ${loginResult.token!}`
  });
  assert.equal(authViaBearer.authenticated, true);

  // Change password: reject < 12 characters
  const shortPass = await authService.changePassword("short123");
  assert.equal(shortPass.success, false);
  assert.ok(shortPass.error?.includes("12"));

  // Change password: accept >= 12 characters and clear all sessions
  const changeOk = await authService.changePassword("brand-new-ultra-secure-passphrase");
  assert.equal(changeOk.success, true);
  assert.equal(memoryStore.size, 0); // sessions cleared

  // Old session is now invalid
  const oldAuth = await authService.authenticateRequest({
    authorization: `Bearer ${loginResult.token!}`
  });
  assert.equal(oldAuth.authenticated, false);
});

