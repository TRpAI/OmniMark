/**
 * Cloudflare Worker Backend for OmniMark Navigation & Bookmark System
 * - Cloudflare Pages serves the compiled static frontend UI (dist/)
 * - Cloudflare Workers serves serverless API routes (/api/*)
 * - Cloudflare D1 (env.DB) provides relational data persistence
 * - Cloudflare KV (env.CACHE_KV) provides edge caching acceleration
 */

import {
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  generateSecureToken,
  isSafeDomain,
  isSafeUrl,
  parseNetscapeBookmarks,
  escapeHtml,
  PUBLIC_SETTINGS_KEYS,
  CLICK_ROUTE_REGEX,
  CATEGORY_ITEM_ROUTE_REGEX,
  BOOKMARK_ITEM_ROUTE_REGEX,
  parseSessionExpiresAt,
  isSessionValid
} from "./src/utils/security.ts";

// Default PBKDF2 hash for initial installation (admin123, 100,000 iterations, 32-byte salt)
const DEFAULT_ADMIN_HASH = "pbkdf2:sha256:100000:23fb0c6cda199c36b92eb7ab502043b6:8a3adcb7fcaf7581a527a62a6cdd974ea8324b1a1bc8077f2ebfb7758a65063d";

declare global {
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    exec(query: string): Promise<any>;
    batch<T = any>(statements: D1PreparedStatement[]): Promise<T[]>;
  }
  interface D1PreparedStatement {
    bind(...values: any[]): D1PreparedStatement;
    all<T = any>(): Promise<{ results?: T[] }>;
    first<T = any>(col?: string): Promise<T | null>;
    run(): Promise<any>;
  }
  interface KVNamespace {
    get(key: string, options?: { type?: string; cacheTtl?: number }): Promise<any>;
    put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expiration?: number; expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
  interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
    passThroughOnException(): void;
  }
}

export interface Env {
  DB?: D1Database;
  db?: D1Database;
  D1?: D1Database;
  DATABASE?: D1Database;
  CACHE_KV?: KVNamespace;
  KV?: KVNamespace;
  cache_kv?: KVNamespace;
  kv?: KVNamespace;
  ENVIRONMENT?: string;
  GEMINI_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  [key: string]: any;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      return handleApiRequest(request, env, ctx);
    }

    return new Response("OmniMark Cloudflare Pages & Workers Routing Active", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};

// Robust validation to ensure D1 and KV are real bindings
function isRealD1(val: any): boolean {
  if (!val || typeof val !== "object") return false;
  if (typeof val.fetch === "function") return false;
  if (typeof val.prepare !== "function" || typeof val.batch !== "function") return false;
  try {
    const stmt = val.prepare("SELECT 1");
    if (!stmt || typeof stmt.then === "function") return false;
    return typeof stmt.bind === "function" && typeof stmt.all === "function";
  } catch {
    return false;
  }
}

function isRealKV(val: any): boolean {
  if (!val || typeof val !== "object") return false;
  if (typeof val.fetch === "function") return false;
  if (typeof val.get !== "function" || typeof val.put !== "function") return false;
  return typeof val.getWithMetadata === "function" || typeof val.delete === "function";
}

