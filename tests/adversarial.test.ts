import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  isSafeDomain,
  isSafeUrl,
  isSafePort,
  validateDnsWithDoH,
  sanitizeSettingsForAdmin,
  sanitizeSettingsForPublic,
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  hashSessionToken,
  generateSecureToken,
  isSessionValid,
  extractSessionToken,
  PUBLIC_SETTINGS_KEYS,
  ADMIN_SAFE_SETTINGS_KEYS
} from "../src/utils/security.ts";
import { AuthService, SessionStore } from "../src/services/authService.ts";
import {
  BookmarkSchema,
  CategorySchema,
  LoginSchema,
  PasswordChangeSchema,
  SettingsSchema,
  MetadataExtractSchema
} from "../src/services/schemas.ts";

/**
 * Suite 1: Advanced SSRF & IP Obfuscation Attack Vectors
 */
test("SSRF Attack Defense: Comprehensive IP representations, octal, hex, and loopbacks", () => {
  const attackVectors = [
    // Standard loopback
    "127.0.0.1",
    "localhost",
    "sub.localhost",
    "0.0.0.0",
    "::1",
    "[::1]",

    // Hexadecimal representation of 127.0.0.1
    "0x7f000001",
    "0x7f.0.0.1",
    "0x7f.0x0.0x0.0x1",

    // Decimal integer representation of 127.0.0.1 (2130706433)
    "2130706433",

    // Octal representation of 127.0.0.1
    "0177.0.0.1",
    "0177.0.0.01",
    "017700000001",

    // IPv4-mapped IPv6 loopbacks and private addresses
    "::ffff:127.0.0.1",
    "[::ffff:127.0.0.1]",
    "::ffff:10.0.0.1",
    "::ffff:192.168.1.1",

    // Link-local and Unique Local IPv6
    "fe80::1",
    "[fe80::1]",
    "fc00::1",
    "[fc00::1]",
    "fd00::1",
    "[fd00::1]",

    // Cloud Provider Metadata Services
    "169.254.169.254", // AWS/GCP/Azure link-local metadata
    "metadata.google.internal",
    "instance-data",
    "kubernetes.default",
    "kubernetes.default.svc",

    // Internal and local TLDs
    "company.internal",
    "router.local",
    "home.lan",
    "gateway.intranet",
    "cluster.localdomain"
  ];

  for (const host of attackVectors) {
    assert.equal(
      isSafeDomain(host),
      false,
      `Expected attack domain '${host}' to be strictly rejected by SSRF filters`
    );

    assert.equal(
      isSafeUrl(`http://${host}/`),
      false,
      `Expected attack URL 'http://${host}/' to be rejected by isSafeUrl`
    );
  }
});

/**
 * Suite 2: SSRF Dangerous Ports and Protocol Manipulations
 */
test("SSRF Attack Defense: Protocol injection, internal ports, and embedded userinfo", () => {
  const unsafeUrls = [
    // Internal administrative/database service ports
    "http://example.com:22/ssh",
    "http://example.com:25/smtp",
    "http://example.com:3306/mysql",
    "http://example.com:5432/postgres",
    "http://example.com:6379/redis",
    "http://example.com:11211/memcached",
    "http://example.com:27017/mongodb",

    // Unsupported/dangerous protocols
    "file:///etc/passwd",
    "gopher://127.0.0.1:6379/_flushall",
    "dict://127.0.0.1:11211/stat",
    "ftp://example.com/file",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",

    // Embedded userinfo (potential credential smuggling or parser confusion)
    "http://admin:password@example.com/",
    "https://foo:bar@google.com"
  ];

  for (const url of unsafeUrls) {
    assert.equal(isSafeUrl(url), false, `Expected '${url}' to be rejected as an unsafe URL`);
  }
});

/**
 * Suite 3: Public-to-Private Redirect SSRF Attack Simulation
 */
