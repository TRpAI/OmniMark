import { isSafeUrl } from "../utils/security.ts";
import { BookmarkModel } from "./types.ts";
import { BookmarkSchema } from "./schemas.ts";

export interface BookmarkValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: Partial<BookmarkModel>;
}

export class BookmarkService {
  /**
   * Sanitizes and validates a bookmark payload using Zod BookmarkSchema before persisting to database.
   */
  static validate(data: Partial<BookmarkModel>): BookmarkValidationResult {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "书签数据格式无效" };
    }

    const parseResult = BookmarkSchema.safeParse(data);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return {
        valid: false,
        error: firstIssue?.message || "书签输入校验失败"
      };
    }

    const val = parseResult.data;
    return {
      valid: true,
      sanitized: {
        title: val.title,
        url: val.url,
        categoryId: val.categoryId,
        icon: val.icon || "",
        description: val.description || "",
        tags: val.tags || [],
        isPinned: Boolean(val.isPinned),
        sortOrder: typeof val.sortOrder === "number" ? val.sortOrder : 0
      }
    };
  }

  /**
   * Validates reorder items payload.
   */
  static validateReorderItems(items: any[]): { valid: boolean; error?: string; items?: { id: string; sortOrder: number }[] } {
    if (!Array.isArray(items)) {
      return { valid: false, error: "排序列表必须为数组" };
    }
    const cleanItems: { id: string; sortOrder: number }[] = [];
    for (const item of items) {
      if (!item || typeof item.id !== "string") {
        return { valid: false, error: "排序项缺少有效 id" };
      }
      const sortOrder = typeof item.sortOrder === "number" ? item.sortOrder : 0;
      cleanItems.push({ id: item.id.trim(), sortOrder });
    }
    return { valid: true, items: cleanItems };
  }
}

/**
 * In-memory Click Throttle & Aggregator to avoid pounding database on rapid user clicks.
 * Tracks (bookmarkId + clientIp) with short debounce, and aggregates counters.
 */
export class ClickAggregator {
  private lastClicks = new Map<string, number>();
  private pendingDeltas = new Map<string, number>();
  private readonly debounceMs: number;

  constructor(debounceMs = 3000) {
    this.debounceMs = debounceMs;
  }

  /**
   * Registers a click. Returns true if allowed, false if debounced/rate-limited.
   */
  recordClick(bookmarkId: string, clientIp: string): boolean {
    const now = Date.now();
    const key = `${bookmarkId}:${clientIp}`;
    const lastTime = this.lastClicks.get(key) || 0;

    if (now - lastTime < this.debounceMs) {
      return false; // throttled
    }

    this.lastClicks.set(key, now);
    const cur = this.pendingDeltas.get(bookmarkId) || 0;
    this.pendingDeltas.set(bookmarkId, cur + 1);

    // Housekeeping: clean entries older than 1 minute to prevent memory leak
    if (this.lastClicks.size > 2000) {
      for (const [k, time] of this.lastClicks.entries()) {
        if (now - time > 60000) {
          this.lastClicks.delete(k);
        }
      }
    }

    return true;
  }

  /**
   * Flushes and returns pending click deltas to commit to database.
   */
  flush(): Map<string, number> {
    const snapshot = new Map(this.pendingDeltas);
    this.pendingDeltas.clear();
    return snapshot;
  }

  getPendingDelta(bookmarkId: string): number {
    return this.pendingDeltas.get(bookmarkId) || 0;
  }
}
