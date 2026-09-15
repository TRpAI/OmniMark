import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import {
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  generateSecureToken,
  isSafeDomain,
  isSafeUrl,
  parseNetscapeBookmarks,
  escapeHtml
} from "./src/utils/security.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Security Middleware: Set fundamental HTTP protection headers (Removed obsolete X-XSS-Protection)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// JSON Body Parser with strict safe payload limit (10mb)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Persistent storage paths
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const FAVICONS_DIR = path.join(DATA_DIR, "favicons");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(FAVICONS_DIR)) {
  fs.mkdirSync(FAVICONS_DIR, { recursive: true });
}

// Default PBKDF2 hash for initial installation (admin123, 100,000 iterations, 32-byte salt)
const DEFAULT_ADMIN_HASH = "pbkdf2:sha256:100000:23fb0c6cda199c36b92eb7ab502043b6:8a3adcb7fcaf7581a527a62a6cdd974ea8324b1a1bc8077f2ebfb7758a65063d";

// Initial default database structure
const defaultData = {
  settings: {
    siteName: "OmniMark 站点导航与书签系统",
    siteSubtitle: "极简、高效、多端同步的现代化站点导航与书签管理系统",
    adminPasswordHash: DEFAULT_ADMIN_HASH,
    defaultViewMode: "grid",
    allowPublicSubmit: false,
    enableWeather: true,
    enableSearchEngine: true,
    defaultSearchEngine: "google",
    announcement: "欢迎使用 OmniMark！支持浏览器书签导入、多端同步与一键采集插件。"
  },
  categories: [
    { id: "cat-1", name: "常用推荐", icon: "Star", sortOrder: 1, description: "高频使用的日常核心工具" },
    { id: "cat-2", name: "开发运维", icon: "Code", sortOrder: 2, description: "编程、框架、云服务与终端工具" },
    { id: "cat-3", name: "AI 与前沿", icon: "Sparkles", sortOrder: 3, description: "大模型、人工智能与创新科技" },
    { id: "cat-4", name: "设计灵感", icon: "Palette", sortOrder: 4, description: "UI/UX、图片素材、配色与字体" },
    { id: "cat-5", name: "学习社区", icon: "BookOpen", sortOrder: 5, description: "文档、博客、技术论坛与教程" }
  ],
  bookmarks: [
    {
      id: "bm-1",
      title: "GitHub",
      url: "https://github.com",
      description: "全球最大的代码托管与开源项目协作平台",
      categoryId: "cat-2",
      icon: "https://github.githubassets.com/favicons/favicon.svg",
      tags: ["开发", "代码", "Git"],
      clicks: 142,
      sortOrder: 1,
      isPinned: true,
      createdAt: new Date().toISOString()
    },
    {
      id: "bm-2",
      title: "Google",
      url: "https://www.google.com",
      description: "全球领先的搜索引擎与网络入口",
      categoryId: "cat-1",
      icon: "https://www.google.com/favicon.ico",
      tags: ["搜索", "工具"],
      clicks: 350,
      sortOrder: 2,
      isPinned: true,
      createdAt: new Date().toISOString()
    },
    {
      id: "bm-3",
      title: "Google AI Studio",
      url: "https://aistudio.google.com",
      description: "探索 Gemini 大模型与智能原型构建的尖端平台",
      categoryId: "cat-3",
      icon: "https://www.gstatic.com/aistudio/favicon.ico",
      tags: ["AI", "Gemini", "开发"],
      clicks: 89,
      sortOrder: 3,
      isPinned: true,
      createdAt: new Date().toISOString()
    }
  ]
};

// In-Memory Database Cache with Atomic File Persistence
let cachedDb: any = null;

function readDb() {
  if (cachedDb) return cachedDb;
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), "utf-8");
      cachedDb = JSON.parse(JSON.stringify(defaultData));
      return cachedDb;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    cachedDb = JSON.parse(raw);
    return cachedDb;
  } catch (err) {
    console.error("Error reading database file:", err);
    cachedDb = JSON.parse(JSON.stringify(defaultData));
    return cachedDb;
  }
}

function writeDb(data: any) {
  cachedDb = data;
  try {
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("Error writing database file:", err);
    throw new Error("数据库持久化保存失败");
  }
}

