import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Security Middleware: Set fundamental HTTP protection headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// JSON Body Parser with safe payload limit
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

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

// Initial default database structure
const defaultData = {
  settings: {
    siteName: "OmniMark 导航与书签",
    siteSubtitle: "极简、高效、多端同步的现代化站点导航与书签管理系统",
    adminPasswordHash: "admin123",
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
    },
    {
      id: "bm-4",
      title: "Tailwind CSS",
      url: "https://tailwindcss.com",
      description: "现代功能类优先 CSS 框架，构建快速响应式界面",
      categoryId: "cat-2",
      icon: "https://tailwindcss.com/favicons/favicon.ico?v=3",
      tags: ["前端", "CSS", "设计"],
      clicks: 65,
      sortOrder: 4,
      isPinned: false,
      createdAt: new Date().toISOString()
    },
    {
      id: "bm-5",
      title: "Dribbble",
      url: "https://dribbble.com",
      description: "全球顶尖设计师展示与灵感搜寻创意社区",
      categoryId: "cat-4",
      icon: "https://cdn.dribbble.com/assets/favicon-bde37f6a6132e65cad4c52d00164c06cfb5e695ec2d23348d6babf7a7d4aef83.ico",
      tags: ["设计", "UI", "灵感"],
      clicks: 44,
      sortOrder: 5,
      isPinned: false,
      createdAt: new Date().toISOString()
    }
  ]
};

// High-Performance In-Memory Cache with Atomic File Persistence
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
  }
}

// Authentication middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const queryToken = req.query.token as string;
  const effectiveToken = token || queryToken;

  if (!effectiveToken || !effectiveToken.startsWith("omni-admin-token-")) {
    return res.status(401).json({ error: "未授权：请先登录管理员账户以执行该操作" });
  }
  next();
}

// Brute-force rate limiter for admin login
interface RateLimitRecord {
  count: number;
  firstAttempt: number;
}
const loginRateLimitMap = new Map<string, RateLimitRecord>();

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginRateLimitMap.get(ip);
  if (!record) {
    loginRateLimitMap.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  // 60-second window
  if (now - record.firstAttempt > 60000) {
    loginRateLimitMap.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  if (record.count >= 5) {
    return false; // Rate limit exceeded (more than 5 failed attempts in 1 min)
  }

  record.count += 1;
  return true;
}

// SSRF Safe Domain Validator
function isSafeDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string" || domain.length > 253) return false;
  const lower = domain.toLowerCase();
  
  // Disallow localhost, loopback, private IP ranges and special TLDs
  const forbiddenHosts = [
    "localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "::1", "metadata.google.internal"
  ];
  if (forbiddenHosts.includes(lower)) return false;

  // Disallow private IP patterns
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(lower)) return false;
  if (lower.endsWith(".local") || lower.endsWith(".internal") || lower.endsWith(".arpa") || lower.endsWith(".lan")) return false;

  // Alphanumeric + dot + dash check
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(domain);
}

// URL Protocol Validator
function isSafeUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim().toLowerCase();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

// ==========================================
// API Routes
// ==========================================

// Health Check & Cloudflare System Status
app.get("/api/health", (req, res) => {
  const db = readDb();
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

// Favicon Local Caching Proxy (抓取并本地缓存图标，防 SSRF 注入)
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

  // Return from local cache if file exists (Ultra-fast disk stream)
  if (fs.existsSync(cachedFilePath)) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    return fs.createReadStream(cachedFilePath).pipe(res);
  }

  // Fetch from Google Favicon service with 3s timeout to protect node server
  try {
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(targetDomain)}&sz=128`;
    const fetchRes = await fetch(googleFaviconUrl, { signal: AbortSignal.timeout(3000) });
    if (fetchRes.ok) {
      const buffer = Buffer.from(await fetchRes.arrayBuffer());
      // Only cache if valid image buffer (> 100 bytes)
      if (buffer.length > 100) {
        fs.writeFileSync(cachedFilePath, buffer);
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      return res.send(buffer);
    }
  } catch (e) {
    // Timeout or network fallback
  }

  res.redirect(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(targetDomain)}&sz=128`);
});

// Public Settings
app.get("/api/settings", (req, res) => {
  const db = readDb();
  const { adminPasswordHash, ...safeSettings } = db.settings;
  res.json(safeSettings);
});

