import { Category, Bookmark } from "../types";

export interface CategoryRecommendation {
  category: Category;
  confidence: number; // 0 - 100
  reason: string;
  isStrongMatch: boolean;
}

// Domain and keyword semantic taxonomy
const DOMAIN_KEYWORD_MAP: Record<string, { tags: string[]; domains: string[]; keywords: string[] }> = {
  dev: {
    tags: ["开发", "编程", "代码", "运维", "架构", "技术", "云原生", "dev", "code", "ops"],
    domains: [
      "github.com", "gitlab.com", "gitee.com", "stackoverflow.com", "npmjs.com", 
      "vercel.com", "netlify.com", "docker.com", "kubernetes.io", "cloudflare.com", 
      "aws.amazon.com", "aliyun.com", "tencent.com", "python.org", "rust-lang.org",
      "golang.org", "react.dev", "vuejs.org", "angular.dev", "svelte.dev",
      "nextjs.org", "nuxtjs.org", "tailwindcss.com", "nodejs.org", "deno.com",
      "bun.sh", "typescriptlang.org", "postman.com", "swagger.io", "v2ex.com",
      "jetbrains.com", "cursor.com", "developer.mozilla.org", "w3schools.com",
      "redis.io", "postgresql.org", "mysql.com", "mongodb.com", "sqlite.org",
      "nginx.org", "caddyserver.com", "git-scm.com", "linux.org", "kernel.org"
    ],
    keywords: [
      "git", "repo", "api", "code", "dev", "develop", "stack", "npm", "docker", 
      "cloud", "deploy", "server", "db", "database", "sql", "linux", "terminal", 
      "script", "rust", "python", "golang", "react", "vue", "node", "typescript"
    ],
  },
  ai: {
    tags: ["ai", "智能", "大模型", "人工智能", "前沿", "llm", "gpt", "prompt", "agent"],
    domains: [
      "openai.com", "chatgpt.com", "claude.ai", "anthropic.com", "gemini.google.com",
      "deepseek.com", "kimi.moonshot.cn", "huggingface.co", "hf.co", "midjourney.com",
      "coze.cn", "coze.com", "dify.ai", "ollama.com", "groq.com", "perplexity.ai",
      "mistral.ai", "suno.com", "runwayml.com", "civitai.com", "poe.com", "ai.studio"
    ],
    keywords: [
      "ai", "gpt", "chatgpt", "claude", "deepseek", "gemini", "openai", "agent", 
      "llm", "model", "prompt", "diffusion", "neural", "bot", "copilot", "intelligence"
    ],
  },
  design: {
    tags: ["设计", "灵感", "素材", "ui", "ux", "创意", "配色", "字体", "图标", "design"],
    domains: [
      "figma.com", "dribbble.com", "behance.net", "unsplash.com", "pixabay.com",
      "pexels.com", "freepik.com", "flaticon.com", "iconfont.cn", "canva.com",
      "pinterest.com", "artstation.com", "sketch.com", "adobe.com", "awwwards.com",
      "muz.li", "colorhunt.co", "coolors.co", "fonts.google.com", "spline.design"
    ],
    keywords: [
      "design", "ui", "ux", "icon", "icons", "font", "fonts", "color", "colors", 
      "palette", "palette", "gradient", "svg", "vector", "art", "creative", 
      "illustration", "mockup", "3d", "render", "sketch", "figma"
    ],
  },
  learn: {
    tags: ["学习", "社区", "阅读", "博客", "文档", "论坛", "教程", "资讯", "learn", "community"],
    domains: [
      "juejin.cn", "zhihu.com", "reddit.com", "medium.com", "segmentfault.com",
      "csdn.net", "oschina.net", "wikipedia.org", "bilibili.com", "youtube.com",
      "coursera.org", "udemy.com", "arxiv.org", "substack.com", "news.ycombinator.com",
      "dev.to", "infoq.cn", "sspai.com", "36kr.com", "huxiu.com"
    ],
    keywords: [
      "learn", "doc", "docs", "documentation", "wiki", "tutorial", "book", "read", 
      "blog", "article", "paper", "news", "forum", "community", "course", "study", "guide"
    ],
  },
  office: {
    tags: ["办公", "协作", "效率", "工具", "笔记", "协同", "日常", "office", "tool"],
    domains: [
      "notion.so", "feishu.cn", "larksuite.com", "dingtalk.com", "slack.com",
      "trello.com", "jira.atlassian.com", "linear.app", "asana.com", "ticktick.com",
      "obsidian.md", "logseq.com", "yuque.com", "docs.google.com", "sheets.google.com",
      "drive.google.com", "zoom.us", "airtable.com", "miro.com", "wolai.com"
    ],
    keywords: [
      "office", "work", "doc", "sheet", "note", "task", "project", "collab", 
      "calendar", "mail", "meeting", "tool", "workspace", "efficiency"
    ],
  },
};

/**
 * Parses URL safely and returns clean hostname, SLD, and path tokens
 */
function parseUrlDetails(rawUrl: string): { hostname: string; sld: string; tokens: string[] } | null {
  let urlStr = rawUrl.trim();
  if (!urlStr) return null;

  if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
    urlStr = "https://" + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".");
    // e.g. github.com -> sld is github; chat.deepseek.com -> sld deepseek; juejin.cn -> juejin
    let sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    if (parts.length >= 3 && (parts[parts.length - 1] === "cn" || parts[parts.length - 1] === "uk") && parts[parts.length - 2] === "com") {
      sld = parts[parts.length - 3];
    }

    const pathSegments = parsed.pathname
      .toLowerCase()
      .split(/[/_-]+/)
      .filter((s) => s.length > 2);

    const hostSegments = hostname
      .split(/[.-]+/)
      .filter((s) => s.length > 1 && s !== "com" && s !== "org" && s !== "net" && s !== "io" && s !== "cn");

    const tokens = Array.from(new Set([...hostSegments, ...pathSegments]));

    return { hostname, sld, tokens };
  } catch {
    return null;
  }
}