// Active Secure Admin Sessions Store with Expiration Checking
interface AdminSession {
  token: string;
  expiresAt: number; // Unix timestamp in ms
}
const activeAdminSessions = new Map<string, AdminSession>();

// Authentication middleware with strict header-only token extraction & expiration verification
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: "未授权：请先登录管理员账户以执行该操作" });
  }

  const session = activeAdminSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: "未授权：登录令牌无效或已失效，请重新登录" });
  }

  if (session.expiresAt <= Date.now()) {
    activeAdminSessions.delete(token);
    return res.status(401).json({ error: "登录会话已过期，请重新登录" });
  }

  next();
}

// Brute-force rate limiter for admin login (Only counts failed attempts, with memory leak cleanup)
interface RateLimitRecord {
  failCount: number;
  firstAttempt: number;
}
const loginRateLimitMap = new Map<string, RateLimitRecord>();

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  // Cleanup expired entries older than 2 minutes
  for (const [key, rec] of loginRateLimitMap.entries()) {
    if (now - rec.firstAttempt > 120000) {
      loginRateLimitMap.delete(key);
    }
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
  if (!record) {
    loginRateLimitMap.set(ip, { failCount: 1, firstAttempt: now });
  } else {
    if (now - record.firstAttempt > 60000) {
      loginRateLimitMap.set(ip, { failCount: 1, firstAttempt: now });
    } else {
      record.failCount += 1;
    }
  }
}

// Clear rate limit entries upon success
function clearLoginFailures(ip: string) {
  loginRateLimitMap.delete(ip);
}

// ==========================================
// API Routes
// ==========================================

// Health Check & Cloudflare System Status
app.get("/api/health", (req, res) => {
  const d1Bound = Boolean(process.env.CF_D1_DATABASE_ID || process.env.DB_BINDING);
  const kvBound = Boolean(process.env.CF_KV_NAMESPACE_ID || process.env.KV_BINDING);
  const warnings: string[] = [];
  if (!d1Bound) {
    warnings.push("Cloudflare D1 数据库未绑定 (env.DB 缺失)：当前运行在本地/轻量环境。在 Cloudflare 部署时，请在 wrangler.toml 或 Cloudflare Dashboard 绑定 D1 数据库 (名称: DB)。");
  }
  if (!kvBound) {
    warnings.push("Cloudflare KV 缓存未绑定 (env.CACHE_KV 缺失)：未检测到边缘 KV 命名空间绑定。在 Cloudflare 部署时，请绑定 KV Namespace (名称: CACHE_KV) 以启用全站边缘高速缓存。");
  }

  res.json({ 
    status: "ok", 
    runtime: "node-cloudflare-dev",
    d1Bound,
    kvBound,
    warnings,
    timestamp: new Date().toISOString() 
  });
});

// System Status & Cloudflare Free Tier Quota Endpoint
app.get("/api/system/status", (req, res) => {
  const db = readDb();
  const d1Bound = Boolean(process.env.CF_D1_DATABASE_ID || process.env.DB_BINDING);
  const kvBound = Boolean(process.env.CF_KV_NAMESPACE_ID || process.env.KV_BINDING);
  const warnings: string[] = [];
  if (!d1Bound) {
    warnings.push("Cloudflare D1 数据库未绑定 (env.DB 缺失)：数据未持久化至 Cloudflare D1 分布式数据库。请前往 Cloudflare 控制台 -> Workers & Pages -> 设置 -> 绑定，添加 D1 数据库绑定 (变量名: DB)。");
  }
  if (!kvBound) {
    warnings.push("Cloudflare KV 缓存未绑定 (env.CACHE_KV 缺失)：未开启边缘 KV 缓存加速。请添加 KV 命名空间绑定 (变量名: CACHE_KV)。");
  }

  res.json({
    status: "ok",
    runtime: "node-cloudflare-hybrid",
    environment: process.env.NODE_ENV || "development",
    d1Bound,
    kvBound,
    hasGeminiKey: Boolean(db.settings?.geminiApiKey || process.env.GEMINI_API_KEY),
    hasCfToken: Boolean(db.settings?.cfApiToken || process.env.CLOUDFLARE_API_TOKEN),
    warnings,
    quotas: {
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
    }
  });
});

