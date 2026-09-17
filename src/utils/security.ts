/**
 * OmniMark Enterprise-Grade Security Utilities
 * - PBKDF2 Password Hashing & Constant-Time Verification (OWASP Compliant)
 * - Comprehensive SSRF Protection (IPv4/IPv6, Numeric/Hex/Octal, DNS Rebinding Defense)
 * - Safe HTML Bookmark Parsing (Netscape Bookmark Format with Multiline Support)
 * - Sanitization & Token Generation
 */

// =========================================================================
// 1. PBKDF2 Cryptographic Password Hashing & Verification (OWASP 2023+ Recommended)
// =========================================================================

export const PBKDF2_ITERATIONS = 600000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;

/**
 * Derives a secure PBKDF2 password hash using Web Crypto API (supported across Node.js & Cloudflare Workers).
 * Output format: pbkdf2:sha256:<iterations>:<saltHex>:<hashHex>
 */
export async function hashPasswordPBKDF2(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    PBKDF2_KEY_BYTES * 8
  );

  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:sha256:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

/**
 * Verifies a password against a stored hash using constant-time comparison.
 * Supports seamless migration from legacy SHA-256, plaintext hashes, or older iteration counts (<600,000).
 */
export async function verifyPasswordPBKDF2(
  password: string,
  storedHash: string
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!password || !storedHash || typeof storedHash !== "string") {
    return { valid: false, needsUpgrade: false };
  }

  const parts = storedHash.split(":");
  if (parts.length === 5 && parts[0] === "pbkdf2" && parts[1] === "sha256") {
    const iterations = parseInt(parts[2], 10);
    const saltHex = parts[3];
    const expectedHashHex = parts[4];

    if (isNaN(iterations) || !saltHex || !expectedHashHex) {
      return { valid: false, needsUpgrade: false };
    }

    const saltMatch = saltHex.match(/.{1,2}/g);
    if (!saltMatch) return { valid: false, needsUpgrade: false };
    const salt = new Uint8Array(saltMatch.map(b => parseInt(b, 16)));

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      expectedHashHex.length * 4
    );

    const derivedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Constant-time comparison to protect against timing side-channel attacks
    if (derivedHex.length !== expectedHashHex.length) {
      return { valid: false, needsUpgrade: false };
    }
    let diff = 0;
    for (let i = 0; i < derivedHex.length; i++) {
      diff |= derivedHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
    }

    const isValid = diff === 0;
    // Automatically trigger hash upgrade if previous iterations were lower than 600,000
    const needsUpgrade = isValid && iterations < PBKDF2_ITERATIONS;

    return { valid: isValid, needsUpgrade };
  }

  // Legacy fallback: plain SHA-256 (64 hex characters) or plaintext migration
  const enc = new TextEncoder();
  const sha256Buf = await crypto.subtle.digest("SHA-256", enc.encode(password));
  const sha256Hex = Array.from(new Uint8Array(sha256Buf)).map(b => b.toString(16).padStart(2, "0")).join("");

  if (sha256Hex === storedHash || password === storedHash) {
    return { valid: true, needsUpgrade: true };
  }

  return { valid: false, needsUpgrade: false };
}

// =========================================================================
// 2. Cryptographic Random Token Generation
// =========================================================================

export function generateSecureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "omni-" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// =========================================================================
// 3. Deep SSRF Defense (IPv4, IPv6, Numeric/Hex/Octal, Private Ranges)
// =========================================================================

/**
 * Checks if an IPv4 address (as a 32-bit unsigned number) falls into private/reserved ranges.
 */