// Update Settings (Admin Only)
app.put("/api/settings", requireAuth, (req, res) => {
  const db = readDb();
  const { currentPassword, newPassword, ...rest } = req.body;

  if (newPassword) {
    if (currentPassword !== db.settings.adminPasswordHash) {
      return res.status(401).json({ error: "当前管理员密码不正确" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ error: "新密码长度不能少于 6 位" });
    }
    db.settings.adminPasswordHash = newPassword;
  }

  db.settings = { ...db.settings, ...rest };
  writeDb(db);

  const { adminPasswordHash, ...safeSettings } = db.settings;
  res.json({ success: true, settings: safeSettings });
});

// Admin Login (Rate-limited & Protected)
app.post("/api/auth/login", (req, res) => {
  const clientIp = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();

  if (!checkLoginRateLimit(clientIp)) {
    return res.status(429).json({ 
      success: false, 
      error: "登录失败次数过多，请稍候 1 分钟后再试" 
    });
  }

  const { password } = req.body;
  const db = readDb();

  if (password && password === db.settings.adminPasswordHash) {
    // Reset rate limiter on successful login
    loginRateLimitMap.delete(clientIp);
    res.json({ 
      success: true, 
      token: "omni-admin-token-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8) 
    });
  } else {
    res.status(401).json({ success: false, error: "管理员密码错误" });
  }
});

// ==========================================
// Category Endpoints
// ==========================================

// Get All Categories
app.get("/api/categories", (req, res) => {
  const db = readDb();
  const sorted = [...db.categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  res.json(sorted);
});

// Create Category (Admin Only)
app.post("/api/categories", requireAuth, (req, res) => {
  const db = readDb();
  const { name, icon, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "分类名称不能为空" });
  }

  const safeName = String(name).trim().substring(0, 50);
  const safeDesc = description ? String(description).trim().substring(0, 200) : "";

  const newCat = {
    id: "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    name: safeName,
    icon: icon || "Folder",
    sortOrder: db.categories.length + 1,
    description: safeDesc
  };

  db.categories.push(newCat);
  writeDb(db);
  res.json(newCat);
});

// Update Category (Admin Only)
app.put("/api/categories/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const idx = db.categories.findIndex((c: any) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "分类不存在" });

  const safeBody = { ...req.body };
  if (safeBody.name) safeBody.name = String(safeBody.name).trim().substring(0, 50);
  if (safeBody.description) safeBody.description = String(safeBody.description).trim().substring(0, 200);

  db.categories[idx] = { ...db.categories[idx], ...safeBody };
  writeDb(db);
  res.json(db.categories[idx]);
});

// Delete Category (Admin Only)
app.delete("/api/categories/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.categories = db.categories.filter((c: any) => c.id !== id);
  
  const fallbackCatId = db.categories[0]?.id || "cat-default";
  db.bookmarks.forEach((bm: any) => {
    if (bm.categoryId === id) {
      bm.categoryId = fallbackCatId;
    }
  });

  writeDb(db);
  res.json({ success: true });
});

// Reorder Categories (Admin Only)
app.post("/api/categories/reorder", requireAuth, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "参数错误：orderedIds 必须为数组" });

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

// Get Bookmarks
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

  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  res.json(list);
});

// Helper for favicon resolution with SSRF checks
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

// Add Bookmark
app.post("/api/bookmarks", (req, res) => {
  const db = readDb();
  const { title, url, description, categoryId, icon, tags, isPinned } = req.body;

  if (!url || !url.trim()) return res.status(400).json({ error: "书签网址不能为空" });

  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = "https://" + normalizedUrl;
  }

  if (!isSafeUrl(normalizedUrl)) {
    return res.status(400).json({ error: "不合法的网址协议，仅支持 http:// 或 https://" });
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
    sortOrder: db.bookmarks.length + 1,
    isPinned: !!isPinned,
    createdAt: new Date().toISOString()
  };

  db.bookmarks.push(newBm);
  writeDb(db);
  res.json(newBm);
});

// Update Bookmark (Admin Only)
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
      return res.status(400).json({ error: "不合法的网址协议" });
    }
    req.body.url = normalizedUrl.substring(0, 2000);
  }

  db.bookmarks[idx] = { ...db.bookmarks[idx], ...req.body };
  writeDb(db);
  res.json(db.bookmarks[idx]);
});