// Favicon Local Caching Proxy with strict SSRF & Size Limits
app.get("/api/icon-proxy", async (req, res) => {
  const { url, domain } = req.query;
  let targetDomain = domain as string;

  if (!targetDomain && url && typeof url === "string") {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      targetDomain = parsed.hostname;
    } catch {}
  }

  if (!targetDomain || !isSafeDomain(targetDomain)) {
    targetDomain = "example.com";
  }
  targetDomain = targetDomain.replace(/^www\./, "").toLowerCase();

  const safeFileName = targetDomain.replace(/[^a-zA-Z0-9.-]/g, "_") + ".png";
  const cachedFilePath = path.join(FAVICONS_DIR, safeFileName);

  if (fs.existsSync(cachedFilePath)) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    return fs.createReadStream(cachedFilePath).pipe(res);
  }

  try {
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(targetDomain)}&sz=128`;
    const fetchRes = await fetch(googleFaviconUrl, { signal: AbortSignal.timeout(3000) });
    if (fetchRes.ok) {
      const buffer = Buffer.from(await fetchRes.arrayBuffer());
      if (buffer.length > 50 && buffer.length < 500 * 1024) {
        // Enforce cache file count limit: if > 1000 files, remove oldest
        try {
          const files = fs.readdirSync(FAVICONS_DIR);
          if (files.length > 1000) {
            const oldest = files
              .map(f => ({ name: f, time: fs.statSync(path.join(FAVICONS_DIR, f)).mtimeMs }))
              .sort((a, b) => a.time - b.time)[0];
            if (oldest) fs.unlinkSync(path.join(FAVICONS_DIR, oldest.name));
          }
        } catch {}

        fs.writeFileSync(cachedFilePath, buffer);
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      return res.send(buffer);
    }
  } catch (e) {}

  res.redirect(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(targetDomain)}&sz=128`);
});

// Public Settings (Excludes adminPasswordHash)
app.get("/api/settings", (req, res) => {
  const db = readDb();
  const { adminPasswordHash, ...safeSettings } = db.settings;
  res.json(safeSettings);
});

// Update Settings with Whitelist & Secure Password Change (Admin Only)
app.put("/api/settings", requireAuth, async (req, res) => {
  const db = readDb();
  const { currentPassword, newPassword, ...rest } = req.body;

  if (newPassword) {
    if (!currentPassword) {
      return res.status(401).json({ error: "修改密码必须提供当前管理员密码" });
    }
    const { valid } = await verifyPasswordPBKDF2(currentPassword, db.settings.adminPasswordHash);
    if (!valid) {
      return res.status(401).json({ error: "当前管理员密码不正确" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ error: "新密码长度不能少于 6 位" });
    }
    db.settings.adminPasswordHash = await hashPasswordPBKDF2(newPassword);
    // Security Fix: Immediately invalidate and clear all active admin sessions upon password change!
    activeAdminSessions.clear();
  }

  // Strict whitelist for settings updates to prevent arbitrary prototype or secret pollution
  const allowedKeys = [
    "siteName", "siteSubtitle", "announcement", "defaultViewMode",
    "allowPublicSubmit", "enableWeather", "enableSearchEngine", "defaultSearchEngine",
    "geminiApiKey", "cfApiToken", "cfAccountId", "cfD1DatabaseId", "cfKvNamespaceId"
  ];

  for (const key of allowedKeys) {
    if (rest[key] !== undefined) {
      db.settings[key] = rest[key];
    }
  }

  writeDb(db);

  const { adminPasswordHash, ...safeSettings } = db.settings;
  res.json({ success: true, settings: safeSettings });
});