function isPrivateIpv4Num(ipNum: number): boolean {
  const b0 = (ipNum >>> 24) & 255;
  const b1 = (ipNum >>> 16) & 255;
  const b2 = (ipNum >>> 8) & 255;
  const b3 = ipNum & 255;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (b0 === 10) return true;
  // 100.64.0.0/10 (Shared address space / Carrier-grade NAT: 100.64.0.0 to 100.127.255.255)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 172.16.0.0/12 (Private network: 172.16.0.0 to 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && b2 === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && b2 === 2) return true;
  // 192.88.99.0/24 (6to4 Relay)
  if (b0 === 192 && b1 === 88 && b2 === 99) return true;
  // 192.168.0.0/16 (Private network)
  if (b0 === 192 && b1 === 168) return true;
  // 198.18.0.0/15 (Network Benchmark Tests: 198.18.0.0 to 198.19.255.255)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && b2 === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && b2 === 113) return true;
  // 224.0.0.0/4 (Multicast & 240.0.0.0/4 Reserved)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Attempts to parse arbitrary IPv4 representations:
 * - Dotted quad: "192.168.1.1"
 * - Hexadecimal components: "0x7f.0.0.1"
 * - Octal components: "0177.0.0.1"
 * - Single integer (decimal or hex): "2130706433", "0x7f000001"
 */
function parseIpv4ToNumber(host: string): number | null {
  const trimmed = host.trim().toLowerCase();

  // Case 1: Pure single integer (hex, octal, or decimal)
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const val = parseInt(trimmed, 16);
    if (!isNaN(val) && val >= 0 && val <= 0xffffffff) return val >>> 0;
  }
  // Octal single number (e.g. 017700000001)
  if (/^0[0-7]+$/.test(trimmed)) {
    const val = parseInt(trimmed, 8);
    if (!isNaN(val) && val >= 0 && val <= 0xffffffff) return val >>> 0;
  }
  if (/^\d+$/.test(trimmed)) {
    const val = Number(trimmed);
    if (!isNaN(val) && val >= 0 && val <= 0xffffffff) return val >>> 0;
  }

  // Case 2: Dotted format (1 to 4 parts)
  const parts = trimmed.split(".");
  if (parts.length === 4) {
    let result = 0;
    for (let i = 0; i < 4; i++) {
      const part = parts[i];
      let partVal: number;
      if (part.startsWith("0x")) {
        partVal = parseInt(part, 16);
      } else if (part.length > 1 && part.startsWith("0")) {
        partVal = parseInt(part, 8);
      } else {
        partVal = parseInt(part, 10);
      }
      if (isNaN(partVal) || partVal < 0 || partVal > 255) {
        return null;
      }
      result = ((result << 8) | partVal) >>> 0;
    }
    return result;
  }

  return null;
}

/**
 * Evaluates whether an IPv6 address is private, loopback, link-local, or IPv4-mapped private.
 */
function isPrivateIpv6(host: string): boolean {
  let clean = host.toLowerCase().trim();
  if (clean.startsWith("[") && clean.endsWith("]")) {
    clean = clean.slice(1, -1);
  }

  // Loopback (::1) or Unspecified (::)
  if (clean === "::1" || clean === "::" || /^0*(:0*){0,7}:?1$/.test(clean)) return true;

  // Link-local (fe80::/10)
  if (/^fe[89ab][0-9a-f]:/i.test(clean) || clean.startsWith("fe80:")) return true;

  // Unique local / Private (fc00::/7: fc00:: or fd00::)
  if (/^f[cd][0-9a-f]{2}:/i.test(clean)) return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (clean.includes("::ffff:")) {
    const mappedPart = clean.split("::ffff:")[1];
    if (mappedPart) {
      const ipNum = parseIpv4ToNumber(mappedPart);
      if (ipNum !== null) return isPrivateIpv4Num(ipNum);
    }
    return true; // Block unparseable mapped forms defensively
  }

  return false;
}

/**
 * Evaluates whether an IP address (IPv4 or IPv6, including non-standard notations)
 * falls into private, loopback, link-local, carrier NAT, multicast, or reserved ranges.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return true;
  let clean = ip.trim().toLowerCase();
  if (clean.startsWith("[") && clean.endsWith("]")) {
    clean = clean.slice(1, -1);
  }

  // IPv6 format (contains colons or loopback/unspecified shorthand)
  if (clean.includes(":") || clean === "::1" || clean === "::") {
    return isPrivateIpv6(clean);
  }

  // IPv4 format (dotted, hex, octal, single integer)
  const ipv4Num = parseIpv4ToNumber(clean);
  if (ipv4Num !== null) {
    return isPrivateIpv4Num(ipv4Num);
  }

  // If not recognized as a valid IP format, return true (defensive default)
  return true;
}

/**
 * Maximum allowed HTML response body size (512 KB) for URL metadata preview scraping
 * to eliminate memory exhaustion / Slowloris / body bomb DoS risks.
 */
export const MAX_METADATA_HTML_BYTES = 512 * 1024; // 524,288 bytes (512 KB)

/**
 * Validates domain and hostname safety against SSRF and internal infrastructure probing.
 */