// Delete Bookmark (Admin Only)
app.delete("/api/bookmarks/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.bookmarks = db.bookmarks.filter((b: any) => b.id !== id);
  writeDb(db);
  res.json({ success: true });
});

// Increment Bookmark Clicks
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

// Reorder Bookmarks (Admin Only)
app.post("/api/bookmarks/reorder", requireAuth, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "参数错误：orderedIds 必须为数组" });

  const db = readDb();
  orderedIds.forEach((id: string, idx: number) => {
    const bm = db.bookmarks.find((b: any) => b.id === id);
    if (bm) bm.sortOrder = idx + 1;
  });

  writeDb(db);
  res.json({ success: true });
});

// Browser Extension & Bookmarklet Capture Endpoint
app.post("/api/plugin/capture", (req, res) => {
  const { url, title, description, categoryId, tags } = req.body;
  if (!url) return res.status(400).json({ error: "URL 不能为空" });

  const db = readDb();
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
    sortOrder: db.bookmarks.length + 1,
    isPinned: false,
    createdAt: new Date().toISOString()
  };

  db.bookmarks.push(newBm);
  writeDb(db);
  res.json({ success: true, bookmark: newBm });
});

// ==========================================
// Export & Import Endpoints
// ==========================================

// Export Bookmarks
app.get("/api/export", (req, res) => {
  const { format = "json" } = req.query;
  const db = readDb();

  if (format === "html") {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n`;
    html += `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n`;
    html += `<TITLE>OmniMark Bookmarks Export</TITLE>\n`;
    html += `<H1>Bookmarks</H1>\n`;
    html += `<DL><p>\n`;

    for (const cat of db.categories) {
      html += `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">${cat.name}</H3>\n`;
      html += `    <DL><p>\n`;
      const catBms = db.bookmarks.filter((b: any) => b.categoryId === cat.id);
      for (const bm of catBms) {
        html += `        <DT><A HREF="${bm.url}" ADD_DATE="${Math.floor(Date.now() / 1000)}" ICON="${bm.icon || ''}">${bm.title}</A>\n`;
        if (bm.description) {
          html += `        <DD>${bm.description}\n`;
        }
      }
      html += `    </DL><p>\n`;
    }
    html += `</DL><p>\n`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="bookmarks_export.html"');
    return res.send(html);
  } else {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="omnimark_backup.json"');
    return res.send(JSON.stringify(db, null, 2));
  }
});

// Import Bookmarks (HTML / JSON)
app.post("/api/import", requireAuth, (req, res) => {
  const { type, content, mode = "merge" } = req.body;
  const db = readDb();

  try {
    if (type === "json") {
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      if (mode === "replace") {
        if (parsed.categories && Array.isArray(parsed.categories)) db.categories = parsed.categories;
        if (parsed.bookmarks && Array.isArray(parsed.bookmarks)) db.bookmarks = parsed.bookmarks;
        if (parsed.settings) db.settings = { ...db.settings, ...parsed.settings };
      } else {
        // Merge mode
        if (Array.isArray(parsed.categories)) {
          for (const c of parsed.categories) {
            if (!db.categories.some((item: any) => item.id === c.id || item.name === c.name)) {
              db.categories.push({
                ...c,
                id: c.id || "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
                sortOrder: db.categories.length + 1
              });
            }
          }
        }
        if (Array.isArray(parsed.bookmarks)) {
          for (const b of parsed.bookmarks) {
            if (isSafeUrl(b.url) && !db.bookmarks.some((item: any) => item.url === b.url)) {
              db.bookmarks.push({
                ...b,
                id: b.id || "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
                sortOrder: db.bookmarks.length + 1
              });
            }
          }
        }
      }
      writeDb(db);
      return res.json({ success: true, message: "JSON 备份数据已成功导入并合并" });
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
          const url = linkMatch[1].trim();
          const rawTitle = linkMatch[2] ? linkMatch[2].replace(/<[^>]*>/g, "").trim() : "";
          const title = rawTitle || url;

          if (isSafeUrl(url)) {
            if (!db.bookmarks.some((b: any) => b.url === url)) {
              let targetCat = db.categories.find((c: any) => c.name === currentFolder);
              if (!targetCat) {
                targetCat = {
                  id: "cat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
                  name: currentFolder,
                  icon: "Folder",
                  sortOrder: db.categories.length + 1,
                  description: "从浏览器导入的分类目录"
                };
                db.categories.push(targetCat);
              }

              db.bookmarks.push({
                id: "bm-imp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
                title: title.substring(0, 150),
                url: url.substring(0, 2000),
                description: "从浏览器书签导入",
                categoryId: targetCat.id,
                icon: resolveFavicon(url),
                tags: ["浏览器导入"],
                clicks: 0,
                sortOrder: db.bookmarks.length + 1,
                isPinned: false,
                createdAt: new Date().toISOString()
              });
              importedCount++;
            }
          }
        }
      }

      writeDb(db);
      return res.json({ 
        success: true, 
        message: `成功解析并导入 ${importedCount} 个浏览器书签，已按文件夹自动归类！` 
      });
    } else {
      return res.status(400).json({ error: "不支持的导入格式类型" });
    }
  } catch (err: any) {
    return res.status(500).json({ error: "导入处理失败: " + err.message });
  }
});