// Admin Login (Secure Rate-limited, PBKDF2 with Auto-upgrade & Cryptographic Session Token)
app.post("/api/auth/login", async (req, res) => {
  const clientIp = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();

  if (!checkLoginRateLimit(clientIp)) {
    return res.status(429).json({ 
      success: false, 
      error: "登录失败次数过多，请稍候 1 分钟后再试" 
    });
  }

  const { password } = req.body;
  const db = readDb();

  const { valid, needsUpgrade } = await verifyPasswordPBKDF2(password || "", db.settings.adminPasswordHash);
  if (valid) {
    clearLoginFailures(clientIp);

    // If legacy hash was verified, seamlessly upgrade to PBKDF2 with 100k iterations and fresh salt
    if (needsUpgrade) {
      db.settings.adminPasswordHash = await hashPasswordPBKDF2(password);
      writeDb(db);
    }

    const token = generateSecureToken();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days expiration
    activeAdminSessions.set(token, { token, expiresAt });

    return res.json({ success: true, token, expiresAt });
  }

  recordLoginFailure(clientIp);
  return res.status(401).json({ success: false, error: "管理员密码错误，请重新输入" });
});

// Admin Logout (Safely terminates active session)
app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
  if (token) {
    activeAdminSessions.delete(token);
  }
  return res.json({ success: true, message: "已安全退出登录" });
});

// Verify Current Session Status
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, authenticated: true, role: "admin" });
});

// ==========================================
// Category Endpoints
// ==========================================

app.get("/api/categories", (req, res) => {
  const db = readDb();
  const sorted = [...db.categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  res.json(sorted);
});

app.post("/api/categories", requireAuth, (req, res) => {
  const db = readDb();
  const { name, icon, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "分类名称不能为空" });
  }

  const maxSort = db.categories.reduce((max: number, c: any) => Math.max(max, c.sortOrder || 0), 0);
  const newCat = {
    id: "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    name: String(name).trim().substring(0, 50),
    icon: icon ? String(icon).trim().substring(0, 30) : "Folder",
    sortOrder: maxSort + 1,
    description: description ? String(description).trim().substring(0, 200) : ""
  };

  db.categories.push(newCat);
  writeDb(db);
  res.json(newCat);
});

app.put("/api/categories/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const idx = db.categories.findIndex((c: any) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "分类不存在" });

  db.categories[idx] = { ...db.categories[idx], ...req.body };
  writeDb(db);
  res.json(db.categories[idx]);
});

app.delete("/api/categories/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  if (db.categories.length <= 1) {
    return res.status(400).json({ error: "至少需要保留一个分类" });
  }

  db.categories = db.categories.filter((c: any) => c.id !== id);
  const fallbackCatId = db.categories[0].id;
  db.bookmarks.forEach((b: any) => {
    if (b.categoryId === id) {
      b.categoryId = fallbackCatId;
    }
  });

  writeDb(db);
  res.json({ success: true });
});

app.post("/api/categories/reorder", requireAuth, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "参数错误" });

  const db = readDb();
  orderedIds.forEach((id: string, idx: number) => {
    const cat = db.categories.find((c: any) => c.id === id);
    if (cat) cat.sortOrder = idx + 1;
  });

  writeDb(db);
  res.json({ success: true });
});

// ==========================================
// Bookmark Endpoints
// ==========================================

app.get("/api/bookmarks", (req, res) => {
  const db = readDb();
  const { categoryId, search, tag } = req.query;
  let list = [...db.bookmarks];

  if (categoryId && categoryId !== "all") {
    list = list.filter((b: any) => b.categoryId === categoryId);
  }
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(
      (b: any) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        (b.description && b.description.toLowerCase().includes(q)) ||
        (b.tags && b.tags.some((t: string) => t.toLowerCase().includes(q)))
    );
  }
  if (tag) {
    const tq = String(tag);
    list = list.filter((b: any) => b.tags && b.tags.includes(tq));
  }

  // Sort by pinned status first (pinned items on top), then sortOrder
  list.sort((a, b) => {
    if (Boolean(b.isPinned) !== Boolean(a.isPinned)) {
      return Boolean(b.isPinned) ? 1 : -1;
    }
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });

  res.json(list);
});

function resolveFavicon(url: string, icon?: string): string {
  if (icon && icon.trim() && isSafeUrl(icon)) return icon.trim();
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (isSafeDomain(parsed.hostname)) {
      return `/api/icon-proxy?domain=${parsed.hostname}`;
    }
  } catch {}
  return "/api/icon-proxy?domain=example.com";
}