export function isSafeDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string" || domain.length > 253) return false;
  let lower = domain.toLowerCase().trim();

  // Strip port if present (only when single colon, or bracketed IPv6: [::1]:8080)
  if (lower.startsWith("[") && lower.includes("]:")) {
    lower = lower.split("]:")[0] + "]";
  } else if (!lower.includes("]") && (lower.match(/:/g) || []).length === 1) {
    lower = lower.split(":")[0];
  }

  // Forbidden local, loopback, and cloud metadata hostnames
  const forbiddenNames = [
    "localhost", "0.0.0.0", "127.0.0.1", "169.254.169.254", "::1",
    "metadata.google.internal", "metadata", "instance-data",
    "kubernetes.default", "kubernetes.default.svc"
  ];
  if (forbiddenNames.includes(lower)) return false;

  // Forbidden local / internal TLDs
  if (
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".lan") ||
    lower.endsWith(".arpa") ||
    lower.endsWith(".intranet") ||
    lower.endsWith(".home") ||
    lower.endsWith(".localdomain")
  ) {
    return false;
  }

  // Check if domain is an IPv6 representation
  if ((lower.startsWith("[") && lower.endsWith("]")) || (lower.match(/:/g) || []).length >= 2) {
    if (isPrivateIpv6(lower)) return false;
  }

  // Check IPv4 forms (decimal dotted, numeric, hex, octal)
  const ipv4Num = parseIpv4ToNumber(lower);
  if (ipv4Num !== null) {
    if (isPrivateIpv4Num(ipv4Num)) return false;
  }

  // Validate FQDN format
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(lower);
}

/**
 * Resolves a hostname via DNS-over-HTTPS (1.1.1.1) and verifies that all resolved IP
 * addresses are public, non-private, and non-reserved (Universal DNS Rebinding Defense).
 * Works across both Node.js and Cloudflare Workers environments.
 */
export async function validateDnsWithDoH(hostname: string): Promise<{ safe: boolean; addresses: string[]; error?: string }> {
  try {
    const cleanHost = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");

    // If host is already an IP, test directly
    if (parseIpv4ToNumber(cleanHost) !== null || cleanHost.includes(":")) {
      if (isPrivateIp(cleanHost)) {
        return { safe: false, addresses: [cleanHost], error: `目标 IP (${cleanHost}) 属于私有或受限制的内部网络` };
      }
      return { safe: true, addresses: [cleanHost] };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const [aRes, aaaaRes] = await Promise.all([
      fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(cleanHost)}&type=A`, {
        headers: { "Accept": "application/dns-json" },
        signal: controller.signal
      }).catch(() => null),
      fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(cleanHost)}&type=AAAA`, {
        headers: { "Accept": "application/dns-json" },
        signal: controller.signal
      }).catch(() => null)
    ]);

    clearTimeout(timeoutId);

    const addresses: string[] = [];

    if (aRes && aRes.ok) {
      const aData: any = await aRes.json().catch(() => ({}));
      if (Array.isArray(aData.Answer)) {
        for (const ans of aData.Answer) {
          if (ans.type === 1 && ans.data) addresses.push(ans.data);
        }
      }
    }

    if (aaaaRes && aaaaRes.ok) {
      const aaaaData: any = await aaaaRes.json().catch(() => ({}));
      if (Array.isArray(aaaaData.Answer)) {
        for (const ans of aaaaData.Answer) {
          if (ans.type === 28 && ans.data) addresses.push(ans.data);
        }
      }
    }

    if (addresses.length === 0) {
      return { safe: false, addresses: [], error: `DNS 解析未返回有效公网 IP 地址` };
    }

    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        return { safe: false, addresses, error: `域名解析到私有/受限 IP 地址 (${addr})，存在 DNS 重绑定风险` };
      }
    }

    return { safe: true, addresses };
  } catch (err: any) {
    return { safe: false, addresses: [], error: `DNS 验证异常: ${err.message}` };
  }
}

// Dangerous non-HTTP ports to block against SSRF, port scanning, and internal service probing
export const DANGEROUS_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 138, 139,
  143, 161, 179, 389, 445, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548,
  554, 556, 563, 587, 601, 636, 993, 995, 1433, 1521, 1723, 2049, 3306, 5432, 5900,
  6379, 11211, 27017, 28017
]);

export function isSafePort(portVal?: string | number | null): boolean {
  if (portVal === undefined || portVal === null || portVal === "") return true;
  const p = typeof portVal === "number" ? portVal : parseInt(String(portVal), 10);
  if (isNaN(p) || p <= 0 || p > 65535) return false;
  return !DANGEROUS_PORTS.has(p);
}

