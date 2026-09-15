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

    // Handle API routes
    if (path.startsWith("/api/")) {
      return handleApiRequest(request, env, ctx);
    }

    // For non-API routes, let Cloudflare Pages static asset routing handle requests
    return new Response("OmniMark Cloudflare Pages & Workers Routing Active", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};

// Robust validation to ensure D1 and KV are real bindings and not RPC stubs or ASSETS fetchers
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

// Initial database schema bootstrap for Cloudflare D1
async function ensureTables(db: D1Database) {
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
  } catch (e) {
    console.error("D1 ensureTables error:", e);
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
  };

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 深度智能扫描 env 对象：严格鉴别真实 D1 数据库与 KV，排除 ASSETS RPC 代理和 Service Stubs
  let activeD1 = isRealD1(env?.DB) ? env.DB : (isRealD1(env?.db) ? env.db : (isRealD1(env?.D1) ? env.D1 : (isRealD1(env?.DATABASE) ? env.DATABASE : null)));
  let activeKV = isRealKV(env?.CACHE_KV) ? env.CACHE_KV : (isRealKV(env?.KV) ? env.KV : (isRealKV(env?.cache_kv) ? env.cache_kv : (isRealKV(env?.kv) ? env.kv : null)));

  if (env && typeof env === "object") {
    for (const [key, val] of Object.entries(env)) {
      if (key === "ASSETS" || key === "CF_PAGES" || key === "__STATIC_CONTENT") continue;
      if (!activeD1 && isRealD1(val)) {
        activeD1 = val;
      }
      if (!activeKV && isRealKV(val)) {
        activeKV = val;
      }
    }
  }

  const d1Bound = Boolean(activeD1);
  const kvBound = Boolean(activeKV);

  // Normalize to env.DB and env.CACHE_KV so all downstream operations work transparently
  if (d1Bound) {
    env.DB = activeD1;
  }
  if (kvBound) {
    env.CACHE_KV = activeKV;
  }

  // Warnings for unconfigured D1 and KV
  const warnings: string[] = [];
  if (!d1Bound) {
    warnings.push("Cloudflare D1 数据库未绑定：无需修改 wrangler.toml，请在「管理后台 -> 系统设置与密钥」中填入 D1 Database UUID 并保存，并在 Cloudflare Pages/Workers 控制台「设置 -> 函数/绑定」中添加 D1 绑定（变量名称: DB）。");
  }
  if (!kvBound) {
    warnings.push("Cloudflare KV 命名空间未绑定：无需修改 wrangler.toml，请在「管理后台 -> 系统设置与密钥」中填入 KV Namespace ID 并保存，并在 Cloudflare 控制台添加 KV 绑定（变量名称: CACHE_KV）。");
  }

  // Cloudflare Free Tier Specifications
  const quotas = {
    workers: {
      name: "Cloudflare Workers",
      badge: "免费版 Free",
      dailyRequests: "100,000 次/天",
      cpuTime: "10ms CPU执行时间/请求",
      concurrency: "1,000 请求并发",
      notes: "全球 330+ 边缘节点无服务器轻量计算"
    },
    d1: {
      name: "Cloudflare D1 SQL 数据库",
      badge: "免费版 Free",
      dailyReadRows: "5,000,000 行/天",
      dailyWriteRows: "100,000 行/天",
      storage: "5 GB 分布式 SQLite 存储空间",
      maxDatabases: "10 个 D1 数据库实例",
      notes: "边缘分布式关系型数据库，零冷启动延迟"
    },
    kv: {
      name: "Cloudflare KV 边缘键值缓存",
      badge: "免费版 Free",
      dailyReads: "100,000 次/天",
      dailyWrites: "1,000 次/天",
      dailyDeletes: "1,000 次/天",
      storage: "1 GB 高并发边缘只读缓存",
      notes: "毫秒级全局响应，大幅削减 D1 数据库读取压力"
    },
    pages: {
      name: "Cloudflare Pages",
      badge: "免费版 Free",
      requests: "无限制 (Unlimited)",
      bandwidth: "无限制带宽流量",
      builds: "500 次构建/月",
      ssl: "全自动免费 SSL / TLS 证书与 Anycast CDN",
      notes: "托管 React/Vite 编译前端静态资源，全球极速分发"
    }
  };

  try {
    if (d1Bound) {
      await ensureTables(env.DB);
    }

    // 1. Health & System Status with explicit D1/KV check & free quotas
    if (path === "/api/health" || path === "/api/system/status") {
      return new Response(JSON.stringify({
        status: "ok",
        runtime: "cloudflare-workers",
        environment: env.ENVIRONMENT || "production",
        d1Bound,
        kvBound,
        warnings,
        quotas,
        timestamp: new Date().toISOString()
      }), { headers: corsHeaders });
    }

    // Cache invalidation helper
    const invalidateCache = async () => {
      if (kvBound) {
        ctx.waitUntil(env.CACHE_KV.delete("omnimark:api:data"));
      }
    };

    // 2. Main Data API (GET /api/data)
    if (path === "/api/data" && method === "GET") {
      const cacheKey = "omnimark:api:data";
      if (kvBound) {
        const cached = await env.CACHE_KV.get(cacheKey);
        if (cached) {
          return new Response(cached, {
            headers: { 
              ...corsHeaders, 
              "X-Cache": "HIT",
              "X-D1-Bound": d1Bound ? "true" : "false",
              "X-KV-Bound": "true" 
            },
          });
        }
      }

      let categories: any[] = [];
      let bookmarks: any[] = [];
      let settingsObj: any = {
        siteName: "OmniMark 站点导航",
        siteSubtitle: "极简优雅的前后端分离导航与书签系统",
        defaultViewMode: "grid",
        enableWeather: true,
        enableSearchEngine: true,
        defaultSearchEngine: "baidu",
        adminPasswordHash: "admin123"
      };

      if (d1Bound) {
        const [settingsRes, catsRes, bmsRes] = await Promise.all([
          env.DB.prepare("SELECT * FROM settings").all(),
          env.DB.prepare("SELECT * FROM categories ORDER BY sortOrder ASC").all(),
          env.DB.prepare("SELECT * FROM bookmarks ORDER BY sortOrder ASC").all()
        ]);

        settingsRes.results?.forEach((row: any) => {
          try {
            settingsObj[row.key] = JSON.parse(row.value);
          } catch {
            settingsObj[row.key] = row.value;
          }
        });

        categories = catsRes.results || [];
        bookmarks = (bmsRes.results || []).map((b: any) => ({
          ...b,
          tags: typeof b.tags === "string" ? JSON.parse(b.tags) : (b.tags || []),
          isPinned: Boolean(b.isPinned),
        }));
      }

      // Safe settings (exclude internal password hash)
      const { adminPasswordHash, ...safeSettings } = settingsObj;

      const payload = JSON.stringify({
        settings: safeSettings,
        categories,
        bookmarks,
        d1Bound,
        kvBound,
        warnings: warnings.length > 0 ? warnings : undefined
      });

      if (kvBound) {
        ctx.waitUntil(env.CACHE_KV.put(cacheKey, payload, { expirationTtl: 120 }));
      }

      return new Response(payload, {
        headers: { 
          ...corsHeaders, 
          "X-Cache": "MISS",
          "X-D1-Bound": d1Bound ? "true" : "false",
          "X-KV-Bound": kvBound ? "true" : "false" 
        },
      });
    }

    // 3. Admin Auth Login (POST /api/auth/login)
    if (path === "/api/auth/login" && method === "POST") {
      const body: any = await request.json().catch(() => ({}));
      const { password } = body;

      let storedPass = "admin123";
      if (d1Bound) {
        const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'adminPasswordHash'").first<any>();
        if (row && row.value) {
          try {
            storedPass = JSON.parse(row.value);
          } catch {
            storedPass = row.value;
          }
        }
      }

      if (password && password === storedPass) {
        const token = "cf_auth_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
        return new Response(JSON.stringify({ success: true, token }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: false, error: "密码错误，请重新输入" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // 4. Settings Update (PUT /api/settings)
    if (path === "/api/settings" && method === "PUT") {
      const body: any = await request.json().catch(() => ({}));
      const { currentPassword, newPassword, ...rest } = body;

      if (!d1Bound) {
        return new Response(JSON.stringify({ 
          error: "Cloudflare D1 数据库未绑定 (env.DB 缺失)，无法持久化保存系统配置。请先在控制台绑定 D1 数据库。" 
        }), { status: 500, headers: corsHeaders });
      }

      // Check password change if requested
      if (newPassword) {
        let storedPass = "admin123";
        const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'adminPasswordHash'").first<any>();
        if (row && row.value) {
          try {
            storedPass = JSON.parse(row.value);
          } catch {
            storedPass = row.value;
          }
        }

        if (currentPassword !== storedPass) {
          return new Response(JSON.stringify({ error: "当前管理员密码不正确" }), { status: 401, headers: corsHeaders });
        }
        if (typeof newPassword !== "string" || newPassword.length < 6) {
          return new Response(JSON.stringify({ error: "新密码长度不能少于 6 位" }), { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('adminPasswordHash', ?)").bind(JSON.stringify(newPassword)).run();
      }

      // Update remaining settings keys
      for (const [k, v] of Object.entries(rest)) {
        await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(k, JSON.stringify(v)).run();
      }

      await invalidateCache();
      return new Response(JSON.stringify({ success: true, message: "系统配置已保存" }), { headers: corsHeaders });
    }

    // 5. Bookmarks CRUD
    if (path === "/api/bookmarks" && method === "POST") {
      if (!d1Bound) {
        return new Response(JSON.stringify({ error: "Cloudflare D1 数据库未绑定 (env.DB 缺失)，无法添加书签。" }), { status: 500, headers: corsHeaders });
      }
      const bm: any = await request.json().catch(() => ({}));
      const id = "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
      const createdAt = new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        bm.title || "未命名书签",
        bm.url,
        bm.description || "",
        bm.categoryId || "default",
        bm.icon || "",
        JSON.stringify(bm.tags || []),
        0,
        bm.sortOrder || 9999,
        bm.isPinned ? 1 : 0,
        createdAt
      ).run();

      await invalidateCache();
      return new Response(JSON.stringify({ success: true, id }), { headers: corsHeaders });
    }

    // Bookmarks reorder
    if (path === "/api/bookmarks/reorder" && method === "POST") {
      if (d1Bound) {
        const body: any = await request.json().catch(() => ({}));
        const { orderedIds } = body;
        if (Array.isArray(orderedIds)) {
          for (let i = 0; i < orderedIds.length; i++) {
            await env.DB.prepare("UPDATE bookmarks SET sortOrder = ? WHERE id = ?").bind(i + 1, orderedIds[i]).run();
          }
          await invalidateCache();
        }
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // Single bookmark: PUT or DELETE or click
    if (path.startsWith("/api/bookmarks/")) {
      const sub = path.replace("/api/bookmarks/", "");
      const isClick = sub.endsWith("/click");
      const id = isClick ? sub.replace("/click", "") : sub;

      if (isClick && method === "POST") {
        if (d1Bound) {
          await env.DB.prepare("UPDATE bookmarks SET clicks = clicks + 1 WHERE id = ?").bind(id).run();
          await invalidateCache();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (method === "PUT") {
        if (!d1Bound) return new Response(JSON.stringify({ error: "D1 未绑定" }), { status: 500, headers: corsHeaders });
        const update: any = await request.json().catch(() => ({}));
        
        // Dynamic update fields
        const fields: string[] = [];
        const values: any[] = [];
        if (update.title !== undefined) { fields.push("title = ?"); values.push(update.title); }
        if (update.url !== undefined) { fields.push("url = ?"); values.push(update.url); }
        if (update.description !== undefined) { fields.push("description = ?"); values.push(update.description); }
        if (update.categoryId !== undefined) { fields.push("categoryId = ?"); values.push(update.categoryId); }
        if (update.icon !== undefined) { fields.push("icon = ?"); values.push(update.icon); }
        if (update.tags !== undefined) { fields.push("tags = ?"); values.push(JSON.stringify(update.tags)); }
        if (update.isPinned !== undefined) { fields.push("isPinned = ?"); values.push(update.isPinned ? 1 : 0); }
        if (update.sortOrder !== undefined) { fields.push("sortOrder = ?"); values.push(update.sortOrder); }

        if (fields.length > 0) {
          values.push(id);
          await env.DB.prepare(`UPDATE bookmarks SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
          await invalidateCache();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (method === "DELETE") {
        if (d1Bound) {
          await env.DB.prepare("DELETE FROM bookmarks WHERE id = ?").bind(id).run();
          await invalidateCache();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
    }

    // 6. Categories CRUD
    if (path === "/api/categories" && method === "POST") {
      if (!d1Bound) return new Response(JSON.stringify({ error: "D1 未绑定" }), { status: 500, headers: corsHeaders });
      const cat: any = await request.json().catch(() => ({}));
      const id = "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);

      await env.DB.prepare(`
        INSERT INTO categories (id, name, icon, sortOrder, description)
        VALUES (?, ?, ?, ?, ?)
      `).bind(id, cat.name, cat.icon || "Folder", cat.sortOrder || 99, cat.description || "").run();

      await invalidateCache();
      return new Response(JSON.stringify({ success: true, id }), { headers: corsHeaders });
    }

    if (path === "/api/categories/reorder" && method === "POST") {
      if (d1Bound) {
        const body: any = await request.json().catch(() => ({}));
        const { orderedIds } = body;
        if (Array.isArray(orderedIds)) {
          for (let i = 0; i < orderedIds.length; i++) {
            await env.DB.prepare("UPDATE categories SET sortOrder = ? WHERE id = ?").bind(i + 1, orderedIds[i]).run();
          }
          await invalidateCache();
        }
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (path.startsWith("/api/categories/")) {
      const id = path.replace("/api/categories/", "");
      if (method === "PUT") {
        if (!d1Bound) return new Response(JSON.stringify({ error: "D1 未绑定" }), { status: 500, headers: corsHeaders });
        const cat: any = await request.json().catch(() => ({}));
        await env.DB.prepare(`
          UPDATE categories SET name = ?, icon = ?, description = ? WHERE id = ?
        `).bind(cat.name, cat.icon || "Folder", cat.description || "", id).run();
        await invalidateCache();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
      if (method === "DELETE") {
        if (d1Bound) {
          await env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
          await invalidateCache();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
    }

    // 7. Metadata Proxy for URL Preview with KV Cache
    if (path === "/api/metadata" && method === "GET") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return new Response(JSON.stringify({ error: "URL 不能为空" }), { status: 400, headers: corsHeaders });

      let normalized = targetUrl.trim();
      if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
        normalized = "https://" + normalized;
      }

      const kvCacheKey = `omnimark:meta:${normalized}`;
      if (kvBound) {
        const cachedMeta = await env.CACHE_KV.get(kvCacheKey);
        if (cachedMeta) {
          return new Response(cachedMeta, { headers: { ...corsHeaders, "X-Cache": "HIT" } });
        }
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(normalized, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml"
          },
          signal: controller.signal,
          redirect: "follow"
        });
        clearTimeout(timeoutId);

        let hostname = "";
        try {
          hostname = new URL(normalized).hostname.replace(/^www\./, "");
        } catch {}

        if (!response.ok) {
          const fallback = JSON.stringify({ title: "", description: "", image: "", hostname, url: normalized });
          return new Response(fallback, { headers: corsHeaders });
        }

        const html = await response.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : "";

        const descMatch = html.match(/<meta\s+(?:name=["']description["']|property=["']og:description["'])\s+content=["']([^"']+)["']/i) ||
                          html.match(/<meta\s+content=["']([^"']+)["']\s+(?:name=["']description["']|property=["']og:description["'])/i);
        const description = descMatch ? descMatch[1].trim() : "";

        const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
        const image = imgMatch ? imgMatch[1].trim() : "";

        const metaResult = JSON.stringify({
          title,
          description: description.substring(0, 220),
          image,
          hostname,
          url: normalized
        });

        if (kvBound) {
          ctx.waitUntil(env.CACHE_KV.put(kvCacheKey, metaResult, { expirationTtl: 86400 }));
        }

        return new Response(metaResult, { headers: { ...corsHeaders, "X-Cache": "MISS" } });
      } catch (err: any) {
        let hostname = "";
        try {
          hostname = new URL(normalized).hostname.replace(/^www\./, "");
        } catch {}
        return new Response(JSON.stringify({ title: "", description: "无法加载实时预览摘要", image: "", hostname, url: normalized }), { headers: corsHeaders });
      }
    }

    // 8. Favicon Proxy
    if (path === "/api/icon-proxy" && method === "GET") {
      const domain = url.searchParams.get("domain") || "example.com";
      const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
      return Response.redirect(googleFaviconUrl, 302);
    }

    // 9. Plugin Capture (POST /api/plugin/capture)
    if (path === "/api/plugin/capture" && method === "POST") {
      const body: any = await request.json().catch(() => ({}));
      const { url: targetUrl, title, description, categoryId, tags } = body;
      if (!targetUrl) return new Response(JSON.stringify({ error: "URL 不能为空" }), { status: 400, headers: corsHeaders });

      let normalizedUrl = String(targetUrl).trim();
      if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
        normalizedUrl = "https://" + normalizedUrl;
      }

      let finalTitle = title ? String(title).trim().substring(0, 150) : "";
      if (!finalTitle) {
        try {
          finalTitle = new URL(normalizedUrl).hostname;
        } catch {
          finalTitle = normalizedUrl.substring(0, 50);
        }
      }

      const id = "bm-cap-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
      let hostname = "example.com";
      try { hostname = new URL(normalizedUrl).hostname; } catch {}
      const icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
      const createdAt = new Date().toISOString();

      let targetCatId = categoryId || "default";
      if (d1Bound) {
        try {
          const cats = await env.DB.prepare("SELECT id FROM categories ORDER BY sortOrder ASC LIMIT 1").all();
          if (cats.results && cats.results.length > 0) {
            targetCatId = (cats.results[0] as any).id;
          }
          await env.DB.prepare(`
            INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 9999, 0, ?)
          `).bind(id, finalTitle, normalizedUrl, description || "", targetCatId, icon, JSON.stringify(tags || ["插件采集"]), createdAt).run();
          await invalidateCache();
        } catch (e) {}
      }

      return new Response(JSON.stringify({ success: true, bookmark: { id, title: finalTitle, url: normalizedUrl } }), { headers: corsHeaders });
    }

    // 10. Export Bookmarks (GET /api/export)
    if (path === "/api/export" && method === "GET") {
      const format = url.searchParams.get("format") || "json";
      let categories: any[] = [];
      let bookmarks: any[] = [];
      let settingsObj: any = {};

      if (d1Bound) {
        try {
          const [catsRes, bmsRes, settingsRes] = await Promise.all([
            env.DB.prepare("SELECT * FROM categories ORDER BY sortOrder ASC").all(),
            env.DB.prepare("SELECT * FROM bookmarks ORDER BY sortOrder ASC").all(),
            env.DB.prepare("SELECT * FROM settings").all()
          ]);
          categories = catsRes.results || [];
          bookmarks = bmsRes.results || [];
          settingsRes.results?.forEach((r: any) => {
            try { settingsObj[r.key] = JSON.parse(r.value); } catch { settingsObj[r.key] = r.value; }
          });
        } catch (e) {}
      }

      if (format === "html") {
        let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n`;
        html += `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n`;
        html += `<TITLE>OmniMark Bookmarks Export</TITLE>\n`;
        html += `<H1>Bookmarks</H1>\n`;
        html += `<DL><p>\n`;

        for (const cat of categories) {
          html += `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">${cat.name}</H3>\n`;
          html += `    <DL><p>\n`;
          const catBms = bookmarks.filter((b: any) => b.categoryId === cat.id);
          for (const bm of catBms) {
            html += `        <DT><A HREF="${bm.url}" ADD_DATE="${Math.floor(Date.now() / 1000)}" ICON="${bm.icon || ''}">${bm.title}</A>\n`;
            if (bm.description) {
              html += `        <DD>${bm.description}\n`;
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
        const backupData = { categories, bookmarks, settings: settingsObj };
        return new Response(JSON.stringify(backupData, null, 2), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": 'attachment; filename="omnimark_backup.json"'
          }
        });
      }
    }

    // 11. Import Bookmarks (POST /api/import)
    if (path === "/api/import" && method === "POST") {
      const body: any = await request.json().catch(() => ({}));
      const { type, content, mode = "merge" } = body;

      if (!d1Bound) {
        return new Response(JSON.stringify({ error: "Cloudflare D1 数据库未绑定，无法执行导入。" }), { status: 500, headers: corsHeaders });
      }

      try {
        if (type === "json") {
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          if (parsed.categories && Array.isArray(parsed.categories)) {
            for (const c of parsed.categories) {
              await env.DB.prepare(`
                INSERT OR REPLACE INTO categories (id, name, icon, sortOrder, description)
                VALUES (?, ?, ?, ?, ?)
              `).bind(c.id || "cat-" + Date.now(), c.name || "导入分类", c.icon || "Folder", c.sortOrder || 99, c.description || "").run();
            }
          }
          if (parsed.bookmarks && Array.isArray(parsed.bookmarks)) {
            for (const b of parsed.bookmarks) {
              await env.DB.prepare(`
                INSERT OR REPLACE INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                b.id || "bm-" + Date.now(),
                b.title || "未命名",
                b.url || "https://example.com",
                b.description || "",
                b.categoryId || "default",
                b.icon || "",
                JSON.stringify(b.tags || []),
                b.clicks || 0,
                b.sortOrder || 99,
                b.isPinned ? 1 : 0,
                b.createdAt || new Date().toISOString()
              ).run();
            }
          }
          await invalidateCache();
          return new Response(JSON.stringify({ success: true, message: "JSON 备份数据已成功导入并同步至 D1 数据库！" }), { headers: corsHeaders });
        } else if (type === "html") {
          let importedCount = 0;
          let currentFolder = "浏览器导入";

          const lines = String(content).split(/\r?\n/);
          for (const line of lines) {
            const folderMatch = /<H3[^>]*>(.*?)<\/H3>/i.exec(line);
            if (folderMatch && folderMatch[1]) {
              const folderName = folderMatch[1].trim();
              if (folderName && folderName !== "Bookmarks" && folderName !== "书签栏") {
                currentFolder = folderName.substring(0, 50);
              }
            }

            const linkMatch = /<A\s+[^>]*?HREF=["']([^"']*)["'][^>]*>(.*?)<\/A>/i.exec(line);
            if (linkMatch && linkMatch[1]) {
              const urlStr = linkMatch[1].trim();
              const rawTitle = linkMatch[2] ? linkMatch[2].replace(/<[^>]*>/g, "").trim() : "";
              const title = rawTitle || urlStr;

              if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
                let catId = "cat-imp-" + currentFolder.toLowerCase().replace(/[^a-z0-9]/g, "");
                await env.DB.prepare(`
                  INSERT OR IGNORE INTO categories (id, name, icon, sortOrder, description)
                  VALUES (?, ?, 'Folder', 50, '从浏览器导入的分类')
                `).bind(catId, currentFolder).run();

                const bmId = "bm-html-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
                let hostname = "example.com";
                try { hostname = new URL(urlStr).hostname; } catch {}
                const icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
                
                await env.DB.prepare(`
                  INSERT INTO bookmarks (id, title, url, description, categoryId, icon, tags, clicks, sortOrder, isPinned, createdAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 0, 99, 0, ?)
                `).bind(
                  bmId,
                  title.substring(0, 150),
                  urlStr.substring(0, 2000),
                  "从浏览器书签导入",
                  catId,
                  icon,
                  JSON.stringify(["浏览器导入"]),
                  new Date().toISOString()
                ).run();
                importedCount++;
              }
            }
          }

          await invalidateCache();
          return new Response(JSON.stringify({ 
            success: true, 
            message: `成功解析并导入 ${importedCount} 个浏览器书签，已自动写入 D1 数据库并按文件夹归类！` 
          }), { headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ error: "不支持的导入格式类型" }), { status: 400, headers: corsHeaders });
        }
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "导入处理失败: " + err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 12. Docs Spec (GET /api/docs-spec)
    if (path === "/api/docs-spec" && method === "GET") {
      return new Response(JSON.stringify({
        title: "OmniMark Cloudflare Worker API 规范",
        version: "1.2.0",
        baseUrl: "/api",
        endpoints: [
          { method: "GET", path: "/api/icon-proxy", description: "Favicon 图标代理抓取" },
          { method: "GET", path: "/api/export", description: "导出全量书签数据" },
          { method: "POST", path: "/api/import", description: "导入书签" },
          { method: "POST", path: "/api/plugin/capture", description: "插件一键采集" }
        ]
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "API route not found", path }), {
      status: 404,
      headers: corsHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