// Add Bookmark (Checks allowPublicSubmit setting)
app.post("/api/bookmarks", (req, res, next) => {
  const db = readDb();
  if (!db.settings.allowPublicSubmit) {
    return requireAuth(req, res, next);
  }
  next();
}, (req, res) => {
  const db = readDb();
  const { title, url, description, categoryId, icon, tags, isPinned } = req.body;

  if (!url || !url.trim()) return res.status(400).json({ error: "书签网址不能为空" });

  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = "https://" + normalizedUrl;
  }

  if (!isSafeUrl(normalizedUrl)) {
    return res.status(400).json({ error: "不合法的网址协议或受限的内网地址" });
  }

  let finalTitle = title && title.trim() ? title.trim().substring(0, 150) : "";
  if (!finalTitle) {
    try {
      finalTitle = new URL(normalizedUrl).hostname;
    } catch {
      finalTitle = normalizedUrl.substring(0, 50);
    }
  }

  const finalIcon = resolveFavicon(normalizedUrl, icon);
  const maxSort = db.bookmarks.reduce((max: number, b: any) => Math.max(max, b.sortOrder || 0), 0);

  const newBm = {
    id: "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    title: finalTitle,
    url: normalizedUrl.substring(0, 2000),
    description: (description || "").trim().substring(0, 500),
    categoryId: categoryId || (db.categories[0]?.id ?? "cat-1"),
    icon: finalIcon,
    tags: Array.isArray(tags) 
      ? tags.map(t => String(t).trim().substring(0, 25)).filter(Boolean).slice(0, 10) 
      : [],
    clicks: 0,
    sortOrder: maxSort + 1,
    isPinned: !!isPinned,
    createdAt: new Date().toISOString()
  };

  db.bookmarks.push(newBm);
  writeDb(db);
  res.json(newBm);
});

app.put("/api/bookmarks/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const idx = db.bookmarks.findIndex((b: any) => b.id === id);
  if (idx === -1) return res.status(404).json({ error: "书签不存在" });

  if (req.body.url) {
    let normalizedUrl = req.body.url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    if (!isSafeUrl(normalizedUrl)) {
      return res.status(400).json({ error: "不合法的网址协议或受限的内网地址" });
    }
    req.body.url = normalizedUrl.substring(0, 2000);
  }

  db.bookmarks[idx] = { ...db.bookmarks[idx], ...req.body };
  writeDb(db);
  res.json(db.bookmarks[idx]);
});

app.delete("/api/bookmarks/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.bookmarks = db.bookmarks.filter((b: any) => b.id !== id);
  writeDb(db);
  res.json({ success: true });
});

app.post("/api/bookmarks/:id/click", (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const bm = db.bookmarks.find((b: any) => b.id === id);
  if (bm) {
    bm.clicks = (bm.clicks || 0) + 1;
    writeDb(db);
    res.json({ success: true, clicks: bm.clicks });
  } else {
    res.status(404).json({ error: "书签不存在" });
  }
});

app.post("/api/bookmarks/reorder", requireAuth, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "参数错误" });

  const db = readDb();
  orderedIds.forEach((id: string, idx: number) => {
    const bm = db.bookmarks.find((b: any) => b.id === id);
    if (bm) bm.sortOrder = idx + 1;
  });

  writeDb(db);
  res.json({ success: true });
});

app.post("/api/plugin/capture", (req, res) => {
  const db = readDb();
  const { url, title, description, categoryId, tags } = req.body;
  if (!url) return res.status(400).json({ error: "URL 不能为空" });

  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = "https://" + normalizedUrl;
  }

  if (!isSafeUrl(normalizedUrl)) {
    return res.status(400).json({ error: "不合法的网址协议" });
  }

  let finalTitle = title ? title.trim().substring(0, 150) : "";
  if (!finalTitle) {
    try {
      finalTitle = new URL(normalizedUrl).hostname;
    } catch {
      finalTitle = normalizedUrl.substring(0, 50);
    }
  }

  const icon = resolveFavicon(normalizedUrl);
  const maxSort = db.bookmarks.reduce((max: number, b: any) => Math.max(max, b.sortOrder || 0), 0);

  const newBm = {
    id: "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    title: finalTitle,
    url: normalizedUrl.substring(0, 2000),
    description: (description || "").trim().substring(0, 500),
    categoryId: categoryId || db.categories[0]?.id || "cat-1",
    icon,
    tags: Array.isArray(tags) && tags.length > 0 
      ? tags.map(t => String(t).trim().substring(0, 25)).slice(0, 10) 
      : ["插件采集"],
    clicks: 0,
    sortOrder: maxSort + 1,
    isPinned: false,
    createdAt: new Date().toISOString()
  };

  db.bookmarks.push(newBm);
  writeDb(db);
  res.json({ success: true, bookmark: newBm });
});