// Canonical Route Regular Expressions for bookmark & category endpoints
export const CLICK_ROUTE_REGEX = /^\/api\/bookmarks\/([a-zA-Z0-9_-]+)\/click$/;
export const BOOKMARK_ITEM_ROUTE_REGEX = /^\/api\/bookmarks\/(?!reorder$)([a-zA-Z0-9_-]+)$/;
export const CATEGORY_ITEM_ROUTE_REGEX = /^\/api\/categories\/(?!reorder$)([a-zA-Z0-9_-]+)$/;

// Whitelist of public settings fields allowed to be returned without authentication
export const PUBLIC_SETTINGS_KEYS = [
  "siteName",
  "siteSubtitle",
  "announcement",
  "defaultViewMode",
  "allowPublicSubmit",
  "enableWeather",
  "enableSearchEngine",
  "defaultSearchEngine"
] as const;

// Safe settings fields returned to authenticated administrator (strictly excluding sensitive credentials like API keys and password hashes)
export const ADMIN_SAFE_SETTINGS_KEYS = [
  ...PUBLIC_SETTINGS_KEYS,
  "cfAccountId",
  "cfD1DatabaseId",
  "cfKvNamespaceId"
] as const;

/**
 * Sanitizes settings for authenticated administrator.
 * In accordance with zero-leakage security principles, sensitive API keys
 * (Gemini API Key, Cloudflare API Token, password hash) are NEVER returned to the browser.
 * Instead, boolean indicators (hasGeminiApiKey, hasCfApiToken) are generated.
 */
export function sanitizeSettingsForAdmin(
  rawSettings: Record<string, any> = {},
  options?: { hasEnvGeminiKey?: boolean; hasEnvCfToken?: boolean }
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of ADMIN_SAFE_SETTINGS_KEYS) {
    if (rawSettings[key] !== undefined) {
      result[key] = rawSettings[key];
    }
  }

  // Detect presence of Gemini key from environment variable or database
  const hasDbGeminiKey = Boolean(
    rawSettings.geminiApiKey &&
    rawSettings.geminiApiKey !== '""' &&
    rawSettings.geminiApiKey !== 'null' &&
    String(rawSettings.geminiApiKey).trim() !== ""
  );
  result.hasGeminiApiKey = Boolean(options?.hasEnvGeminiKey || hasDbGeminiKey);

  // Detect presence of Cloudflare API token from environment variable or database
  const hasDbCfToken = Boolean(
    rawSettings.cfApiToken &&
    rawSettings.cfApiToken !== '""' &&
    rawSettings.cfApiToken !== 'null' &&
    String(rawSettings.cfApiToken).trim() !== ""
  );
  result.hasCfApiToken = Boolean(options?.hasEnvCfToken || hasDbCfToken);

  return result;
}

/**
 * Sanitizes settings for unauthenticated public visitors.
 * Strictly whitelists UI display fields only.
 */
export function sanitizeSettingsForPublic(rawSettings: Record<string, any> = {}): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of PUBLIC_SETTINGS_KEYS) {
    if (rawSettings[key] !== undefined) {
      result[key] = rawSettings[key];
    }
  }
  return result;
}

/**
 * Safely parses JSON from a fetch Response, preventing 'Unexpected end of JSON input' errors
 * on empty bodies (204 No Content, empty string, or server error pages).
 */
export async function safeFetchJson<T = any>(res: Response, fallback: T = {} as T): Promise<T> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export const IMPORT_SETTINGS_WHITELIST = new Set([
  "siteName",
  "siteSubtitle",
  "announcement",
  "defaultViewMode",
  "allowPublicSubmit",
  "enableWeather",
  "enableSearchEngine",
  "defaultSearchEngine"
]);

// Minimum password length (OWASP & NIST SP 800-63B recommendation: >= 12 characters for password manager friendly phrases)
export const MIN_ADMIN_PASSWORD_LENGTH = 12;

/**
 * Validates admin password length and strength.
 * Enforces >= 12 characters, friendly for password manager passphrases.
 */
export function validatePasswordStrength(password?: string | null): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "密码不能为空" };
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `新密码长度至少需要 ${MIN_ADMIN_PASSWORD_LENGTH} 位（建议使用密码管理器生成长密码或多单词短语）`
    };
  }
  return { valid: true };
}

// =========================================================================
// 1.1 JWT (JSON Web Token - HS256) Cryptographic Signing & Verification
// =========================================================================

/**
 * Base64Url encoder compatible across Node.js & Cloudflare Workers.
 */