// Initial database schema bootstrap & seeding
let tablesEnsured = false;
async function ensureTables(db: D1Database) {
  if (tablesEnsured) return;
  try {
    if (!isRealD1(db)) return;
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT,
        icon TEXT,
        sortOrder INTEGER,
        description TEXT
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        title TEXT,
        url TEXT,
        description TEXT,
        categoryId TEXT,
        icon TEXT,
        tags TEXT,
        clicks INTEGER,
        sortOrder INTEGER,
        isPinned INTEGER,
        createdAt TEXT
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        expiresAt INTEGER
      )
    `).run();

    // Seed default settings with PBKDF2 hash if empty
    const adminPass = await db.prepare("SELECT value FROM settings WHERE key = 'adminPasswordHash'").first<any>();
    if (!adminPass) {
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('adminPasswordHash', ?)").bind(JSON.stringify(DEFAULT_ADMIN_HASH)).run();
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('siteName', ?)").bind(JSON.stringify("OmniMark 导航与书签")).run();
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('siteSubtitle', ?)").bind(JSON.stringify("极简、高效、多端同步的现代化站点导航与书签管理系统")).run();
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('allowPublicSubmit', ?)").bind(JSON.stringify(false)).run();
    }

    // Seed default categories if empty
    const catCount = await db.prepare("SELECT COUNT(*) as count FROM categories").first<any>();
    if (!catCount || catCount.count === 0) {
      const defaultCats = [
        { id: "cat-1", name: "常用推荐", icon: "Star", sortOrder: 1, description: "高频使用的日常核心工具" },
        { id: "cat-2", name: "开发运维", icon: "Code", sortOrder: 2, description: "编程、框架、云服务与终端工具" },
        { id: "cat-3", name: "AI 与前沿", icon: "Sparkles", sortOrder: 3, description: "大模型、人工智能与创新科技" },
        { id: "cat-4", name: "设计灵感", icon: "Palette", sortOrder: 4, description: "UI/UX、图片素材、配色与字体" },
        { id: "cat-5", name: "学习社区", icon: "BookOpen", sortOrder: 5, description: "文档、博客、技术论坛与教程" }
      ];
      for (const c of defaultCats) {
        await db.prepare("INSERT OR REPLACE INTO categories (id, name, icon, sortOrder, description) VALUES (?, ?, ?, ?, ?)")
          .bind(c.id, c.name, c.icon, c.sortOrder, c.description).run();
      }
    }

    tablesEnsured = true;
  } catch (e) {
    console.error("D1 ensureTables error:", e);
  }
}

// Authentication middleware with strict Header-only check, session expiration, and non-bypass security
async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;

  if (!token) {
    return new Response(JSON.stringify({ error: "未授权：请先通过 Authorization 请求头提供管理员令牌" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Security critical fix: If D1 database is NOT bound, reject with 503 instead of bypassing!
  if (!env.DB) {
    return new Response(JSON.stringify({ error: "服务不可用：Cloudflare D1 数据库未绑定，拒绝执行受保护的管理操作" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const session = await env.DB.prepare("SELECT token, expiresAt FROM admin_sessions WHERE token = ?").bind(token).first<any>();
    if (!session) {
      return new Response(JSON.stringify({ error: "未授权：登录令牌无效或已被注销，请重新登录" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!isSessionValid(session)) {
      await env.DB!.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
      return new Response(JSON.stringify({ error: "登录会话已过期，请重新登录" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "鉴权校验异常: " + e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  return null;
}

// Login rate limiter
const loginRateLimitMap = new Map<string, { failCount: number; firstAttempt: number }>();
function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  for (const [k, rec] of loginRateLimitMap.entries()) {
    if (now - rec.firstAttempt > 120000) loginRateLimitMap.delete(k);
  }
  const record = loginRateLimitMap.get(ip);
  if (!record) return true;
  if (now - record.firstAttempt > 60000) {
    loginRateLimitMap.delete(ip);
    return true;
  }
  return record.failCount < 5;
}
function recordLoginFailure(ip: string) {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);
  if (!record || now - record.firstAttempt > 60000) {
    loginRateLimitMap.set(ip, { failCount: 1, firstAttempt: now });
  } else {
    record.failCount += 1;
  }
}
function clearLoginFailures(ip: string) {
  loginRateLimitMap.delete(ip);
}

async function invalidateCache(env: Env) {
  if (env.CACHE_KV) {
    try {
      await env.CACHE_KV.delete("omnimark:api:data");
    } catch {}
  }
}

async function handleApiRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Strict CORS Header Resolver: Restrict to origin if domain matches host or allowed list
  const origin = request.headers.get("Origin") || "";
  let allowOrigin = "";
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === url.host) {
        allowOrigin = origin;
      } else if (env.ALLOWED_ORIGINS) {
        const allowedList = env.ALLOWED_ORIGINS.split(",").map((s: string) => s.trim());
        if (allowedList.includes(origin)) {
          allowOrigin = origin;
        }
      }
    } catch {}
  }

  const corsHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (allowOrigin) {
    corsHeaders["Access-Control-Allow-Origin"] = allowOrigin;
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  }
  // When origin is not permitted, strictly omit Access-Control-Allow-Origin instead of reflecting arbitrary origin

  if (method === "OPTIONS") {
    if (origin && !allowOrigin) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Request body payload size limit (10MB)
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "请求数据包过大，最大允许 10MB" }), {
      status: 413,
      headers: corsHeaders
    });
  }

  let activeD1 = isRealD1(env?.DB) ? env.DB : (isRealD1(env?.db) ? env.db : (isRealD1(env?.D1) ? env.D1 : (isRealD1(env?.DATABASE) ? env.DATABASE : null)));
  let activeKV = isRealKV(env?.CACHE_KV) ? env.CACHE_KV : (isRealKV(env?.KV) ? env.KV : (isRealKV(env?.cache_kv) ? env.cache_kv : (isRealKV(env?.kv) ? env.kv : null)));

  if (env && typeof env === "object") {
    for (const [key, val] of Object.entries(env)) {
      if (key === "ASSETS" || key === "CF_PAGES" || key === "__STATIC_CONTENT") continue;
      if (!activeD1 && isRealD1(val)) activeD1 = val;
      if (!activeKV && isRealKV(val)) activeKV = val;
    }
  }

  const d1Bound = Boolean(activeD1);
  const kvBound = Boolean(activeKV);

  if (d1Bound) env.DB = activeD1;
  if (kvBound) env.CACHE_KV = activeKV;

  if (d1Bound) {
    await ensureTables(env.DB!);
  }

  try {
    // 1. Health & System Status
    if (path === "/api/health" || path === "/api/system/status") {
      const warnings: string[] = [];
      if (!d1Bound) warnings.push("Cloudflare D1 数据库未绑定 (env.DB 缺失)");
      if (!kvBound) warnings.push("Cloudflare KV 缓存未绑定 (env.CACHE_KV 缺失)");

      let hasGemini = false;
      let hasCf = false;
      if (d1Bound) {
        try {
          const sRes = await env.DB!.prepare("SELECT key, value FROM settings").all();
          sRes.results?.forEach((r: any) => {
            if (r.key === "geminiApiKey") hasGemini = Boolean(r.value && r.value !== '""');
            if (r.key === "cfApiToken") hasCf = Boolean(r.value && r.value !== '""');
          });
        } catch {}
      }

      return new Response(JSON.stringify({
        status: "ok",
        runtime: "cloudflare-workers-secure",
        d1Bound,
        kvBound,
        hasGeminiKey: hasGemini || Boolean(env.GEMINI_API_KEY),
        hasCfToken: hasCf || Boolean(env.CLOUDFLARE_API_TOKEN),
        warnings,
      }), { headers: corsHeaders });
    }

    // 2. Favicon Proxy with SSRF protection
    if (path === "/api/icon-proxy" && method === "GET") {
      const targetUrl = url.searchParams.get("url");
      let targetDomain = url.searchParams.get("domain");

      if (!targetDomain && targetUrl) {
        try {
          const parsed = new URL(targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`);
          targetDomain = parsed.hostname;
        } catch {}
      }

      if (!targetDomain || !isSafeDomain(targetDomain)) {
        targetDomain = "example.com";
      }
      targetDomain = targetDomain.replace(/^www\./, "").toLowerCase();

      resDirect: {
        return Response.redirect(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(targetDomain)}&sz=128`, 302);
      }
    }

    // 3. Admin Auth Login
    if (path === "/api/auth/login" && method === "POST") {
      const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";
      if (!checkLoginRateLimit(clientIp)) {
        return new Response(JSON.stringify({ success: false, error: "登录失败次数过多，请稍候 1 分钟后再试" }), { status: 429, headers: corsHeaders });
      }

      const body: any = await request.json().catch(() => ({}));
      const { password } = body;

      let storedHash = "";
      if (d1Bound) {
        const row = await env.DB!.prepare("SELECT value FROM settings WHERE key = 'adminPasswordHash'").first<any>();
        if (row && row.value) {
          try { storedHash = JSON.parse(row.value); } catch { storedHash = row.value; }
        }
      }

      const { valid, needsUpgrade } = await verifyPasswordPBKDF2(password || "", storedHash);
      if (valid) {
        clearLoginFailures(clientIp);

        // Auto-upgrade legacy hash to PBKDF2 if applicable
        if (needsUpgrade && d1Bound) {
          const upgradedHash = await hashPasswordPBKDF2(password);
          await env.DB!.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('adminPasswordHash', ?)").bind(JSON.stringify(upgradedHash)).run();
        }

        const token = generateSecureToken();
        const expiresAt = Date.now() + 86400000 * 7; // 7 days expiration in ms
        if (d1Bound) {
          try {
            await env.DB!.prepare("INSERT OR REPLACE INTO admin_sessions (token, expiresAt) VALUES (?, ?)").bind(token, expiresAt).run();
          } catch {}
        }
        return new Response(JSON.stringify({ success: true, token, expiresAt }), { headers: corsHeaders });
      }

      recordLoginFailure(clientIp);
      return new Response(JSON.stringify({ success: false, error: "管理员密码错误，请重新输入" }), { status: 401, headers: corsHeaders });
    }

    // 3.1 Admin Logout
    if (path === "/api/auth/logout" && method === "POST") {
      const authHeader = request.headers.get("Authorization");
      const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
      if (token && d1Bound) {
        try {
          await env.DB!.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
        } catch {}
      }
      return new Response(JSON.stringify({ success: true, message: "已安全退出登录" }), { headers: corsHeaders });
    }

    // 3.2 Verify Current Admin Session Status
    if (path === "/api/auth/me" && method === "GET") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;
      return new Response(JSON.stringify({ success: true, authenticated: true, role: "admin" }), { headers: corsHeaders });
    }

    // 4. Get Settings (Whitelisted for Public, Full Safe for Admin)
    if (path === "/api/settings" && method === "GET") {
      let settingsObj: any = {
        siteName: "OmniMark 站点导航",
        siteSubtitle: "极简优雅的前后端分离导航与书签系统",
        defaultViewMode: "grid",
        enableWeather: true,
        enableSearchEngine: true,
        defaultSearchEngine: "google"
      };

      if (d1Bound) {
        try {
          const settingsRes = await env.DB!.prepare("SELECT * FROM settings").all();
          settingsRes.results?.forEach((row: any) => {
            if (row.key === "adminPasswordHash") return;
            try {
              settingsObj[row.key] = JSON.parse(row.value);
            } catch {
              settingsObj[row.key] = row.value;
            }
          });
        } catch (e) {}
      }

      delete settingsObj.adminPasswordHash;

      // Check if request is from an authenticated admin
      const authHeader = request.headers.get("Authorization");
      const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
      let isAdmin = false;
      if (token && d1Bound) {
        try {
          const session = await env.DB!.prepare("SELECT token, expiresAt FROM admin_sessions WHERE token = ?").bind(token).first<any>();
          if (session && isSessionValid(session)) {
            isAdmin = true;
          }
        } catch {}
      }

      if (isAdmin) {
        return new Response(JSON.stringify(settingsObj), { headers: corsHeaders });
      }

      // Public visitors: Whitelist public fields only
      const publicSettings: Record<string, any> = {};
      for (const key of PUBLIC_SETTINGS_KEYS) {
        if (settingsObj[key] !== undefined) {
          publicSettings[key] = settingsObj[key];
        }
      }
      return new Response(JSON.stringify(publicSettings), { headers: corsHeaders });
    }

    // 5. Update Settings (PUT /api/settings) - Protected & Whitelisted
    if (path === "/api/settings" && method === "PUT") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const body: any = await request.json().catch(() => ({}));
      const { currentPassword, newPassword, ...rest } = body;

      if (newPassword) {
        if (!currentPassword) {
          return new Response(JSON.stringify({ error: "修改密码必须提供当前管理员密码" }), { status: 401, headers: corsHeaders });
        }
        let storedHash = "";
        const row = await env.DB!.prepare("SELECT value FROM settings WHERE key = 'adminPasswordHash'").first<any>();
        if (row && row.value) {
          try { storedHash = JSON.parse(row.value); } catch { storedHash = row.value; }
        }

        const { valid } = await verifyPasswordPBKDF2(currentPassword, storedHash);
        if (!valid) {
          return new Response(JSON.stringify({ error: "当前管理员密码不正确" }), { status: 401, headers: corsHeaders });
        }
        if (typeof newPassword !== "string" || newPassword.length < 6) {
          return new Response(JSON.stringify({ error: "新密码长度不能少于 6 位" }), { status: 400, headers: corsHeaders });
        }
        const newHash = await hashPasswordPBKDF2(newPassword);
        await env.DB!.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('adminPasswordHash', ?)").bind(JSON.stringify(newHash)).run();
        
        // Security fix: Invalidate ALL active admin sessions on password change
        await env.DB!.prepare("DELETE FROM admin_sessions").run();
      }

      const allowedKeys = [
        "siteName", "siteSubtitle", "announcement", "defaultViewMode",
        "allowPublicSubmit", "enableWeather", "enableSearchEngine", "defaultSearchEngine",
        "geminiApiKey", "cfApiToken", "cfAccountId", "cfD1DatabaseId", "cfKvNamespaceId"
      ];

      for (const key of allowedKeys) {
        if (rest[key] !== undefined) {
          await env.DB!.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, JSON.stringify(rest[key])).run();
        }
      }

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true, message: "系统配置已保存" }), { headers: corsHeaders });
    }

    // 6. Categories Endpoints
    if (path === "/api/categories" && method === "GET") {
      let categories: any[] = [];
      if (d1Bound) {
        try {
          const res = await env.DB!.prepare("SELECT * FROM categories ORDER BY sortOrder ASC").all();
          categories = res.results || [];
        } catch (e) {}
      }
      return new Response(JSON.stringify(categories), { headers: corsHeaders });
    }

    if (path === "/api/categories" && method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const body: any = await request.json().catch(() => ({}));
      const { name, icon, description } = body;
      if (!name || !String(name).trim()) {
        return new Response(JSON.stringify({ error: "分类名称不能为空" }), { status: 400, headers: corsHeaders });
      }

      const maxRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM categories").first<any>();
      const maxSort = maxRes && typeof maxRes.maxSort === "number" ? maxRes.maxSort : 0;

      const id = "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
      const safeName = String(name).trim().substring(0, 50);
      const safeIcon = icon ? String(icon).trim().substring(0, 30) : "Folder";
      const safeDesc = description ? String(description).trim().substring(0, 200) : "";

      await env.DB!.prepare("INSERT INTO categories (id, name, icon, sortOrder, description) VALUES (?, ?, ?, ?, ?)")
        .bind(id, safeName, safeIcon, maxSort + 1, safeDesc).run();

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true, id, name: safeName, icon: safeIcon, sortOrder: maxSort + 1, description: safeDesc }), { headers: corsHeaders });
    }

    const catItemMatch = path.match(CATEGORY_ITEM_ROUTE_REGEX);

    if (catItemMatch && method === "PUT") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const catId = catItemMatch[1];
      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const body: any = await request.json().catch(() => ({}));
      const existing = await env.DB!.prepare("SELECT * FROM categories WHERE id = ?").bind(catId).first<any>();
      if (!existing) return new Response(JSON.stringify({ error: "分类不存在" }), { status: 404, headers: corsHeaders });

      const name = body.name !== undefined ? String(body.name).trim().substring(0, 50) : existing.name;
      const icon = body.icon !== undefined ? String(body.icon).trim().substring(0, 30) : existing.icon;
      const description = body.description !== undefined ? String(body.description).trim().substring(0, 200) : existing.description;

      await env.DB!.prepare("UPDATE categories SET name = ?, icon = ?, description = ? WHERE id = ?")
        .bind(name, icon, description, catId).run();

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true, id: catId, name, icon, description }), { headers: corsHeaders });
    }

    if (catItemMatch && method === "DELETE") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const catId = catItemMatch[1];
      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const allCats = await env.DB!.prepare("SELECT * FROM categories ORDER BY sortOrder ASC").all();
      const categories = allCats.results || [];
      if (categories.length <= 1) {
        return new Response(JSON.stringify({ error: "至少需要保留一个分类" }), { status: 400, headers: corsHeaders });
      }

      const fallbackCat = categories.find((c: any) => c.id !== catId);
      const fallbackCatId = fallbackCat ? fallbackCat.id : "cat-1";

      const batchStmts = [
        env.DB!.prepare("DELETE FROM categories WHERE id = ?").bind(catId),
        env.DB!.prepare("UPDATE bookmarks SET categoryId = ? WHERE categoryId = ?").bind(fallbackCatId, catId)
      ];
      await env.DB!.batch(batchStmts);

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (path === "/api/categories/reorder" && method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });
      const body: any = await request.json().catch(() => ({}));
      const { orderedIds } = body;
      if (Array.isArray(orderedIds) && orderedIds.length > 0) {
        const reorderStmts = orderedIds.map((id: string, idx: number) =>
          env.DB!.prepare("UPDATE categories SET sortOrder = ? WHERE id = ?").bind(idx + 1, id)
        );
        await env.DB!.batch(reorderStmts);
        await invalidateCache(env);
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 7. Bookmarks Endpoints
    if (path === "/api/bookmarks" && method === "GET") {
      let bookmarks: any[] = [];
      if (d1Bound) {
        try {
          const res = await env.DB!.prepare("SELECT * FROM bookmarks").all();
          bookmarks = (res.results || []).map((b: any) => ({
            ...b,
            tags: typeof b.tags === "string" ? JSON.parse(b.tags) : (b.tags || []),
            isPinned: Boolean(b.isPinned),
          }));
        } catch (e) {}
      }

      const categoryId = url.searchParams.get("categoryId");
      const search = url.searchParams.get("search");
      const tag = url.searchParams.get("tag");

      if (categoryId && categoryId !== "all") {
        bookmarks = bookmarks.filter((b: any) => b.categoryId === categoryId);
      }
      if (search) {
        const q = search.toLowerCase();
        bookmarks = bookmarks.filter((b: any) =>
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          (b.description && b.description.toLowerCase().includes(q)) ||
          (b.tags && b.tags.some((t: string) => t.toLowerCase().includes(q)))
        );
      }
      if (tag) {
        bookmarks = bookmarks.filter((b: any) => b.tags && b.tags.includes(tag));
      }

      bookmarks.sort((a, b) => {
        if (Boolean(b.isPinned) !== Boolean(a.isPinned)) {
          return Boolean(b.isPinned) ? 1 : -1;
        }
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });

      return new Response(JSON.stringify(bookmarks), { headers: corsHeaders });
    }

    if (path === "/api/bookmarks" && method === "POST") {
      if (!d1Bound) {
        return new Response(JSON.stringify({ error: "Cloudflare D1 数据库未绑定" }), { status: 500, headers: corsHeaders });
      }

      let allowPublic = false;
      try {
        const row = await env.DB!.prepare("SELECT value FROM settings WHERE key = 'allowPublicSubmit'").first<any>();
        if (row && row.value) allowPublic = JSON.parse(row.value);
      } catch {}

      if (!allowPublic) {
        const authErr = await requireAuth(request, env);
        if (authErr) return authErr;
      }

      const bm: any = await request.json().catch(() => ({}));
      const { title, url, description, categoryId, icon, tags, isPinned } = bm;

      if (!url || !url.trim()) {
        return new Response(JSON.stringify({ error: "书签网址不能为空" }), { status: 400, headers: corsHeaders });
      }

      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
        normalizedUrl = "https://" + normalizedUrl;
      }

      if (!isSafeUrl(normalizedUrl)) {
        return new Response(JSON.stringify({ error: "不合法的网址协议或受限的内网地址" }), { status: 400, headers: corsHeaders });
      }

      let finalTitle = title && title.trim() ? title.trim().substring(0, 150) : "";
      if (!finalTitle) {
        try { finalTitle = new URL(normalizedUrl).hostname; } catch { finalTitle = normalizedUrl.substring(0, 50); }
      }

      let finalIcon = icon && icon.trim() && isSafeUrl(icon) ? icon.trim() : "";
      if (!finalIcon) {
        try {
          const parsed = new URL(normalizedUrl);
          if (isSafeDomain(parsed.hostname)) {
            finalIcon = `/api/icon-proxy?domain=${parsed.hostname}`;
          }
        } catch {}
      }

      let maxSort = 0;
      try {
        const maxRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM bookmarks").first<any>();
        if (maxRes && typeof maxRes.maxSort === "number") maxSort = maxRes.maxSort;
      } catch {}

      const id = "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
      const createdAt = new Date().toISOString();

      let targetCatId = categoryId;
      if (!targetCatId) {
        const firstCat = await env.DB!.prepare("SELECT id FROM categories ORDER BY sortOrder ASC LIMIT 1").first<any>();
        targetCatId = firstCat ? firstCat.id : "cat-1";
      }

      await env.DB!.prepare(`
        INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        finalTitle,
        normalizedUrl.substring(0, 2000),
        (description || "").trim().substring(0, 500),
        targetCatId,
        finalIcon,
        JSON.stringify(Array.isArray(tags) ? tags.map(t => String(t).trim().substring(0, 25)).filter(Boolean).slice(0, 10) : []),
        0,
        maxSort + 1,
        isPinned ? 1 : 0,
        createdAt
      ).run();

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true, id }), { headers: corsHeaders });
    }

    // Handle bookmark click tracking first with canonical regex
    const clickMatch = path.match(CLICK_ROUTE_REGEX);
    if (clickMatch && method === "POST") {
      const bmId = clickMatch[1];
      if (d1Bound) {
        await env.DB!.prepare("UPDATE bookmarks SET clicks = clicks + 1 WHERE id = ?").bind(bmId).run();
        await invalidateCache(env);
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    const bmItemMatch = path.match(BOOKMARK_ITEM_ROUTE_REGEX);

    if (bmItemMatch && method === "PUT") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const bmId = bmItemMatch[1];
      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const body: any = await request.json().catch(() => ({}));
      if (body.url) {
        let normalizedUrl = body.url.trim();
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
          normalizedUrl = "https://" + normalizedUrl;
        }
        if (!isSafeUrl(normalizedUrl)) {
          return new Response(JSON.stringify({ error: "不合法的网址协议或受限内网地址" }), { status: 400, headers: corsHeaders });
        }
        body.url = normalizedUrl.substring(0, 2000);
      }

      const existing = await env.DB!.prepare("SELECT * FROM bookmarks WHERE id = ?").bind(bmId).first<any>();
      if (!existing) return new Response(JSON.stringify({ error: "书签不存在" }), { status: 404, headers: corsHeaders });

      const title = body.title !== undefined ? String(body.title).trim().substring(0, 150) : existing.title;
      const urlVal = body.url !== undefined ? body.url : existing.url;
      const description = body.description !== undefined ? String(body.description).trim().substring(0, 500) : existing.description;
      const categoryId = body.categoryId !== undefined ? body.categoryId : existing.categoryId;
      const icon = body.icon !== undefined ? body.icon : existing.icon;
      const tags = body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 10) : []) : existing.tags;
      const isPinned = body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.isPinned;

      await env.DB!.prepare(`
        UPDATE bookmarks SET title = ?, url = ?, description = ?, categoryId = ?, icon = ?, tags = ?, isPinned = ? WHERE id = ?
      `).bind(title, urlVal, description, categoryId, icon, tags, isPinned, bmId).run();

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (bmItemMatch && method === "DELETE") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const bmId = bmItemMatch[1];
      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      await env.DB!.prepare("DELETE FROM bookmarks WHERE id = ?").bind(bmId).run();
      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (path === "/api/bookmarks/reorder" && method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });
      const body: any = await request.json().catch(() => ({}));
      const { orderedIds } = body;
      if (Array.isArray(orderedIds) && orderedIds.length > 0) {
        const reorderStmts = orderedIds.map((id: string, idx: number) =>
          env.DB!.prepare("UPDATE bookmarks SET sortOrder = ? WHERE id = ?").bind(idx + 1, id)
        );
        await env.DB!.batch(reorderStmts);
        await invalidateCache(env);
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 8. Plugin Capture
    if (path === "/api/plugin/capture" && method === "POST") {
      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      let allowPublic = false;
      try {
        const row = await env.DB!.prepare("SELECT value FROM settings WHERE key = 'allowPublicSubmit'").first<any>();
        if (row && row.value) allowPublic = JSON.parse(row.value);
      } catch {}

      if (!allowPublic) {
        const authErr = await requireAuth(request, env);
        if (authErr) return authErr;
      }

      const body: any = await request.json().catch(() => ({}));
      const { url: capUrl, title, description, categoryId, tags } = body;
      if (!capUrl) return new Response(JSON.stringify({ error: "URL 不能为空" }), { status: 400, headers: corsHeaders });

      let normalizedUrl = capUrl.trim();
      if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
        normalizedUrl = "https://" + normalizedUrl;
      }

      if (!isSafeUrl(normalizedUrl)) {
        return new Response(JSON.stringify({ error: "不合法的网址协议" }), { status: 400, headers: corsHeaders });
      }

      let finalTitle = title ? String(title).trim().substring(0, 150) : "";
      if (!finalTitle) {
        try { finalTitle = new URL(normalizedUrl).hostname; } catch { finalTitle = normalizedUrl.substring(0, 50); }
      }

      let icon = "";
      try {
        const parsed = new URL(normalizedUrl);
        if (isSafeDomain(parsed.hostname)) icon = `/api/icon-proxy?domain=${parsed.hostname}`;
      } catch {}

      const maxRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM bookmarks").first<any>();
      const maxSort = maxRes && typeof maxRes.maxSort === "number" ? maxRes.maxSort : 0;

      let targetCatId = categoryId;
      if (!targetCatId) {
        const firstCat = await env.DB!.prepare("SELECT id FROM categories ORDER BY sortOrder ASC LIMIT 1").first<any>();
        targetCatId = firstCat ? firstCat.id : "cat-1";
      }

      const newBmId = "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
      await env.DB!.prepare(`
        INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newBmId,
        finalTitle,
        normalizedUrl.substring(0, 2000),
        (description || "").trim().substring(0, 500),
        targetCatId,
        icon,
        JSON.stringify(Array.isArray(tags) ? tags.map(t => String(t).trim().substring(0, 25)).slice(0, 10) : ["插件采集"]),
        0,
        maxSort + 1,
        0,
        new Date().toISOString()
      ).run();

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true, id: newBmId }), { headers: corsHeaders });
    }

    // 9. Export (Protected & Sanitized)
    if (path === "/api/export" && method === "GET") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const format = url.searchParams.get("format") || "json";
      const [settingsRes, catsRes, bmsRes] = await Promise.all([
        env.DB!.prepare("SELECT * FROM settings").all(),
        env.DB!.prepare("SELECT * FROM categories ORDER BY sortOrder ASC").all(),
        env.DB!.prepare("SELECT * FROM bookmarks ORDER BY sortOrder ASC").all()
      ]);

      const settingsObj: any = {};
      settingsRes.results?.forEach((row: any) => {
        if (row.key === "adminPasswordHash") return;
        try { settingsObj[row.key] = JSON.parse(row.value); } catch { settingsObj[row.key] = row.value; }
      });
      delete settingsObj.geminiApiKey;
      delete settingsObj.cfApiToken;

      const categories = catsRes.results || [];
      const bookmarks = (bmsRes.results || []).map((b: any) => ({
        ...b,
        tags: typeof b.tags === "string" ? JSON.parse(b.tags) : (b.tags || []),
        isPinned: Boolean(b.isPinned),
      }));

      if (format === "html") {
        let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n`;
        html += `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n`;
        html += `<TITLE>OmniMark Bookmarks Export</TITLE>\n`;
        html += `<H1>Bookmarks</H1>\n`;
        html += `<DL><p>\n`;

        for (const cat of categories) {
          html += `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">${escapeHtml(cat.name)}</H3>\n`;
          html += `    <DL><p>\n`;
          const catBms = bookmarks.filter((b: any) => b.categoryId === cat.id);
          for (const bm of catBms) {
            const addDate = bm.createdAt && !isNaN(Date.parse(bm.createdAt))
              ? Math.floor(new Date(bm.createdAt).getTime() / 1000)
              : Math.floor(Date.now() / 1000);
            html += `        <DT><A HREF="${escapeHtml(bm.url)}" ADD_DATE="${addDate}" ICON="${escapeHtml(bm.icon || '')}">${escapeHtml(bm.title)}</A>\n`;
            if (bm.description) {
              html += `        <DD>${escapeHtml(bm.description)}\n`;
            }
          }
          html += `    </DL><p>\n`;
        }
        html += `</DL><p>\n`;

        return new Response(html, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": 'attachment; filename="bookmarks_export.html"'
          }
        });
      } else {
        const dbExport = { settings: settingsObj, categories, bookmarks };
        return new Response(JSON.stringify(dbExport, null, 2), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": 'attachment; filename="omnimark_backup.json"'
          }
        });
      }
    }

    // 10. Import (Protected & Sanitized)
    if (path === "/api/import" && method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const body: any = await request.json().catch(() => ({}));
      const { type, content, mode = "merge" } = body;

      const IMPORT_SETTINGS_WHITELIST = new Set([
        "siteName", "siteSubtitle", "announcement", "defaultViewMode",
        "enableWeather", "enableSearchEngine", "defaultSearchEngine"
      ]);

      try {
        if (type === "json") {
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          
          if (mode === "replace") {
            // True atomic replace: execute all deletion and insertion statements in a single atomic batch
            const batchStmts: any[] = [
              env.DB!.prepare("DELETE FROM bookmarks"),
              env.DB!.prepare("DELETE FROM categories")
            ];

            if (Array.isArray(parsed.categories)) {
              for (const [idx, c] of parsed.categories.entries()) {
                const catId = c.id || "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
                batchStmts.push(
                  env.DB!.prepare("INSERT INTO categories (id, name, icon, sortOrder, description) VALUES (?, ?, ?, ?, ?)")
                    .bind(catId, String(c.name || "未命名分类").substring(0, 50), String(c.icon || "Folder").substring(0, 30), typeof c.sortOrder === "number" ? c.sortOrder : idx + 1, String(c.description || "").substring(0, 200))
                );
              }
            }

            if (Array.isArray(parsed.bookmarks)) {
              for (const [idx, b] of parsed.bookmarks.entries()) {
                if (b.url && isSafeUrl(b.url)) {
                  const bmId = b.id || "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
                  batchStmts.push(
                    env.DB!.prepare("INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                      .bind(
                        bmId,
                        String(b.title || b.url).substring(0, 150),
                        String(b.url).substring(0, 2000),
                        String(b.description || "").substring(0, 500),
                        b.categoryId || "cat-1",
                        b.icon || "",
                        JSON.stringify(Array.isArray(b.tags) ? b.tags.slice(0, 10) : []),
                        typeof b.clicks === "number" ? b.clicks : 0,
                        typeof b.sortOrder === "number" ? b.sortOrder : idx + 1,
                        b.isPinned ? 1 : 0,
                        b.createdAt || new Date().toISOString()
                      )
                  );
                }
              }
            }

            if (parsed.settings && typeof parsed.settings === "object") {
              for (const [k, v] of Object.entries(parsed.settings)) {
                if (IMPORT_SETTINGS_WHITELIST.has(k) && k !== "__proto__" && k !== "constructor") {
                  batchStmts.push(
                    env.DB!.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(k, JSON.stringify(v))
                  );
                }
              }
            }

            await env.DB!.batch(batchStmts);
          } else {
            // Merge mode: O(1) deduplication
            const existingUrls = new Set<string>();
            try {
              const bRes = await env.DB!.prepare("SELECT url FROM bookmarks").all();
              bRes.results?.forEach((r: any) => { if (r.url) existingUrls.add(r.url); });
            } catch {}

            const existingCats = new Map<string, string>();
            try {
              const cRes = await env.DB!.prepare("SELECT id, name FROM categories").all();
              cRes.results?.forEach((r: any) => { if (r.name) existingCats.set(r.name, r.id); });
            } catch {}

            if (Array.isArray(parsed.categories)) {
              for (const c of parsed.categories) {
                if (!existingCats.has(c.name)) {
                  const maxCatRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM categories").first<any>();
                  const maxSort = maxCatRes && typeof maxCatRes.maxSort === "number" ? maxCatRes.maxSort : 0;
                  const catId = c.id || "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
                  await env.DB!.prepare("INSERT INTO categories (id, name, icon, sortOrder, description) VALUES (?, ?, ?, ?, ?)")
                    .bind(catId, String(c.name || "未命名分类").substring(0, 50), String(c.icon || "Folder").substring(0, 30), maxSort + 1, String(c.description || "").substring(0, 200)).run();
                  existingCats.set(c.name, catId);
                }
              }
            }

            if (Array.isArray(parsed.bookmarks)) {
              for (const b of parsed.bookmarks) {
                if (b.url && isSafeUrl(b.url) && !existingUrls.has(b.url)) {
                  const maxBmRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM bookmarks").first<any>();
                  const maxSort = maxBmRes && typeof maxBmRes.maxSort === "number" ? maxBmRes.maxSort : 0;
                  const bmId = b.id || "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
                  await env.DB!.prepare("INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    .bind(
                      bmId,
                      String(b.title || b.url).substring(0, 150),
                      String(b.url).substring(0, 2000),
                      String(b.description || "").substring(0, 500),
                      b.categoryId || "cat-1",
                      b.icon || "",
                      JSON.stringify(Array.isArray(b.tags) ? b.tags.slice(0, 10) : []),
                      typeof b.clicks === "number" ? b.clicks : 0,
                      maxSort + 1,
                      b.isPinned ? 1 : 0,
                      b.createdAt || new Date().toISOString()
                    ).run();
                  existingUrls.add(b.url);
                }
              }
            }
          }

          await invalidateCache(env);
          return new Response(JSON.stringify({ success: true, message: "JSON 备份数据已成功安全导入" }), { headers: corsHeaders });
        } else if (type === "html") {
          // Parse using Netscape bookmark parser with multiline tag support
          const parsedBookmarks = parseNetscapeBookmarks(String(content));
          let importedCount = 0;

          const existingUrls = new Set<string>();
          try {
            const bRes = await env.DB!.prepare("SELECT url FROM bookmarks").all();
            bRes.results?.forEach((r: any) => { if (r.url) existingUrls.add(r.url); });
          } catch {}

          const existingCats = new Map<string, string>();
          try {
            const cRes = await env.DB!.prepare("SELECT id, name FROM categories").all();
            cRes.results?.forEach((r: any) => { if (r.name) existingCats.set(r.name, r.id); });
          } catch {}

          for (const item of parsedBookmarks) {
            if (!isSafeUrl(item.url) || existingUrls.has(item.url)) continue;

            let catId = existingCats.get(item.categoryName);
            if (!catId) {
              const maxCatRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM categories").first<any>();
              const maxSort = maxCatRes && typeof maxCatRes.maxSort === "number" ? maxCatRes.maxSort : 0;
              catId = "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
              await env.DB!.prepare("INSERT INTO categories (id, name, icon, sortOrder, description) VALUES (?, ?, ?, ?, ?)")
                .bind(catId, item.categoryName, "Folder", maxSort + 1, "从浏览器导入的分类目录").run();
              existingCats.set(item.categoryName, catId);
            }

            const maxBmRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM bookmarks").first<any>();
            const maxSortBm = maxBmRes && typeof maxBmRes.maxSort === "number" ? maxBmRes.maxSort : 0;
            const newBmId = "bm-imp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);

            let favicon = item.icon || "";
            if (!favicon) {
              try {
                const parsed = new URL(item.url);
                if (isSafeDomain(parsed.hostname)) favicon = `/api/icon-proxy?domain=${parsed.hostname}`;
              } catch {}
            }

            await env.DB!.prepare(`
              INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              newBmId,
              item.title.substring(0, 150),
              item.url.substring(0, 2000),
              item.description || "从浏览器书签导入",
              catId,
              favicon,
              JSON.stringify(["浏览器导入"]),
              0,
              maxSortBm + 1,
              0,
              new Date().toISOString()
            ).run();

            existingUrls.add(item.url);
            importedCount++;
          }

          await invalidateCache(env);
          return new Response(JSON.stringify({ success: true, message: `成功解析并安全导入 ${importedCount} 个浏览器书签！` }), { headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ error: "不支持的导入格式类型" }), { status: 400, headers: corsHeaders });
        }
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "导入处理失败: " + err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 11. URL Metadata Preview (SSRF Protected with Manual Redirect Loop)
    if (path === "/api/metadata" && method === "GET") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return new Response(JSON.stringify({ error: "URL 不能为空" }), { status: 400, headers: corsHeaders });

      let normalized = targetUrl.trim();
      if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
        normalized = "https://" + normalized;
      }

      if (!isSafeUrl(normalized)) {
        return new Response(JSON.stringify({ error: "不安全或受限制的目标网址" }), { status: 400, headers: corsHeaders });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        let currentUrl = normalized;
        let response: Response | null = null;

        // Manual redirect validation (max 3 hops)
        for (let hop = 0; hop < 3; hop++) {
          const resp = await fetch(currentUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml"
            },
            signal: controller.signal,
            redirect: "manual"
          });

          if ([301, 302, 303, 307, 308].includes(resp.status)) {
            const location = resp.headers.get("Location");
            if (!location) break;
            const nextUrl = new URL(location, currentUrl).toString();
            if (!isSafeUrl(nextUrl)) {
              return new Response(JSON.stringify({ error: "重定向到不安全或受限制的目标网址" }), { status: 400, headers: corsHeaders });
            }
            currentUrl = nextUrl;
            continue;
          }

          response = resp;
          break;
        }

        if (!response || !response.ok) {
          let hostname = "";
          try { hostname = new URL(normalized).hostname.replace(/^www\./, ""); } catch {}
          return new Response(JSON.stringify({ title: "", description: "", image: "", hostname, url: normalized }), { headers: corsHeaders });
        }

        const reader = response.body?.getReader();
        let receivedLength = 0;
        let chunks: Uint8Array[] = [];
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              receivedLength += value.length;
              if (receivedLength > 512 * 1024) {
                reader.cancel();
                break;
              }
            }
          }
        }
        let html = "";
        if (chunks.length > 0) {
          const allChunks = new Uint8Array(receivedLength);
          let position = 0;
          for (let chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
          }
          html = new TextDecoder().decode(allChunks);
        }

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : "";

        const descMatch = html.match(/<meta\s+(?:name=["']description["']|property=["']og:description["'])\s+content=["']([^"']+)["']/i) ||
                          html.match(/<meta\s+content=["']([^"']+)["']\s+(?:name=["']description["']|property=["']og:description["'])/i);
        const description = descMatch ? descMatch[1].trim() : "";

        const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
        let image = imgMatch ? imgMatch[1].trim() : "";
        if (image && !isSafeUrl(image)) image = "";

        let hostname = "";
        try { hostname = new URL(currentUrl).hostname.replace(/^www\./, ""); } catch {}

        return new Response(JSON.stringify({
          title: title.substring(0, 150),
          description: description.substring(0, 220),
          image,
          hostname,
          url: currentUrl
        }), { headers: corsHeaders });
      } catch (err: any) {
        let hostname = "";
        try { hostname = new URL(normalized).hostname.replace(/^www\./, ""); } catch {}
        return new Response(JSON.stringify({ title: "", description: "无法加载实时预览摘要", image: "", hostname, url: normalized }), { headers: corsHeaders });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 12. Docs Spec
    if (path === "/api/docs-spec" && method === "GET") {
      return new Response(JSON.stringify({
        title: "OmniMark Cloudflare Worker Secure RESTful API",
        version: "2.0.0",
        baseUrl: "/api",
        description: "Enterprise-grade secure Worker API with D1 relational persistence, SHA-256 auth tokens, SSRF defense, and robust access control."
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "API route not found" }), { status: 404, headers: corsHeaders });
  } catch (err: any) {
    console.error("Worker API Error:", err);
    return new Response(JSON.stringify({ error: "服务器内部异常" }), { status: 500, headers: corsHeaders });
  }
}