// ==========================================
// Export & Import Endpoints (Protected & Sanitized)
// ==========================================

app.get("/api/export", requireAuth, (req, res) => {
  const { format = "json" } = req.query;
  const db = readDb();

  if (format === "html") {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n`;
    html += `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n`;
    html += `<TITLE>OmniMark Bookmarks Export</TITLE>\n`;
    html += `<H1>Bookmarks</H1>\n`;
    html += `<DL><p>\n`;

    for (const cat of db.categories) {
      html += `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">${escapeHtml(cat.name)}</H3>\n`;
      html += `    <DL><p>\n`;
      const catBms = db.bookmarks.filter((b: any) => b.categoryId === cat.id);
      for (const bm of catBms) {
        html += `        <DT><A HREF="${escapeHtml(bm.url)}" ADD_DATE="${Math.floor(Date.now() / 1000)}" ICON="${escapeHtml(bm.icon || '')}">${escapeHtml(bm.title)}</A>\n`;
        if (bm.description) {
          html += `        <DD>${escapeHtml(bm.description)}\n`;
        }
      }
      html += `    </DL><p>\n`;
    }
    html += `</DL><p>\n`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="bookmarks_export.html"');
    return res.send(html);
  } else {
    // Strip sensitive admin password hash before exporting JSON
    const { adminPasswordHash, geminiApiKey, cfApiToken, ...safeSettings } = db.settings;
    const sanitizedDb = {
      ...db,
      settings: safeSettings
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="omnimark_backup.json"');
    return res.send(JSON.stringify(sanitizedDb, null, 2));
  }
});

// System Settings Whitelist for Backup Imports
const IMPORT_SETTINGS_WHITELIST = new Set([
  "siteName", "siteSubtitle", "announcement", "defaultViewMode",
  "enableWeather", "enableSearchEngine", "defaultSearchEngine"
]);