/**
 * Evaluates the best matching Category for a given URL and Title
 */
export function recommendCategoryForUrl({
  url,
  title = "",
  categories,
  bookmarks = [],
}: {
  url: string;
  title?: string;
  categories: Category[];
  bookmarks?: Bookmark[];
}): CategoryRecommendation | null {
  if (!url || categories.length === 0) return null;

  const urlDetails = parseUrlDetails(url);
  if (!urlDetails) return null;

  const { hostname, sld, tokens } = urlDetails;
  const titleLower = (title || "").toLowerCase();

  const scores: Map<string, { score: number; reason: string }> = new Map();
  categories.forEach((cat) => scores.set(cat.id, { score: 0, reason: "" }));

  // Stage 1: Learn from existing bookmarks (History-driven matching)
  if (bookmarks && bookmarks.length > 0) {
    const categoryDomainCounts: Record<string, number> = {};
    const categorySldCounts: Record<string, number> = {};

    for (const bm of bookmarks) {
      if (!bm.url || !bm.categoryId) continue;
      const bDetails = parseUrlDetails(bm.url);
      if (!bDetails) continue;

      if (bDetails.hostname === hostname) {
        categoryDomainCounts[bm.categoryId] = (categoryDomainCounts[bm.categoryId] || 0) + 1;
      } else if (bDetails.sld === sld && sld.length > 2) {
        categorySldCounts[bm.categoryId] = (categorySldCounts[bm.categoryId] || 0) + 1;
      }
    }

    // Exact domain match from history is the highest confidence indicator
    for (const [catId, count] of Object.entries(categoryDomainCounts)) {
      if (scores.has(catId)) {
        const cur = scores.get(catId)!;
        const add = Math.min(100, 70 + count * 15);
        if (add > cur.score) {
          scores.set(catId, {
            score: cur.score + add,
            reason: `匹配历史已存站点 (${hostname})`,
          });
        }
      }
    }

    // Sub-level domain match from history
    for (const [catId, count] of Object.entries(categorySldCounts)) {
      if (scores.has(catId)) {
        const cur = scores.get(catId)!;
        const add = Math.min(60, 40 + count * 10);
        if (add > cur.score) {
          scores.set(catId, {
            score: cur.score + add,
            reason: cur.reason || `匹配同主域历史站点 (${sld})`,
          });
        }
      }
    }
  }

  // Stage 2: Match against category taxonomy & metadata
  categories.forEach((cat) => {
    const catName = cat.name.toLowerCase();
    const catDesc = (cat.description || "").toLowerCase();
    let catScore = 0;
    let matchReason = "";

    // A. Check if the URL token or sld directly contains category name substrings
    for (const token of tokens) {
      if (catName.includes(token) || (token.length >= 3 && catDesc.includes(token))) {
        catScore += 45;
        matchReason = `匹配分类特征词「${token}」`;
      }
    }

    if (titleLower) {
      if (catName.includes(titleLower) || (titleLower.length >= 2 && catDesc.includes(titleLower))) {
        catScore += 35;
        matchReason = matchReason || `匹配标题特征「${title}」`;
      }
    }

    // B. Semantic Taxonomies match against Category Name & Description
    for (const [theme, taxonomy] of Object.entries(DOMAIN_KEYWORD_MAP)) {
      const isCatMatchedToTheme = taxonomy.tags.some(
        (t) => catName.includes(t) || catDesc.includes(t)
      );

      if (isCatMatchedToTheme) {
        // Check exact domain match in taxonomy
        if (taxonomy.domains.includes(hostname)) {
          catScore += 75;
          matchReason = `根据知名域名 (${hostname}) 匹配「${cat.name}」`;
        } else if (taxonomy.domains.some((d) => d.includes(sld) || hostname.endsWith(d))) {
          catScore += 55;
          matchReason = `根据相关域名 (${sld}) 匹配「${cat.name}」`;
        }

        // Check keyword hits in tokens or title
        for (const kw of taxonomy.keywords) {
          if (tokens.includes(kw) || titleLower.includes(kw)) {
            catScore += 30;
            matchReason = matchReason || `包含「${cat.name}」典型关键词 (${kw})`;
            break;
          }
        }
      }
    }

    // Default general/recommendation category fallback bonus if name contains 常用 or 推荐
    if ((catName.includes("常用") || catName.includes("推荐")) && catScore < 20) {
      catScore += 10;
      if (!matchReason) matchReason = "作为常用基础分类备选";
    }

    const cur = scores.get(cat.id)!;
    scores.set(cat.id, {
      score: cur.score + catScore,
      reason: cur.reason || matchReason,
    });
  });

  // Pick top scoring category
  let bestCategory: Category | null = null;
  let highestScore = 0;
  let bestReason = "";

  scores.forEach(({ score, reason }, catId) => {
    if (score > highestScore) {
      highestScore = score;
      bestReason = reason;
      bestCategory = categories.find((c) => c.id === catId) || null;
    }
  });

  if (!bestCategory || highestScore < 30) {
    return null;
  }

  // Calculate confidence percentage
  const confidence = Math.min(99, Math.max(55, Math.round(50 + highestScore * 0.45)));

  return {
    category: bestCategory,
    confidence,
    reason: bestReason || `智能匹配「${(bestCategory as Category).name}」`,
    isStrongMatch: confidence >= 70,
  };
}