export function base64UrlEncode(data: Uint8Array | string): string {
  let base64 = "";
  if (typeof data === "string") {
    const bytes = new TextEncoder().encode(data);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  } else {
    let binary = "";
    for (let i = 0; i < data.byteLength; i++) {
      binary += String.fromCharCode(data[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64Url decoder compatible across Node.js & Cloudflare Workers.
 */
export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Signs a standard JWT with HMAC-SHA256 using Web Crypto API.
 */
export async function signJwt(
  payload: Record<string, any>,
  secret: string,
  expiresInSeconds: number = SESSION_MAX_AGE_SECONDS
): Promise<string> {
  if (!secret || typeof secret !== "string") {
    throw new Error("JWT_SECRET is required to sign JWT tokens");
  }
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
    jti: generateSecureToken()
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuf = await crypto.subtle.sign("HMAC", key, enc.encode(dataToSign));
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuf));

  return `${dataToSign}.${signatureB64}`;
}

/**
 * Verifies and decodes a JWT token with constant-time HMAC-SHA256 signature verification.
 */
export async function verifyJwt(
  token: string,
  secret: string
): Promise<{ valid: boolean; payload?: any; error?: string }> {
  if (!token || typeof token !== "string" || !secret) {
    return { valid: false, error: "Invalid token or secret" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed JWT structure" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const enc = new TextEncoder();
    const dataToSign = `${headerB64}.${payloadB64}`;
    const signatureBytes = base64UrlDecode(signatureB64);

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const isValidSig = await crypto.subtle.verify("HMAC", key, signatureBytes, enc.encode(dataToSign));
    if (!isValidSig) {
      return { valid: false, error: "Invalid JWT signature" };
    }

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && typeof payload.exp === "number" && payload.exp < now) {
      return { valid: false, error: "JWT token has expired", payload };
    }

    return { valid: true, payload };
  } catch (e: any) {
    return { valid: false, error: e?.message || "JWT verification failed" };
  }
}

/**
 * Computes a SHA-256 hash of a session token for secure database storage.
 * Server stores hashSessionToken(token); client holds raw token.
 * Even if database/D1 is exposed, attackers cannot use the tokenHash directly.
 */
export async function hashSessionToken(token: string): Promise<string> {
  if (!token || typeof token !== "string") return "";
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Session Cookie Configuration
export const SESSION_COOKIE_NAME = "omnimark_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Parses a standard Cookie header into key-value pairs.
 */
export function parseCookies(cookieHeader?: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return cookies;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const k = pair.substring(0, idx).trim();
      const v = pair.substring(idx + 1).trim();
      if (k && v) {
        try {
          cookies[k] = decodeURIComponent(v);
        } catch {
          cookies[k] = v;
        }
      }
    }
  }
  return cookies;
}

/**
 * Creates a secure HttpOnly Set-Cookie string for admin sessions.
 */
export function createSessionCookie(token: string, options?: { secure?: boolean; maxAge?: number }): string {
  const isSecure = options?.secure ?? false;
  const maxAge = options?.maxAge ?? SESSION_MAX_AGE_SECONDS;
  let cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  if (isSecure) {
    cookie += "; Secure";
  }
  return cookie;
}

/**
 * Creates an expired Set-Cookie string to clear the admin session cookie on logout.
 */
export function createClearSessionCookie(options?: { secure?: boolean }): string {
  const isSecure = options?.secure ?? false;
  let cookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  if (isSecure) {
    cookie += "; Secure";
  }
  return cookie;
}

/**
 * Safely extracts the session token from incoming request credentials:
 * Priority 1: HttpOnly Cookie ('omnimark_session')
 * Priority 2: Authorization Header ('Bearer <token>')
 */
export function extractSessionToken(headers: { get(name: string): string | null } | Record<string, any>): string | null {
  const getHeader = (name: string): string | null => {
    if (!headers) return null;
    if (typeof (headers as any).get === "function") {
      return (headers as any).get(name);
    }
    const dict = headers as Record<string, any>;
    const val = dict[name] || dict[name.toLowerCase()] || dict[name.toUpperCase()];
    if (Array.isArray(val)) return val[0] || null;
    return typeof val === "string" ? val : null;
  };

  // 1. Try Cookie
  const cookieHeader = getHeader("cookie");
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    if (cookies[SESSION_COOKIE_NAME]) {
      return cookies[SESSION_COOKIE_NAME];
    }
  }

  // 2. Fallback to Authorization: Bearer <token>
  const authHeader = getHeader("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token) return token;
  }

  return null;
}

/**
 * Parses and normalizes session expiration timestamp.
 * Safely handles numeric timestamps, numeric strings, and legacy ISO date strings.
 */
export function parseSessionExpiresAt(rawExpiresAt: any): number {
  if (typeof rawExpiresAt === "number") return rawExpiresAt;
  if (typeof rawExpiresAt === "string") {
    const parsedIso = Date.parse(rawExpiresAt);
    if (!isNaN(parsedIso)) return parsedIso;
    const parsedInt = parseInt(rawExpiresAt, 10);
    if (!isNaN(parsedInt)) return parsedInt;
  }
  return NaN;
}

/**
 * Validates whether an admin session record is active and unexpired.
 */
export function isSessionValid(session?: { expiresAt?: any } | null, now = Date.now()): boolean {
  if (!session || session.expiresAt === undefined || session.expiresAt === null) return false;
  const expiresAt = parseSessionExpiresAt(session.expiresAt);
  if (isNaN(expiresAt)) return false;
  return expiresAt > now;
}

/**
 * Validates full URL safety (protocol, port, domain).
 */
export function isSafeUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim();
  if (!trimmed.toLowerCase().startsWith("http://") && !trimmed.toLowerCase().startsWith("https://")) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    // Reject dangerous service ports (e.g., SSH, SMTP, DBs, Redis)
    if (parsed.port) {
      if (!isSafePort(parsed.port)) return false;
    }

    // Disallow userinfo (e.g., http://user:pass@host)
    if (parsed.username || parsed.password) return false;

    return isSafeDomain(parsed.hostname);
  } catch {
    return false;
  }
}