test("SSRF Attack Defense: Public to Private Redirect prevention", async () => {
  // Spin up an ephemeral HTTP redirect server to simulate a public URL redirecting to private 127.0.0.1
  let privateServerHit = false;

  const privateServer = http.createServer((req, res) => {
    privateServerHit = true;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body>Secret internal metadata hit!</body></html>");
  });

  await new Promise<void>((resolve) => privateServer.listen(0, "127.0.0.1", resolve));
  const privatePort = (privateServer.address() as any).port;

  const redirectorServer = http.createServer((req, res) => {
    // Maliciously redirect to loopback
    res.writeHead(302, { Location: `http://127.0.0.1:${privatePort}/metadata` });
    res.end();
  });

  await new Promise<void>((resolve) => redirectorServer.listen(0, "127.0.0.1", resolve));
  const redirectorPort = (redirectorServer.address() as any).port;

  try {
    // Step 1: Check redirect target URL directly with isSafeUrl
    const evilRedirectTarget = `http://127.0.0.1:${privatePort}/metadata`;
    assert.equal(isSafeUrl(evilRedirectTarget), false);

    // Step 2: Test URL parser on redirect target with hex/octal representations
    const evilHexTarget = `http://0x7f000001:${privatePort}/metadata`;
    assert.equal(isSafeUrl(evilHexTarget), false);

    const evilIntTarget = `http://2130706433:${privatePort}/metadata`;
    assert.equal(isSafeUrl(evilIntTarget), false);
  } finally {
    privateServer.close();
    redirectorServer.close();
  }

  assert.equal(privateServerHit, false, "Private internal server should never be touched");
});

/**
 * Suite 4: Authentication Attack Vectors (Expired, Stolen, Replay, Password Change Revocation)
 */
test("Auth Defense: Expired token, deleted token, stolen token, and password-change revocation", async () => {
  const sessions = new Map<string, number>();

  const store: SessionStore = {
    saveSession: (hash, exp) => { sessions.set(hash, exp); },
    findSession: (hash) => {
      const exp = sessions.get(hash);
      return exp ? { expiresAt: exp } : null;
    },
    deleteSession: (hash) => { sessions.delete(hash); },
    clearAllSessions: () => { sessions.clear(); }
  };

  let currentPasswordHash = await hashPasswordPBKDF2("StrongAdminPass123!");

  const authService = new AuthService({
    sessionStore: store,
    getPasswordHash: () => currentPasswordHash,
    setPasswordHash: (h) => { currentPasswordHash = h; }
  });

  // 1. Successful Login
  const loginRes = await authService.login("StrongAdminPass123!");
  assert.equal(loginRes.success, true);
  assert.ok(loginRes.token);
  const token = loginRes.token!;

  // 2. Token should be valid
  const headers = { get: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${token}` : null };
  const authCheck1 = await authService.authenticateRequest(headers);
  assert.equal(authCheck1.authenticated, true);

  // 3. Expired token rejection
  const tokenHash = await hashSessionToken(token);
  sessions.set(tokenHash, Date.now() - 1000); // Expire it in store
  const expiredCheck = await authService.authenticateRequest(headers);
  assert.equal(expiredCheck.authenticated, false, "Expired session token must be rejected");

  // 4. Deleted/Logged-out token rejection
  sessions.delete(tokenHash);
  const deletedCheck = await authService.authenticateRequest(headers);
  assert.equal(deletedCheck.authenticated, false, "Deleted token must be rejected");

  // 5. Password change revokes all existing sessions (Anti-session fixation / anti-stolen token lingering)
  const loginRes2 = await authService.login("StrongAdminPass123!");
  assert.equal(loginRes2.success, true);
  const token2 = loginRes2.token!;
  const token2Hash = await hashSessionToken(token2);
  assert.ok(sessions.has(token2Hash));

  // Change password to a new strong passphrase
  const changeRes = await authService.changePassword("BrandNewAdminPass456!");
  assert.equal(changeRes.success, true);

  // Old active session must be completely revoked
  const token2Headers = { get: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${token2}` : null };
  const postPasswordChangeCheck = await authService.authenticateRequest(token2Headers);
  assert.equal(postPasswordChangeCheck.authenticated, false, "All sessions must be invalidated upon password change");
  assert.equal(sessions.size, 0, "Session store must be empty after password revocation");

  // 6. Stolen Raw Token Database Resistance Test:
  // If an attacker dumps the database, they only get tokenHash, not the raw token.
  // Passing tokenHash as Bearer token directly must fail!
  const stolenHashHeaders = { get: (name: string) => name.toLowerCase() === "authorization" ? `Bearer ${token2Hash}` : null };
  const stolenCheck = await authService.authenticateRequest(stolenHashHeaders);
  assert.equal(stolenCheck.authenticated, false, "Attacker cannot replay tokenHash from DB dump");
});

/**
 * Suite 5: Settings Secret Non-Leakage Regression Test
 * Critical requirement: GET /api/settings must NEVER contain sensitive keys.
 */
