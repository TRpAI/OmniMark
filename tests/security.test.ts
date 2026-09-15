import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  isSafeDomain,
  isSafeUrl,
  isSafePort,
  parseNetscapeBookmarks,
  PUBLIC_SETTINGS_KEYS,
  CLICK_ROUTE_REGEX,
  CATEGORY_ITEM_ROUTE_REGEX,
  BOOKMARK_ITEM_ROUTE_REGEX
} from "../src/utils/security.ts";

test("PBKDF2 password hashing & verification", async () => {
  const password = "SuperSecretPassword123!";
  const hash = await hashPasswordPBKDF2(password);

  assert.match(hash, /^pbkdf2:sha256:100000:[0-9a-f]{32}:[0-9a-f]{64}$/);

  // Correct password verify
  const resultCorrect = await verifyPasswordPBKDF2(password, hash);
  assert.equal(resultCorrect.valid, true);
  assert.equal(resultCorrect.needsUpgrade, false);

  // Wrong password verify
  const resultWrong = await verifyPasswordPBKDF2("WrongPassword", hash);
  assert.equal(resultWrong.valid, false);

  // Legacy SHA-256 fallback & upgrade trigger
  const enc = new TextEncoder();
  const legacyBuf = await crypto.subtle.digest("SHA-256", enc.encode("admin123"));
  const legacySha256 = Array.from(new Uint8Array(legacyBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

  const legacyVerify = await verifyPasswordPBKDF2("admin123", legacySha256);
  assert.equal(legacyVerify.valid, true);
  assert.equal(legacyVerify.needsUpgrade, true);
});

test("SSRF protection against dangerous domains and IP representations", () => {
  // Safe domains
  assert.equal(isSafeDomain("github.com"), true);
  assert.equal(isSafeDomain("aistudio.google.com"), true);
  assert.equal(isSafeDomain("cloudflare.com"), true);

  // Dangerous localhost and loopbacks
  assert.equal(isSafeDomain("localhost"), false);
  assert.equal(isSafeDomain("sub.localhost"), false);
  assert.equal(isSafeDomain("127.0.0.1"), false);
  assert.equal(isSafeDomain("0.0.0.0"), false);
  assert.equal(isSafeDomain("::1"), false);

  // Cloud metadata endpoints
  assert.equal(isSafeDomain("169.254.169.254"), false);
  assert.equal(isSafeDomain("metadata.google.internal"), false);
  assert.equal(isSafeDomain("instance-data"), false);

  // Private IPv4 ranges
  assert.equal(isSafeDomain("10.0.1.5"), false);
  assert.equal(isSafeDomain("192.168.1.1"), false);
  assert.equal(isSafeDomain("172.16.0.1"), false);
  assert.equal(isSafeDomain("172.31.255.255"), false);
  assert.equal(isSafeDomain("100.64.0.1"), false);

  // Numeric IPv4 representation (e.g. 127.0.0.1 = 2130706433)
  assert.equal(isSafeDomain("2130706433"), false);
  assert.equal(isSafeDomain("0x7f000001"), false);
  assert.equal(isSafeDomain("0177.0.0.1"), false);

  // IPv6 representations
  assert.equal(isSafeDomain("[::1]"), false);
  assert.equal(isSafeDomain("[fe80::1]"), false);
  assert.equal(isSafeDomain("[fc00::1]"), false);
  assert.equal(isSafeDomain("[fd00::1]"), false);
  assert.equal(isSafeDomain("::ffff:127.0.0.1"), false);

  // Safe URLs
  assert.equal(isSafeUrl("https://github.com/trending"), true);
  assert.equal(isSafeUrl("http://example.com"), true);

  // Unsafe URLs
  assert.equal(isSafeUrl("http://127.0.0.1:8080/admin"), false);
  assert.equal(isSafeUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isSafeUrl("http://localhost:3000"), false);
  assert.equal(isSafeUrl("javascript:alert(1)"), false);
  assert.equal(isSafeUrl("data:text/html,test"), false);
  assert.equal(isSafeUrl("http://2130706433/"), false);
  assert.equal(isSafeUrl("http://user:pass@example.com/"), false);
});

test("Netscape bookmark format parser with multiline attributes", () => {
  const sampleHtml = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000">开发工具</H3>
    <DL><p>
        <DT><A HREF="https://github.com"
               ADD_DATE="1700000001"
               ICON="https://github.githubassets.com/favicons/favicon.svg">GitHub</A>
        <DD>全球最大的代码托管协作平台
        <DT><A HREF="https://vitejs.dev" ADD_DATE="1700000002">Vite 官方文档</A>
    </DL><p>
    <DT><H3>AI 工具</H3>
    <DL><p>
        <DT><A HREF="https://aistudio.google.com" ADD_DATE="1700000003">Google AI Studio</A>
    </DL><p>
</DL><p>
  `;

  const parsed = parseNetscapeBookmarks(sampleHtml);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].title, "GitHub");
  assert.equal(parsed[0].url, "https://github.com");
  assert.equal(parsed[0].categoryName, "开发工具");
  assert.equal(parsed[0].description, "全球最大的代码托管协作平台");
  assert.equal(parsed[1].title, "Vite 官方文档");
  assert.equal(parsed[1].categoryName, "开发工具");
  assert.equal(parsed[2].title, "Google AI Studio");
  assert.equal(parsed[2].categoryName, "AI 工具");
});

test("Public settings whitelist strictly hides sensitive API tokens and credentials", () => {
  const fullSettings = {
    siteName: "Safe Custom Name",
    siteSubtitle: "Navigation Hub",
    announcement: "Hello world",
    defaultViewMode: "grid",
    allowPublicSubmit: true,
    enableWeather: true,
    enableSearchEngine: true,
    defaultSearchEngine: "google",
    adminPasswordHash: "pbkdf2:sha256:100000:evil:hash",
    geminiApiKey: "AIzaSySecretGeminiKey123456",
    cfApiToken: "CloudflareWorkerApiTokenSecret",
    extraInternalField: "should-not-leak"
  };

  const publicSettings: Record<string, any> = {};
  for (const key of PUBLIC_SETTINGS_KEYS) {
    if ((fullSettings as any)[key] !== undefined) {
      publicSettings[key] = (fullSettings as any)[key];
    }
  }

  assert.equal(publicSettings.siteName, "Safe Custom Name");
  assert.equal(publicSettings.adminPasswordHash, undefined);
  assert.equal(publicSettings.geminiApiKey, undefined);
  assert.equal(publicSettings.cfApiToken, undefined);
  assert.equal(publicSettings.extraInternalField, undefined);
  assert.deepEqual(Object.keys(publicSettings).sort(), [...PUBLIC_SETTINGS_KEYS].sort());
});

test("Canonical route regexes prevent path traversal and false positives", () => {
  // 1. CLICK_ROUTE_REGEX
  assert.match("/api/bookmarks/bm-123/click", CLICK_ROUTE_REGEX);
  assert.equal("/api/bookmarks/bm-123/click".match(CLICK_ROUTE_REGEX)?.[1], "bm-123");

  assert.equal(CLICK_ROUTE_REGEX.test("/api/bookmarks/bm-123/click-tracker"), false);
  assert.equal(CLICK_ROUTE_REGEX.test("/api/bookmarks/click/details"), false);
  assert.equal(CLICK_ROUTE_REGEX.test("/api/bookmarks/click"), false);
  assert.equal(CLICK_ROUTE_REGEX.test("/api/bookmarks/bm-1/click/sub"), false);

  // 2. CATEGORY_ITEM_ROUTE_REGEX
  assert.match("/api/categories/cat-1", CATEGORY_ITEM_ROUTE_REGEX);
  assert.equal("/api/categories/cat-1".match(CATEGORY_ITEM_ROUTE_REGEX)?.[1], "cat-1");
  assert.equal(CATEGORY_ITEM_ROUTE_REGEX.test("/api/categories/reorder"), false);
  assert.equal(CATEGORY_ITEM_ROUTE_REGEX.test("/api/categories/cat-1/sub"), false);

  // 3. BOOKMARK_ITEM_ROUTE_REGEX
  assert.match("/api/bookmarks/bm-1", BOOKMARK_ITEM_ROUTE_REGEX);
  assert.equal("/api/bookmarks/bm-1".match(BOOKMARK_ITEM_ROUTE_REGEX)?.[1], "bm-1");
  assert.equal(BOOKMARK_ITEM_ROUTE_REGEX.test("/api/bookmarks/reorder"), false);
  assert.equal(BOOKMARK_ITEM_ROUTE_REGEX.test("/api/bookmarks/bm-1/click"), false);
  assert.equal(BOOKMARK_ITEM_ROUTE_REGEX.test("/api/bookmarks/bm-1/sub"), false);
});

test("Port safety validation against internal service ports", () => {
  // Standard web ports
  assert.equal(isSafePort(80), true);
  assert.equal(isSafePort(443), true);
  assert.equal(isSafePort(8080), true);

  // Blocked dangerous ports
  assert.equal(isSafePort(22), false); // SSH
  assert.equal(isSafePort(25), false); // SMTP
  assert.equal(isSafePort(6379), false); // Redis
  assert.equal(isSafePort(27017), false); // MongoDB
  assert.equal(isSafePort(3306), false); // MySQL
  assert.equal(isSafePort(5432), false); // Postgres
});
