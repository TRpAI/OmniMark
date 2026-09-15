/**
 * OmniMark Enterprise-Grade Security Utilities
 * - PBKDF2 Password Hashing & Constant-Time Verification (OWASP Compliant)
 * - Comprehensive SSRF Protection (IPv4/IPv6, Numeric/Hex/Octal, DNS Rebinding Defense)
 * - Safe HTML Bookmark Parsing (Netscape Bookmark Format with Multiline Support)
 * - Sanitization & Token Generation
 */

// =========================================================================
// 1. PBKDF2 Cryptographic Password Hashing & Verification
// =========================================================================

const PBKDF2_ITERATIONS = 100000;
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
 * Supports seamless migration from legacy SHA-256 or plaintext hashes.
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

    return { valid: diff === 0, needsUpgrade: false };
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

  // Case 1: Pure single integer (decimal or hex)
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const val = parseInt(trimmed, 16);
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
 * Validates domain and hostname safety against SSRF and internal infrastructure probing.
 */
export function isSafeDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string" || domain.length > 253) return false;
  let lower = domain.toLowerCase().trim();

  // Strip port if present
  if (lower.includes(":") && !lower.includes("]")) {
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
    lower.endsWith(".home")
  ) {
    return false;
  }

  // Check IPv6 (bracketed or unbracketed with multiple colons)
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