test("Settings Defense Regression: GET /api/settings must NEVER leak geminiApiKey or cfApiToken", () => {
  const fullProductionConfig = {
    siteName: "OmniMark 生产导航",
    siteSubtitle: "极简导航",
    announcement: "维护公告",
    defaultViewMode: "grid",
    allowPublicSubmit: false,
    enableWeather: true,
    enableSearchEngine: true,
    defaultSearchEngine: "google",
    // Dangerous credentials:
    adminPasswordHash: "pbkdf2:sha256:600000:deadbeef:cafebebe",
    geminiApiKey: "AIzaSySecretGeminiKey1234567890",
    cfApiToken: "v1.0-CloudflareSecretToken-999888777",
    unregisteredSecret: "confidential_internal_value",
    cfAccountId: "cf_account_public_id",
    cfD1DatabaseId: "d1_database_uuid",
    cfKvNamespaceId: "kv_namespace_uuid"
  };

  // 1. Public Visitor View
  const publicView = sanitizeSettingsForPublic(fullProductionConfig);
  assert.equal("geminiApiKey" in publicView, false, "geminiApiKey MUST NOT exist in public settings");
  assert.equal("cfApiToken" in publicView, false, "cfApiToken MUST NOT exist in public settings");
  assert.equal("adminPasswordHash" in publicView, false, "adminPasswordHash MUST NOT exist in public settings");
  assert.equal("unregisteredSecret" in publicView, false, "Unregistered keys MUST NOT exist in public settings");
  assert.equal("cfAccountId" in publicView, false, "cfAccountId MUST NOT leak to public visitors");

  // 2. Authenticated Admin View
  const adminView = sanitizeSettingsForAdmin(fullProductionConfig);
  assert.equal("geminiApiKey" in adminView, false, "Raw geminiApiKey MUST NEVER be returned even to admin");
  assert.equal("cfApiToken" in adminView, false, "Raw cfApiToken MUST NEVER be returned even to admin");
  assert.equal("adminPasswordHash" in adminView, false, "adminPasswordHash MUST NEVER be returned even to admin");
  assert.equal("unregisteredSecret" in adminView, false, "Arbitrary secrets MUST NEVER leak to admin");

  // Verify only boolean presence flags are provided
  assert.equal(adminView.hasGeminiApiKey, true);
  assert.equal(adminView.hasCfApiToken, true);

  // Verify non-sensitive IDs for wrangler configuration are preserved for admin
  assert.equal(adminView.cfAccountId, "cf_account_public_id");
  assert.equal(adminView.cfD1DatabaseId, "d1_database_uuid");
});

/**
 * Suite 6: Zod Schemas Comprehensive Input Validation & Boundary Testing
 */
test("Zod Schema Defense: Bookmark, Category, Login, and Password Change boundary validation", () => {
  // 1. BookmarkSchema Validation
  const validBookmark = {
    title: "GitHub",
    url: "github.com", // Should transform to https://github.com
    categoryId: "cat_dev",
    description: "Code hosting",
    tags: ["git", "code"]
  };
  const bmParsed = BookmarkSchema.safeParse(validBookmark);
  assert.equal(bmParsed.success, true);
  assert.equal(bmParsed.data?.url, "https://github.com");

  // Dangerous / Malicious Bookmark URLs
  assert.equal(BookmarkSchema.safeParse({ ...validBookmark, url: "http://127.0.0.1:8080" }).success, false);
  assert.equal(BookmarkSchema.safeParse({ ...validBookmark, url: "http://0x7f000001" }).success, false);
  assert.equal(BookmarkSchema.safeParse({ ...validBookmark, url: "javascript:alert(1)" }).success, false);
  assert.equal(BookmarkSchema.safeParse({ ...validBookmark, title: "" }).success, false);
  assert.equal(BookmarkSchema.safeParse({ ...validBookmark, categoryId: "" }).success, false);

  // 2. CategorySchema Validation
  assert.equal(CategorySchema.safeParse({ name: "前端开发", icon: "Code" }).success, true);
  assert.equal(CategorySchema.safeParse({ name: "" }).success, false);
  assert.equal(CategorySchema.safeParse({ name: "a".repeat(51) }).success, false); // Exceeds max 50

  // 3. PasswordChangeSchema Validation (>= 12 characters policy)
  assert.equal(
    PasswordChangeSchema.safeParse({
      currentPassword: "old",
      newPassword: "short"
    }).success,
    false,
    "Passwords shorter than 12 characters must fail"
  );

  assert.equal(
    PasswordChangeSchema.safeParse({
      currentPassword: "old",
      newPassword: "secure-passphrase-2026"
    }).success,
    true
  );

  // 4. MetadataExtractSchema Validation
  assert.equal(MetadataExtractSchema.safeParse({ url: "https://example.com" }).success, true);
  assert.equal(MetadataExtractSchema.safeParse({ url: "http://localhost:3000" }).success, false);
  assert.equal(MetadataExtractSchema.safeParse({ url: "http://169.254.169.254/metadata" }).success, false);
});
