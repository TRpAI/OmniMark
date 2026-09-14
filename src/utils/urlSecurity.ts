/**
 * Security and URL sanitization utilities for OmniMark.
 * Prevents XSS via dangerous protocol schemes (javascript:, data:, vbscript:, etc.),
 * sanitizes hostnames, and provides reliable clipboard operations for sandboxed iframes.
 */

/**
 * Returns a sanitized, safe URL for use in href attributes.
 * Rejects javascript:, data:, and other executable URI schemes.
 * Prepends https:// if protocol is missing.
 */
export function getSafeHref(urlStr?: string | null): string {
  if (!urlStr || typeof urlStr !== "string") {
    return "#";
  }

  const trimmed = urlStr.trim();
  if (!trimmed) {
    return "#";
  }

  const lower = trimmed.toLowerCase();

  // Block dangerous pseudo-protocols that can execute script in DOM context
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:")
  ) {
    return "#";
  }

  // Handle in-page anchors or relative paths
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) {
    return trimmed;
  }

  // Standardize web URLs: ensure http:// or https://
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

/**
 * Safely extracts the display hostname from a URL string without throwing.
 * Automatically strips leading 'www.' for a cleaner UI.
 */
export function safeGetHostname(urlStr?: string | null): string {
  if (!urlStr || typeof urlStr !== "string") {
    return "";
  }

  try {
    const safeUrl = getSafeHref(urlStr);
    if (safeUrl === "#") return "";
    const parsed = new URL(safeUrl);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    // Fallback simple regex extraction if URL parser fails
    const match = urlStr.match(/^(?:https?:\/\/)?(?:www\.)?([^/:?#\s]+)/i);
    return match && match[1] ? match[1] : urlStr.slice(0, 30);
  }
}

/**
 * Validates whether an input string is a valid web URL (http or https).
 */
export function isValidWebUrl(urlStr?: string | null): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim().toLowerCase();
  if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:")) return false;

  try {
    const formatted = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(formatted);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Robust clipboard copy utility compatible with sandboxed iframes.
 * Falls back to document.execCommand if navigator.clipboard is unavailable or restricted.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Try modern Clipboard API first
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  // Fallback: temporary hidden textarea for restricted iframes
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Clipboard copy failed:", err);
    return false;
  }
}