app.post("/api/import", requireAuth, (req, res) => {
  const { type, content, mode = "merge" } = req.body;
  const db = readDb();

  try {
    if (type === "json") {
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      if (mode === "replace") {
        // True replacement: clear existing categories and bookmarks completely
        db.categories = [];
        db.bookmarks = [];

        if (parsed.categories && Array.isArray(parsed.categories)) {
          db.categories = parsed.categories.map((c: any, idx: number) => ({
            id: c.id || "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
            name: String(c.name || "未命名分类").substring(0, 50),
            icon: String(c.icon || "Folder").substring(0, 30),
            sortOrder: typeof c.sortOrder === "number" ? c.sortOrder : idx + 1,
            description: String(c.description || "").substring(0, 200)
          }));
        }

        if (parsed.bookmarks && Array.isArray(parsed.bookmarks)) {
          const fallbackCatId = db.categories[0]?.id || "cat-1";
          db.bookmarks = parsed.bookmarks
            .filter((b: any) => b.url && isSafeUrl(b.url))
            .map((b: any, idx: number) => ({
              id: b.id || "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
              title: String(b.title || b.url).substring(0, 150),
              url: String(b.url).substring(0, 2000),
              description: String(b.description || "").substring(0, 500),
              categoryId: b.categoryId || fallbackCatId,
              icon: resolveFavicon(b.url, b.icon),
              tags: Array.isArray(b.tags) ? b.tags.map((t: any) => String(t).substring(0, 25)).slice(0, 10) : [],
              clicks: typeof b.clicks === "number" ? b.clicks : 0,
              sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : idx + 1,
              isPinned: Boolean(b.isPinned),
              createdAt: b.createdAt || new Date().toISOString()
            }));
        }

        if (parsed.settings && typeof parsed.settings === "object") {
          for (const [key, val] of Object.entries(parsed.settings)) {
            if (IMPORT_SETTINGS_WHITELIST.has(key) && key !== "__proto__" && key !== "constructor") {
              db.settings[key] = val;
            }
          }
        }
      } else {
        // Merge mode: O(1) deduplication by loading existing URLs & categories in memory
        const existingUrls = new Set(db.bookmarks.map((b: any) => b.url));
        const existingCatMap = new Map(db.categories.map((c: any) => [c.name, c.id]));

        if (Array.isArray(parsed.categories)) {
          for (const c of parsed.categories) {
            if (!existingCatMap.has(c.name)) {
              const maxSort = db.categories.reduce((m: number, item: any) => Math.max(m, item.sortOrder || 0), 0);
              const newCat = {
                id: c.id || "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
                name: String(c.name || "未命名分类").substring(0, 50),
                icon: String(c.icon || "Folder").substring(0, 30),
                sortOrder: maxSort + 1,
                description: String(c.description || "").substring(0, 200)
              };
              db.categories.push(newCat);
              existingCatMap.set(newCat.name, newCat.id);
            }
          }
        }

        if (Array.isArray(parsed.bookmarks)) {
          const fallbackCatId = db.categories[0]?.id || "cat-1";
          for (const b of parsed.bookmarks) {
            if (b.url && isSafeUrl(b.url) && !existingUrls.has(b.url)) {
              const maxSort = db.bookmarks.reduce((m: number, item: any) => Math.max(m, item.sortOrder || 0), 0);
              db.bookmarks.push({
                id: b.id || "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
                title: String(b.title || b.url).substring(0, 150),
                url: String(b.url).substring(0, 2000),
                description: String(b.description || "").substring(0, 500),
                categoryId: b.categoryId || fallbackCatId,
                icon: resolveFavicon(b.url, b.icon),
                tags: Array.isArray(b.tags) ? b.tags.map((t: any) => String(t).substring(0, 25)).slice(0, 10) : [],
                clicks: typeof b.clicks === "number" ? b.clicks : 0,
                sortOrder: maxSort + 1,
                isPinned: Boolean(b.isPinned),
                createdAt: b.createdAt || new Date().toISOString()
              });
              existingUrls.add(b.url);
            }
          }
        }
      }

      writeDb(db);
      return res.json({ success: true, message: "JSON 备份数据已安全导入完成" });
    } else if (type === "html") {
      // Robust Netscape HTML parser with multiline & DD description support
      const bookmarksToImport = parseNetscapeBookmarks(String(content));
      let importedCount = 0;

      const existingUrls = new Set(db.bookmarks.map((b: any) => b.url));
      const existingCatMap = new Map(db.categories.map((c: any) => [c.name, c.id]));

      for (const item of bookmarksToImport) {
        if (!isSafeUrl(item.url) || existingUrls.has(item.url)) continue;

        let categoryId = existingCatMap.get(item.categoryName);
        if (!categoryId) {
          const maxSortCat = db.categories.reduce((m: number, c: any) => Math.max(m, c.sortOrder || 0), 0);
          const newCat = {
            id: "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
            name: item.categoryName,
            icon: "Folder",
            sortOrder: maxSortCat + 1,
            description: "从浏览器书签导入的目录"
          };
          db.categories.push(newCat);
          categoryId = newCat.id;
          existingCatMap.set(item.categoryName, categoryId);
        }

        const maxSortBm = db.bookmarks.reduce((m: number, b: any) => Math.max(m, b.sortOrder || 0), 0);
        db.bookmarks.push({
          id: "bm-imp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
          title: item.title.substring(0, 150),
          url: item.url.substring(0, 2000),
          description: item.description || "从浏览器书签导入",
          categoryId,
          icon: resolveFavicon(item.url, item.icon),
          tags: ["浏览器导入"],
          clicks: 0,
          sortOrder: maxSortBm + 1,
          isPinned: false,
          createdAt: new Date().toISOString()
        });

        existingUrls.add(item.url);
        importedCount++;
      }

      writeDb(db);
      return res.json({ 
        success: true, 
        message: `成功解析并安全导入 ${importedCount} 个浏览器书签，已按文件夹自动归类！` 
      });
    } else {
      return res.status(400).json({ error: "不支持的导入格式类型" });
    }
  } catch (err: any) {
    return res.status(500).json({ error: "导入处理失败: " + err.message });
  }
});