// URL Metadata Preview Proxy Endpoint
app.get("/api/metadata", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).json({ error: "URL 不能为空" });

  let normalized = targetUrl.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
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

    if (!response.ok) {
      return res.json({ title: "", description: "", image: "", hostname: new URL(normalized).hostname });
    }

    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Extract meta description
    const descMatch = html.match(/<meta\s+(?:name=["']description["']|property=["']og:description["'])\s+content=["']([^"']+)["']/i) ||
                      html.match(/<meta\s+content=["']([^"']+)["']\s+(?:name=["']description["']|property=["']og:description["'])/i);
    const description = descMatch ? descMatch[1].trim() : "";

    // Extract og:image
    const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                     html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    const image = imgMatch ? imgMatch[1].trim() : "";

    let hostname = "";
    try {
      hostname = new URL(normalized).hostname.replace(/^www\./, "");
    } catch {}

    res.json({
      title,
      description: description.substring(0, 220),
      image,
      hostname,
      url: normalized
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
    version: "1.2.0",
    baseUrl: "/api",
    description: "提供完整的分类、书签 CRUD、拖拽重排、Favicon 本地缓存代理与插件一键采集接口，具备内置 SSRF 防护与速率限制。",
    endpoints: [
      { method: "GET", path: "/api/icon-proxy?domain=:domain&url=:url", description: "网站 Favicon 图标抓取并自动本地持久化缓存代理 (SSRF 防护)" },
      { method: "GET", path: "/api/categories", description: "获取排序后的所有分类列表" },
      { method: "POST", path: "/api/categories", description: "创建新分类 (需管理员权限)" },
      { method: "PUT", path: "/api/categories/:id", description: "更新分类名称、图标及描述 (需管理员权限)" },
      { method: "DELETE", path: "/api/categories/:id", description: "删除分类并安全迁移关联书签 (需管理员权限)" },
      { method: "POST", path: "/api/categories/reorder", description: "分类拖拽批量重排顺序 (需管理员权限)" },
      { method: "GET", path: "/api/bookmarks", description: "获取书签列表 (支持 query 参数: categoryId, search, tag)" },
      { method: "POST", path: "/api/bookmarks", description: "添加新书签并智能解析 Favicon" },
      { method: "PUT", path: "/api/bookmarks/:id", description: "更新书签信息 (需管理员权限)" },
      { method: "DELETE", path: "/api/bookmarks/:id", description: "删除书签 (需管理员权限)" },
      { method: "POST", path: "/api/bookmarks/:id/click", description: "记录书签点击次数与访问热度" },
      { method: "POST", path: "/api/bookmarks/reorder", description: "书签拖拽与上下移批量重排 (需管理员权限)" },
      { method: "POST", path: "/api/plugin/capture", description: "一键网页采集接口 (供浏览器插件或 JS 小书签调用)" },
      { method: "GET", path: "/api/export?format=json|html", description: "导出全量书签数据 (支持浏览器标准 HTML 或 JSON 格式)" },
      { method: "POST", path: "/api/import", description: "智能导入浏览器书签或 JSON 备份并自动归类 (需管理员权限)" },
      { method: "GET", path: "/api/settings", description: "获取公开站点基本配置" },
      { method: "PUT", path: "/api/settings", description: "更新系统配置与修改管理员密码 (需管理员权限)" }
    ]
  });
});

// Global Express Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "服务器内部异常，请稍后再试" });
});

// Vite middleware & static serving
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
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`OmniMark server running on port ${PORT}`);
});
