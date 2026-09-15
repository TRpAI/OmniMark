/**
 * Cloudflare Worker Backend for OmniMark Navigation & Bookmark System
 * - Cloudflare Pages serves the compiled static frontend UI (dist/)
 * - Cloudflare Workers serves serverless API routes (/api/*)
 * - Cloudflare D1 (env.DB) provides relational data persistence
 * - Cloudflare KV (env.CACHE_KV) provides edge caching acceleration
 */

declare global {
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    exec(query: string): Promise<any>;
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

// SHA-256 password hashing via Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
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
        expiresAt TEXT
      )
    `).run();

    // Seed default settings if empty
    const adminPass = await db.prepare("SELECT value FROM settings WHERE key = 'adminPasswordHash'").first<any>();
    if (!adminPass) {
      const defaultHash = await hashPassword("admin123");
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('adminPasswordHash', ?)").bind(JSON.stringify(defaultHash)).run();
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

// Authentication middleware verifying stored admin sessions
async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  const authHeader = request.headers.get("Authorization");
  const tokenFromHeader = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get("token");
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) {
    return new Response(JSON.stringify({ error: "未授权：请先登录管理员账户以执行该操作" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (env.DB) {
    try {
      const session = await env.DB.prepare("SELECT * FROM admin_sessions WHERE token = ?").bind(token).first<any>();
      if (!session) {
        return new Response(JSON.stringify({ error: "授权令牌无效或已过期，请重新登录" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: "鉴权校验异常" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
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

// SSRF Safe Domain & URL Validator
function isSafeDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string" || domain.length > 253) return false;
  const lower = domain.toLowerCase().trim();

  const forbiddenHosts = [
    "localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "::1",
    "metadata.google.internal", "instance-data", "kubernetes.default"
  ];
  if (forbiddenHosts.includes(lower)) return false;

  if (
    /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|169\.254\.|100\.(6[4-9]|[7-9][0-9]|1[0-2][0-9])\.)/.test(lower)
  ) {
    return false;
  }

  if (lower.endsWith(".local") || lower.endsWith(".internal") || lower.endsWith(".arpa") || lower.endsWith(".lan") || lower.endsWith(".localhost")) {
    return false;
  }

  if (lower.startsWith("[") && lower.endsWith("]")) {
    const unbracketed = lower.slice(1, -1);
    if (unbracketed === "::1" || unbracketed.startsWith("fc") || unbracketed.startsWith("fd") || unbracketed.startsWith("fe80")) {
      return false;
    }
  }

  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(lower);
}

function isSafeUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim().toLowerCase();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;
  try {
    const parsed = new URL(trimmed);
    return isSafeDomain(parsed.hostname);
  } catch {
    return false;
  }
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

      const hashedInput = await hashPassword(password || "");
      if (hashedInput === storedHash) {
        clearLoginFailures(clientIp);
        const token = "omni-admin-token-" + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, "0")).join("");
        const expiresAt = new Date(Date.now() + 86400000 * 7).toISOString();
        if (d1Bound) {
          try {
            await env.DB!.prepare("INSERT OR REPLACE INTO admin_sessions (token, expiresAt) VALUES (?, ?)").bind(token, expiresAt).run();
          } catch {}
        }
        return new Response(JSON.stringify({ success: true, token }), { headers: corsHeaders });
      }

      recordLoginFailure(clientIp);
      return new Response(JSON.stringify({ success: false, error: "管理员密码错误，请重新输入" }), { status: 401, headers: corsHeaders });
    }

    // 4. Get Public Settings
    if (path === "/api/settings" && method === "GET") {
      let settingsObj: any = {
        siteName: "OmniMark 站点导航",
        siteSubtitle: "极简优雅的前后端分离导航与书签系统",
        defaultViewMode: "grid",
        enableWeather: true,
        enableSearchEngine: true,
        defaultSearchEngine: "baidu"
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
      return new Response(JSON.stringify(settingsObj), { headers: corsHeaders });
    }

    // 5. Update Settings (PUT /api/settings) - Protected & Whitelisted
    if (path === "/api/settings" && method === "PUT") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const body: any = await request.json().catch(() => ({}));
      const { currentPassword, newPassword, ...rest } = body;

      if (newPassword) {
        let storedHash = "";
        const row = await env.DB!.prepare("SELECT value FROM settings WHERE key = 'adminPasswordHash'").first<any>();
        if (row && row.value) {
          try { storedHash = JSON.parse(row.value); } catch { storedHash = row.value; }
        }

        const hashedCurrent = await hashPassword(currentPassword || "");
        if (hashedCurrent !== storedHash) {
          return new Response(JSON.stringify({ error: "当前管理员密码不正确" }), { status: 401, headers: corsHeaders });
        }
        if (typeof newPassword !== "string" || newPassword.length < 6) {
          return new Response(JSON.stringify({ error: "新密码长度不能少于 6 位" }), { status: 400, headers: corsHeaders });
        }
        const newHash = await hashPassword(newPassword);
        await env.DB!.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('adminPasswordHash', ?)").bind(JSON.stringify(newHash)).run();
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

    if (path.startsWith("/api/categories/") && method === "PUT") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const catId = path.replace("/api/categories/", "");
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

    if (path.startsWith("/api/categories/") && method === "DELETE") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const catId = path.replace("/api/categories/", "");
      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      const allCats = await env.DB!.prepare("SELECT * FROM categories ORDER BY sortOrder ASC").all();
      const categories = allCats.results || [];
      if (categories.length <= 1) {
        return new Response(JSON.stringify({ error: "至少需要保留一个分类" }), { status: 400, headers: corsHeaders });
      }

      const fallbackCat = categories.find((c: any) => c.id !== catId);
      const fallbackCatId = fallbackCat ? fallbackCat.id : "cat-1";

      await env.DB!.prepare("DELETE FROM categories WHERE id = ?").bind(catId).run();
      await env.DB!.prepare("UPDATE bookmarks SET categoryId = ? WHERE categoryId = ?").bind(fallbackCatId, catId).run();

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (path === "/api/categories/reorder" && method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });
      const body: any = await request.json().catch(() => ({}));
      const { orderedIds } = body;
      if (Array.isArray(orderedIds)) {
        for (let i = 0; i < orderedIds.length; i++) {
          await env.DB!.prepare("UPDATE categories SET sortOrder = ? WHERE id = ?").bind(i + 1, orderedIds[i]).run();
        }
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

    if (path.startsWith("/api/bookmarks/") && method === "PUT") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const bmId = path.replace("/api/bookmarks/", "");
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
      const tags = body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags;
      const isPinned = body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.isPinned;

      await env.DB!.prepare(`
        UPDATE bookmarks SET title = ?, url = ?, description = ?, categoryId = ?, icon = ?, tags = ?, isPinned = ? WHERE id = ?
      `).bind(title, urlVal, description, categoryId, icon, tags, isPinned, bmId).run();

      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (path.startsWith("/api/bookmarks/") && method === "DELETE") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      const bmId = path.replace("/api/bookmarks/", "");
      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });

      await env.DB!.prepare("DELETE FROM bookmarks WHERE id = ?").bind(bmId).run();
      await invalidateCache(env);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (path.includes("/click") && method === "POST") {
      const bmId = path.replace("/api/bookmarks/", "").replace("/click", "");
      if (d1Bound) {
        await env.DB!.prepare("UPDATE bookmarks SET clicks = clicks + 1 WHERE id = ?").bind(bmId).run();
        await invalidateCache(env);
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (path === "/api/bookmarks/reorder" && method === "POST") {
      const authErr = await requireAuth(request, env);
      if (authErr) return authErr;

      if (!d1Bound) return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });
      const body: any = await request.json().catch(() => ({}));
      const { orderedIds } = body;
      if (Array.isArray(orderedIds)) {
        for (let i = 0; i < orderedIds.length; i++) {
          await env.DB!.prepare("UPDATE bookmarks SET sortOrder = ? WHERE id = ?").bind(i + 1, orderedIds[i]).run();
        }
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
            html += `        <DT><A HREF="${escapeHtml(bm.url)}" ADD_DATE="${Math.floor(Date.now() / 1000)}" ICON="${escapeHtml(bm.icon || '')}">${escapeHtml(bm.title)}</A>\n`;
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

      try {
        if (type === "json") {
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          if (parsed.settings) {
            delete parsed.settings.adminPasswordHash;
            for (const [k, v] of Object.entries(parsed.settings)) {
              await env.DB!.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(k, JSON.stringify(v)).run();
            }
          }
          if (Array.isArray(parsed.categories)) {
            for (const c of parsed.categories) {
              await env.DB!.prepare("INSERT OR REPLACE INTO categories (id, name, icon, sortOrder, description) VALUES (?, ?, ?, ?, ?)")
                .bind(c.id, c.name, c.icon || "Folder", c.sortOrder || 99, c.description || "").run();
            }
          }
          if (Array.isArray(parsed.bookmarks)) {
            for (const b of parsed.bookmarks) {
              if (b.url && isSafeUrl(b.url)) {
                if (mode === "replace") {
                  await env.DB!.prepare("INSERT OR REPLACE INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                    .bind(b.id, b.title, b.url, b.description || "", b.categoryId || "cat-1", b.icon || "", JSON.stringify(b.tags || []), b.clicks || 0, b.sortOrder || 99, b.isPinned ? 1 : 0, b.createdAt || new Date().toISOString()).run();
                } else {
                  const existing = await env.DB!.prepare("SELECT id FROM bookmarks WHERE url = ?").bind(b.url).first<any>();
                  if (!existing) {
                    await env.DB!.prepare("INSERT OR REPLACE INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                      .bind(b.id || "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6), b.title, b.url, b.description || "", b.categoryId || "cat-1", b.icon || "", JSON.stringify(b.tags || []), b.clicks || 0, b.sortOrder || 99, b.isPinned ? 1 : 0, b.createdAt || new Date().toISOString()).run();
                  }
                }
              }
            }
          }
          await invalidateCache(env);
          return new Response(JSON.stringify({ success: true, message: "JSON 备份数据已成功导入" }), { headers: corsHeaders });
        } else if (type === "html") {
          let importedCount = 0;
          let currentFolder = "浏览器导入";
          const lines = String(content).split(/\r?\n/);

          for (const line of lines) {
            const folderMatch = /<H3[^>]*>(.*?)<\/H3>/i.exec(line);
            if (folderMatch && folderMatch[1]) {
              const folderName = folderMatch[1].replace(/<[^>]*>/g, "").trim();
              if (folderName && folderName !== "Bookmarks" && folderName !== "书签栏") {
                currentFolder = folderName.substring(0, 50);
              }
            }

            const linkMatch = /<A\s+[^>]*?HREF=["']([^"']*)["'][^>]*>(.*?)<\/A>/i.exec(line);
            if (linkMatch && linkMatch[1]) {
              const url = linkMatch[1].trim();
              const rawTitle = linkMatch[2] ? linkMatch[2].replace(/<[^>]*>/g, "").trim() : "";
              const title = rawTitle || url;

              if (isSafeUrl(url)) {
                const existingBm = await env.DB!.prepare("SELECT id FROM bookmarks WHERE url = ?").bind(url).first<any>();
                if (!existingBm) {
                  let targetCat = await env.DB!.prepare("SELECT * FROM categories WHERE name = ?").bind(currentFolder).first<any>();
                  if (!targetCat) {
                    const maxCatRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM categories").first<any>();
                    const maxSortCat = maxCatRes && typeof maxCatRes.maxSort === "number" ? maxCatRes.maxSort : 0;
                    const newCatId = "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
                    await env.DB!.prepare("INSERT INTO categories (id, name, icon, sortOrder, description) VALUES (?, ?, ?, ?, ?)")
                      .bind(newCatId, currentFolder, "Folder", maxSortCat + 1, "从浏览器导入的分类目录").run();
                    targetCat = { id: newCatId };
                  }

                  const maxBmRes = await env.DB!.prepare("SELECT MAX(sortOrder) as maxSort FROM bookmarks").first<any>();
                  const maxSortBm = maxBmRes && typeof maxBmRes.maxSort === "number" ? maxBmRes.maxSort : 0;

                  const newBmId = "bm-imp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
                  let favicon = "";
                  try {
                    const parsed = new URL(url);
                    if (isSafeDomain(parsed.hostname)) favicon = `/api/icon-proxy?domain=${parsed.hostname}`;
                  } catch {}

                  await env.DB!.prepare(`
                    INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `).bind(
                    newBmId,
                    title.substring(0, 150),
                    url.substring(0, 2000),
                    "从浏览器书签导入",
                    targetCat.id,
                    favicon,
                    JSON.stringify(["浏览器导入"]),
                    0,
                    maxSortBm + 1,
                    0,
                    new Date().toISOString()
                  ).run();
                  importedCount++;
                }
              }
            }
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

    // 11. URL Metadata Preview (SSRF Protected)
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
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(normalized, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml"
          },
          signal: controller.signal,
          redirect: "error"
        });

        if (!response.ok) {
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
        try { hostname = new URL(normalized).hostname.replace(/^www\./, ""); } catch {}

        return new Response(JSON.stringify({
          title: title.substring(0, 150),
          description: description.substring(0, 220),
          image,
          hostname,
          url: normalized
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