// URL Metadata Preview Proxy Endpoint with manual redirect checking against SSRF
app.get("/api/metadata", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).json({ error: "URL 不能为空" });

  let normalized = targetUrl.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }

  if (!isSafeUrl(normalized)) {
    return res.status(400).json({ error: "不安全或受限制的目标网址" });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    let currentUrl = normalized;
    let response: any = null;

    // Follow redirects manually with SSRF validation at each hop (max 3 hops)
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
        const location = resp.headers.get("location");
        if (!location) break;
        const nextUrl = new URL(location, currentUrl).toString();
        if (!isSafeUrl(nextUrl)) {
          clearTimeout(timeoutId);
          return res.status(400).json({ error: "重定向到不安全或受限制的地址" });
        }
        currentUrl = nextUrl;
        continue;
      }

      response = resp;
      break;
    }

    clearTimeout(timeoutId);

    if (!response || !response.ok) {
      let hostname = "";
      try { hostname = new URL(normalized).hostname.replace(/^www\./, ""); } catch {}
      return res.json({ title: "", description: "", image: "", hostname, url: normalized });
    }

    const html = await response.text();
    
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const descMatch = html.match(/<meta\s+(?:name=["']description["']|property=["']og:description["'])\s+content=["']([^"']+)["']/i) ||
                      html.match(/<meta\s+content=["']([^"']+)["']\s+(?:name=["']description["']|property=["']og:description["'])/i);
    const description = descMatch ? descMatch[1].trim() : "";

    const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                     html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    let image = imgMatch ? imgMatch[1].trim() : "";

    // Validate og:image URL against SSRF
    if (image && !isSafeUrl(image)) {
      image = "";
    }

    let hostname = "";
    try {
      hostname = new URL(currentUrl).hostname.replace(/^www\./, "");
    } catch {}

    res.json({
      title,
      description: description.substring(0, 220),
      image,
      hostname,
      url: currentUrl
    });
  } catch (err: any) {
    let hostname = "";
    try {
      hostname = new URL(normalized).hostname.replace(/^www\./, "");
    } catch {}
    res.json({ title: "", description: "无法加载实时预览摘要", image: "", hostname, url: normalized });
  }
});

// API Documentation Specification Endpoint
app.get("/api/docs-spec", (req, res) => {
  res.json({
    title: "OmniMark RESTful API 文档与规范",
    version: "1.3.0",
    baseUrl: "/api",
    description: "提供企业级安全防护、密码哈希、SSRF 防御及多端同步的现代化书签与导航 API。",
    endpoints: [
      { method: "GET", path: "/api/icon-proxy", description: "带大小限制与 SSRF 防护的 Favicon 缓存代理" },
      { method: "GET", path: "/api/categories", description: "获取所有分类" },
      { method: "POST", path: "/api/categories", description: "创建分类 (需鉴权)" },
      { method: "GET", path: "/api/bookmarks", description: "获取书签列表 (置顶优先排序)" },
      { method: "POST", path: "/api/bookmarks", description: "添加书签 (受 allowPublicSubmit 策略控制)" },
      { method: "GET", path: "/api/export", description: "导出加密码脱敏的备份 (需鉴权)" },
      { method: "POST", path: "/api/import", description: "安全导入备份 (需鉴权)" }
    ]
  });
});

// ==========================================
// Middleware & SPA Fallback Order (Strict Correctness)
// ==========================================

// Global Express Error Handler (Must be after all routes)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "服务器内部异常，请稍后再试" });
});

// Vite middleware & Production static serving with API 404 exclusion
if (process.env.NODE_ENV !== "production") {
  const isHmrDisabled = process.env.DISABLE_HMR === "true";
  const vite = await createViteServer({
    server: { 
      middlewareMode: true,
      hmr: isHmrDisabled ? false : undefined
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    // Prevent SPA fallback from swallowing API 404s
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API route not found" });
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`OmniMark secure server running on port ${PORT}`);
});