// =========================================================================
// 4. Safe HTML Bookmarks Parser (Netscape Bookmark Format with Multiline Support)
// =========================================================================

export interface ParsedBookmarkItem {
  title: string;
  url: string;
  categoryName: string;
  icon?: string;
  description?: string;
}

export function parseNetscapeBookmarks(htmlContent: string): ParsedBookmarkItem[] {
  const results: ParsedBookmarkItem[] = [];
  if (!htmlContent || typeof htmlContent !== "string") return results;

  // We scan through the HTML content tracking the current category header (<H3>...</H3>)
  let currentCategory = "浏览器导入";

  // Match folder headings (<H3>) or bookmark links (<A ...>) across multiple lines
  const tokenRegex = /(?:<H3\b[^>]*>(.*?)<\/H3>)|(?:<A\b([^>]*?)>(.*?)<\/A>(?:\s*<DD>(.*?)(?=<DT|<DL|<\/DL|$))?)/gis;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(htmlContent)) !== null) {
    if (match[1] !== undefined) {
      // It's an <H3> folder header
      const folderRaw = match[1].replace(/<[^>]*>/g, "").trim();
      if (folderRaw && folderRaw !== "Bookmarks" && folderRaw !== "书签栏" && folderRaw !== "收藏夹") {
        currentCategory = folderRaw.substring(0, 50);
      }
    } else if (match[2] !== undefined) {
      // It's an <A> bookmark link
      const attrsStr = match[2];
      const linkText = match[3] ? match[3].replace(/<[^>]*>/g, "").trim() : "";
      const ddDesc = match[4] ? match[4].replace(/<[^>]*>/g, "").trim() : "";

      // Extract HREF attribute (handles single quotes, double quotes, unquoted)
      const hrefMatch = /\bHREF=["']?([^"'\s>]+)/i.exec(attrsStr);
      if (!hrefMatch || !hrefMatch[1]) continue;

      let rawUrl = hrefMatch[1].trim();
      // Decode basic HTML entities
      rawUrl = rawUrl.replace(/&amp;/g, "&");

      if (!isSafeUrl(rawUrl)) continue;

      // Extract ICON attribute if available
      const iconMatch = /\bICON=["']?([^"'\s>]+)/i.exec(attrsStr);
      let icon = iconMatch && iconMatch[1] ? iconMatch[1].trim() : "";
      if (icon.startsWith("data:image/")) {
        // Safe inline icon
      } else if (!isSafeUrl(icon)) {
        icon = "";
      }

      const finalTitle = linkText || new URL(rawUrl).hostname;

      results.push({
        title: finalTitle.substring(0, 150),
        url: rawUrl.substring(0, 2000),
        categoryName: currentCategory,
        icon,
        description: ddDesc ? ddDesc.substring(0, 500) : undefined
      });
    }
  }

  return results;
}

// =========================================================================
// 5. HTML Escape Helper
// =========================================================================

export function escapeHtml(str?: string | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
