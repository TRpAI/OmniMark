import React, { useState, useEffect } from "react";
import { Bookmark, Category, SiteSettings, CloudflareSystemStatus } from "../types";
import { safeFetchJson } from "../utils/security";
import { 
  FolderPlus, Plus, Edit, Trash2, ArrowUp, ArrowDown, Settings, 
  BookOpen, Download, Shield, Globe, Star, Sparkles, GripVertical,
  AlertTriangle, CheckCircle2, Cloud, Server, Database, Key, Eye, EyeOff,
  ExternalLink, Cpu, HardDrive, RefreshCw, Copy, Check, Info, Zap
} from "lucide-react";

interface AdminViewProps {
  categories: Category[];
  bookmarks: Bookmark[];
  settings: SiteSettings;
  systemStatus?: CloudflareSystemStatus | null;
  darkMode: boolean;
  onRefreshData: () => void;
  onRefreshSystemStatus?: () => void;
  onOpenBookmarkModal: (bookmark?: Bookmark) => void;
  onOpenCategoryModal: (category?: Category) => void;
  onOpenImportExport: () => void;
  onOpenApiDocs: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  categories,
  bookmarks,
  settings,
  systemStatus,
  darkMode,
  onRefreshData,
  onRefreshSystemStatus,
  onOpenBookmarkModal,
  onOpenCategoryModal,
  onOpenImportExport,
  onOpenApiDocs,
}) => {
  const [activeTab, setActiveTab] = useState<'bookmarks' | 'categories' | 'cloudflare' | 'settings'>('bookmarks');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Settings form state
  const [siteName, setSiteName] = useState(settings.siteName || "");
  const [siteSubtitle, setSiteSubtitle] = useState(settings.siteSubtitle || "");
  const [announcement, setAnnouncement] = useState(settings.announcement || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Cloud & AI API Keys (Write-only buffers for security; secrets never stored in plain state)
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [cfApiToken, setCfApiToken] = useState("");
  const [cfAccountId, setCfAccountId] = useState(settings.cfAccountId || "");
  const [cfD1DatabaseId, setCfD1DatabaseId] = useState(settings.cfD1DatabaseId || "");
  const [cfKvNamespaceId, setCfKvNamespaceId] = useState(settings.cfKvNamespaceId || "");

  // Visibility toggles
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showCfToken, setShowCfToken] = useState(false);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  useEffect(() => {
    setSiteName(settings.siteName || "");
    setSiteSubtitle(settings.siteSubtitle || "");
    setAnnouncement(settings.announcement || "");
    setCfAccountId(settings.cfAccountId || "");
    setCfD1DatabaseId(settings.cfD1DatabaseId || "");
    setCfKvNamespaceId(settings.cfKvNamespaceId || "");
  }, [settings]);

  // Helper for auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem("omnimark_token");
    return {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    };
  };

  // Delete Bookmark
  const handleDeleteBookmark = async (id: string) => {
    if (!window.confirm("确定要删除该书签吗？")) return;
    try {
      const res = await fetch(`/api/bookmarks/${id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm("确定要删除该分类吗？关联的书签将会保留并归属到默认分类。")) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Pin
  const handleTogglePin = async (bm: Bookmark) => {
    try {
      await fetch(`/api/bookmarks/${bm.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isPinned: !bm.isPinned })
      });
      onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  // Reorder Category (Move Up or Down)
  const handleMoveCategory = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const newCategories = [...categories];
    const temp = newCategories[index];
    newCategories[index] = newCategories[targetIndex];
    newCategories[targetIndex] = temp;

    const orderedIds = newCategories.map(c => c.id);
    try {
      await fetch('/api/categories/reorder', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ orderedIds })
      });
      onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  // Reorder Bookmarks (Move Up or Down within current list)
  const handleMoveBookmark = async (bm: Bookmark, direction: 'up' | 'down') => {
    const catBookmarks = bookmarks.filter(b => b.categoryId === bm.categoryId);
    const index = catBookmarks.findIndex(b => b.id === bm.id);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= catBookmarks.length) return;

    const newCatBookmarks = [...catBookmarks];
    const temp = newCatBookmarks[index];
    newCatBookmarks[index] = newCatBookmarks[targetIndex];
    newCatBookmarks[targetIndex] = temp;

    const otherBookmarks = bookmarks.filter(b => b.categoryId !== bm.categoryId);
    const updatedFullList = [...otherBookmarks, ...newCatBookmarks];
    const orderedIds = updatedFullList.map(b => b.id);

    try {
      await fetch('/api/bookmarks/reorder', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ orderedIds })
      });
      onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  // Save Settings including Gemini Key & Cloudflare Tokens (write-only)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsMsg(null);
    try {
      const body: any = { 
        siteName, 
        siteSubtitle, 
        announcement,
        cfAccountId,
        cfD1DatabaseId,
        cfKvNamespaceId
      };
      // Only transmit new API key/token if explicitly filled by admin
      if (geminiApiKey.trim()) {
        body.geminiApiKey = geminiApiKey.trim();
      }
      if (cfApiToken.trim()) {
        body.cfApiToken = cfApiToken.trim();
      }
      if (newPassword) {
        if (newPassword.length < 12) {
          setSettingsMsg({ type: 'error', text: "新密码长度至少需要 12 位（推荐配合密码管理器使用强密码）" });
          return;
        }
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const data = await safeFetchJson(res, { error: "解析响应数据失败" });
      if (res.ok) {
        setSettingsMsg({ type: 'success', text: "系统设置已成功保存！" });
        setCurrentPassword("");
        setNewPassword("");
        setGeminiApiKey("");
        setCfApiToken("");
        onRefreshData();
      } else {
        setSettingsMsg({ type: 'error', text: data.error || "保存设置失败" });
      }
    } catch (err: any) {
      setSettingsMsg({ type: 'error', text: err.message || "请求发生异常" });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleCopyWranglerConfig = () => {
    const tomlSnippet = `# wrangler.toml 生产环境绑定配置
name = "omnimark"
main = "worker.ts"
compatibility_date = "2024-09-01"
pages_build_output_dir = "dist"

# 1. Cloudflare D1 数据库持久化绑定
[[d1_databases]]
binding = "DB"
database_name = "omnimark-d1"
database_id = "${cfD1DatabaseId || "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}"

# 2. Cloudflare KV 边缘高速缓存绑定
[[kv_namespaces]]
binding = "CACHE_KV"
id = "${cfKvNamespaceId || "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}"`;

    navigator.clipboard.writeText(tomlSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2500);
  };

  const triggerRefreshStatus = async () => {
    setIsRefreshingStatus(true);
    if (onRefreshSystemStatus) {
      await onRefreshSystemStatus();
    }
    setTimeout(() => setIsRefreshingStatus(false), 600);
  };

  const filteredBookmarks = bookmarks.filter(b => {
    const matchCat = selectedCategoryFilter === "all" || b.categoryId === selectedCategoryFilter;
    const matchSearch = !searchTerm || 
      b.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      b.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.description && b.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchCat && matchSearch;
  });

  const d1Missing = systemStatus && !systemStatus.d1Bound;
  const kvMissing = systemStatus && !systemStatus.kvBound;
  const hasBindingWarning = d1Missing || kvMissing;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6 space-y-6">
      
      {/* Header Banner */}
      <div className={`p-5 sm:p-6 rounded-3xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
        darkMode 
          ? "bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-slate-800 text-white" 
          : "bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-slate-800"
      }`}>
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[11px] font-semibold whitespace-nowrap">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>Cloudflare Serverless 架构管理中心</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">站点后台管理</h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            专注 Cloudflare 原生部署架构：Pages 前端托管 · Workers 边缘服务 · D1 关系型存储 · KV 边缘加速。
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            onClick={() => onOpenImportExport()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium backdrop-blur whitespace-nowrap leading-none text-white border border-white/10"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>备份与导入</span>
          </button>
          <button
            onClick={() => onOpenApiDocs()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium backdrop-blur whitespace-nowrap leading-none text-white border border-white/10"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>API 文档</span>
          </button>
        </div>
      </div>

      {/* Cloudflare D1 & KV Binding Global Notice (Prominent Warning) */}
      {hasBindingWarning && (
        <div className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 transition-all space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs flex-1">
              <h3 className="font-bold text-sm text-amber-800 dark:text-amber-300">
                Cloudflare 边缘资源绑定检测提醒
              </h3>
              <p className="leading-relaxed opacity-90">
                系统检测到当前 Cloudflare 环境中存在尚未绑定的核心存储服务。若直接部署在 Cloudflare Pages / Workers 上，未绑定的服务将影响数据持久化与缓存：
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {d1Missing && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                    <span className="font-bold text-rose-600 dark:text-rose-400">❌ D1 数据库未绑定 (env.DB 缺失)</span>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      数据修改将无法持久保存。请在 Cloudflare 控制台或 wrangler.toml 中绑定 D1 (变量名: <code className="font-mono font-bold">DB</code>)。
                    </p>
                  </div>
                )}
                {kvMissing && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                    <span className="font-bold text-amber-600 dark:text-amber-400">⚠️ KV 缓存未绑定 (env.CACHE_KV 缺失)</span>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      边缘高速缓存未激活。建议在控制台绑定 KV 命名空间 (变量名: <code className="font-mono font-bold">CACHE_KV</code>) 削减 D1 读配额。
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setActiveTab('cloudflare')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors shrink-0 shadow-sm"
            >
              <span>查看绑定教程</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('bookmarks')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap leading-none transition-all shrink-0 ${
            activeTab === 'bookmarks'
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 font-bold"
              : darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span>书签管理 ({bookmarks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap leading-none transition-all shrink-0 ${
            activeTab === 'categories'
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 font-bold"
              : darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <FolderPlus className="w-4 h-4 shrink-0" />
          <span>分类管理 ({categories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('cloudflare')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap leading-none transition-all shrink-0 ${
            activeTab === 'cloudflare'
              ? "bg-amber-600 text-white shadow-md shadow-amber-500/20 font-bold"
              : darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Cloud className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Cloudflare 免费额度与状态</span>
          {hasBindingWarning ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500 text-white font-bold leading-none">
              需绑定
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold leading-none">
              正常
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap leading-none transition-all shrink-0 ${
            activeTab === 'settings'
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 font-bold"
              : darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>系统设置与密钥</span>
        </button>
      </div>

      {/* Tab 1: Bookmarks Management */}
      {activeTab === 'bookmarks' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <input
                type="text"
                placeholder="搜索标题、网址或描述..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`h-9 px-3.5 rounded-xl border text-xs outline-none w-full sm:w-64 transition-all ${
                  darkMode ? "bg-slate-800/80 border-slate-700 text-white focus:border-blue-500" : "bg-white border-slate-200 focus:border-blue-500"
                }`}
              />
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className={`h-9 px-3 rounded-xl border text-xs outline-none transition-all ${
                  darkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                <option value="all">全部分类 ({bookmarks.length})</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => onOpenBookmarkModal()}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>添加新书签</span>
            </button>
          </div>

          {/* Bookmarks List Table */}
          <div className={`border rounded-2xl overflow-hidden ${
            darkMode ? "border-slate-800 bg-slate-900/30" : "border-slate-200 bg-white"
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className={`border-b text-slate-400 font-semibold ${
                  darkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-100 bg-slate-50"
                }`}>
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">置顶</th>
                    <th className="py-3 px-4">书签信息</th>
                    <th className="py-3 px-4">分类</th>
                    <th className="py-3 px-4 text-center">热度</th>
                    <th className="py-3 px-4 text-center">排序</th>
                    <th className="py-3 px-4 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredBookmarks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        暂无匹配的书签数据
                      </td>
                    </tr>
                  ) : (
                    filteredBookmarks.map((bm) => {
                      const cat = categories.find(c => c.id === bm.categoryId);
                      return (
                        <tr key={bm.id} className="hover:bg-slate-500/5 transition-colors">
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleTogglePin(bm)}
                              className={`p-1 rounded-lg transition-colors ${
                                bm.isPinned 
                                  ? "text-amber-500 hover:text-amber-600 bg-amber-500/10" 
                                  : "text-slate-300 dark:text-slate-600 hover:text-slate-400"
                              }`}
                              title={bm.isPinned ? "取消置顶" : "设为置顶推荐"}
                            >
                              <Star className={`w-4 h-4 ${bm.isPinned ? "fill-amber-500" : ""}`} />
                            </button>
                          </td>
                          <td className="py-3 px-4 max-w-xs sm:max-w-md">
                            <div className="flex items-center gap-2.5">
                              {bm.icon ? (
                                <img 
                                  src={bm.icon} 
                                  alt="" 
                                  className="w-5 h-5 rounded-md shrink-0 object-contain"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <a 
                                  href={bm.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="font-medium hover:text-blue-500 truncate block transition-colors"
                                >
                                  {bm.title}
                                </a>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {bm.url}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {cat?.name || "默认分类"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-slate-400 font-mono">
                            {bm.clicks || 0}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleMoveBookmark(bm, 'up')}
                                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                title="上移"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveBookmark(bm, 'down')}
                                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                title="下移"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => onOpenBookmarkModal(bm)}
                                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400 transition-colors"
                                title="编辑书签"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteBookmark(bm.id)}
                                className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-500 transition-colors"
                                title="删除书签"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Categories Management */}
      {activeTab === 'categories' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              共 {categories.length} 个分类，支持自定义分类名称与快捷排序。
            </p>
            <button
              onClick={() => onOpenCategoryModal()}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>新建分类</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((cat, index) => {
              const count = bookmarks.filter(b => b.categoryId === cat.id).length;
              return (
                <div
                  key={cat.id}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                    darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
                      {cat.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs truncate">{cat.name}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {count} 个书签
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMoveCategory(index, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                      title="上移"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveCategory(index, 'down')}
                      disabled={index === categories.length - 1}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                      title="下移"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onOpenCategoryModal(cat)}
                      className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                      title="编辑"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Cloudflare Free Quota & Binding Status */}
      {activeTab === 'cloudflare' && (
        <div className="space-y-6">
          
          {/* Status Diagnostic Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border ${
            darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
          } space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-amber-500" />
                  <span>Cloudflare 运行环境与边缘绑定诊断</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  当前应用已全面针对 Cloudflare Pages + Workers + D1 + KV 架构深度优化
                </p>
              </div>

              <button
                onClick={triggerRefreshStatus}
                disabled={isRefreshingStatus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? "animate-spin" : ""}`} />
                <span>重新检测绑定状态</span>
              </button>
            </div>

            {/* Service Status Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Pages */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Cloudflare Pages</span>
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> 就绪
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">静态 UI 资源构建 (dist/)</p>
              </div>

              {/* Workers */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Cloudflare Workers</span>
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> 就绪
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">无服务器边缘 API 路由 (/api/*)</p>
              </div>

              {/* D1 Database */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Cloudflare D1 数据库</span>
                  {systemStatus?.d1Bound ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> 已连接
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 font-semibold">
                      <AlertTriangle className="w-3 h-3" /> 未绑定
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">关系型数据持久化 (env.DB)</p>
              </div>

              {/* KV Cache */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Cloudflare KV 缓存</span>
                  {systemStatus?.kvBound ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> 已激活
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-semibold">
                      <AlertTriangle className="w-3 h-3" /> 未绑定
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">边缘键值高速缓存 (env.CACHE_KV)</p>
              </div>
            </div>
          </div>

          {/* Cloudflare Official Free Tier Quotas Display */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Cloudflare 官方免费额度概览 (Free Tier Quotas)</span>
              </h3>
              <span className="text-[11px] text-slate-400">每日 00:00 UTC 自动重置</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Card 1: Workers */}
              <div className={`p-5 rounded-3xl border space-y-3 ${
                darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs">Cloudflare Workers</h4>
                      <p className="text-[10px] text-slate-400">边缘无服务器计算引擎</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    免费版 Free
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">每日免费请求</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">100,000 次 / 天</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">CPU 执行时长限制</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">10ms / 单次请求</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-500">最大并发连接</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">1,000 并发</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                  全球 330+ 节点毫秒级响应，等待网络 I/O 期间不计入 CPU 消耗。
                </p>
              </div>

              {/* Card 2: D1 Database */}
              <div className={`p-5 rounded-3xl border space-y-3 ${
                darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs">Cloudflare D1 数据库</h4>
                      <p className="text-[10px] text-slate-400">Serverless 分布式关系数据库</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    免费版 Free
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">每日读取行数</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">5,000,000 行 / 天</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">每日写入行数</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">100,000 行 / 天</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">免费存储空间</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">5 GB 空间</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-500">数据库实例配额</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">10 个数据库</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                  底层基于 SQLite，零冷启动。通过配合 KV 缓存可将读配额消耗降至极低。
                </p>
              </div>

              {/* Card 3: KV Cache */}
              <div className={`p-5 rounded-3xl border space-y-3 ${
                darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold">
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs">Cloudflare KV 键值缓存</h4>
                      <p className="text-[10px] text-slate-400">全球边缘高并发低延迟存储</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    免费版 Free
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">每日读取操作</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">100,000 次 / 天</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">每日写入操作</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">1,000 次 / 天</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">每日删除操作</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">1,000 次 / 天</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-500">存储容量上限</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">1 GB 容量</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                  用于全站书签缓存 (120s TTL) 与网页预览元数据缓存 (24h TTL)。
                </p>
              </div>

              {/* Card 4: Pages */}
              <div className={`p-5 rounded-3xl border space-y-3 ${
                darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs">Cloudflare Pages</h4>
                      <p className="text-[10px] text-slate-400">全球现代化前端静态托管</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    免费版 Free
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">前端静态请求数</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">无限次 (Unlimited)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">带宽与流量费用</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">完全免费无限制</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">CI/CD 构建配额</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">500 次构建 / 月</span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-500">CDN 与 SSL 证书</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">全自动 Anycast + HTTPS</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                  一键连接 GitHub 仓库，静态输出目录填入 <code className="font-mono">dist</code> 即可全自动化构建。
                </p>
              </div>

            </div>
          </div>

          {/* Cloudflare Dashboard Binding Guide */}
          <div className={`p-5 rounded-3xl border space-y-4 ${
            darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
          }`}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs flex items-center gap-1.5">
                <Server className="w-4 h-4 text-blue-500" />
                <span>Cloudflare 控制台面板图形化绑定指引（推荐·无需修改代码）</span>
              </h4>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-semibold">
                面板可视化管理
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                <div>
                  <strong className="text-slate-800 dark:text-slate-200">在 Cloudflare 面板创建数据库与缓存：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    前往左侧「存储和数据库」→ 分别创建 D1 数据库（如 <code className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">omnimark-d1</code>）和 KV 命名空间（如 <code className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">CACHE_KV</code>）。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div>
                  <strong className="text-slate-800 dark:text-slate-200">进入 Pages 项目设置：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    在「Workers 和 Pages」中打开您的项目 → 点击顶部的 <strong>设置 (Settings)</strong> → 左侧选择 <strong>函数 (Functions)</strong> 或 <strong>绑定 (Bindings)</strong>。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                <div>
                  <strong className="text-slate-800 dark:text-slate-200">添加两个关键绑定：</strong>
                  <div className="mt-1 space-y-1 text-[11px]">
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono">
                      • <strong>D1 数据库绑定</strong>：变量名填 <span className="text-blue-500 font-bold">DB</span>，下拉选择您的 D1 数据库。
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono">
                      • <strong>KV 命名空间绑定</strong>：变量名填 <span className="text-purple-500 font-bold">CACHE_KV</span>，下拉选择您的 KV 命名空间。
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">4</span>
                <div>
                  <strong className="text-slate-800 dark:text-slate-200">重试部署生效：</strong>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    保存后，在「部署 (Deployments)」选项卡点击最新部署右侧的「···」→ 选择「重试部署 (Retry deployment)」，系统即可自动挂载，永久无需修改任何本地文件！
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Tab 4: System Settings & Secret Keys */}
      {activeTab === 'settings' && (
        <div className="w-full max-w-full overflow-hidden bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-sm transition-all box-border">
          <form onSubmit={handleSaveSettings} className="space-y-6 w-full max-w-full box-border">
            <div className="border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100">
                系统配置与云端安全密钥
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                统一配置站点信息、Google Gemini AI 密钥及 Cloudflare 边缘绑定参数
              </p>
            </div>

            {settingsMsg && (
              <div className={`p-3.5 rounded-xl text-xs font-medium ${
                settingsMsg.type === 'success' 
                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
              }`}>
                {settingsMsg.text}
              </div>
            )}

            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                1. 站点基础信息
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">站点名称</label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm outline-none transition-all ${
                      darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                    }`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">副标题 / 描述</label>
                  <input
                    type="text"
                    value={siteSubtitle}
                    onChange={(e) => setSiteSubtitle(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm outline-none transition-all ${
                      darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">顶部公告信息 (可选)</label>
                <input
                  type="text"
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="例如：系统已成功迁移至 Cloudflare 边缘全托管架构！"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm outline-none transition-all ${
                    darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                  }`}
                />
              </div>
            </div>

            {/* Cloud & AI API Tokens */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500 shrink-0" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                  2. AI 与 Cloudflare 专属密钥配置
                </h4>
              </div>

              {/* Zero-Leakage Architecture Guidance */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs leading-relaxed space-y-2">
                <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold">
                  <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>服务端零泄漏安全架构</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-normal">
                  系统遵循最高安全准则：敏感 API 密钥存储于服务端环境或安全配置中，<strong>绝不会将明文 Secret 反向回传给浏览器</strong>。
                  在 Cloudflare 生产部署时，推荐直接使用 Worker Secrets 注入，实现密钥完全零落库运行：
                </p>
                <div className="p-2.5 rounded-lg bg-slate-950 text-slate-200 font-mono text-[11px] space-y-1 select-all border border-slate-800">
                  <div className="text-emerald-400"># Cloudflare Worker Secrets 注入命令：</div>
                  <div>npx wrangler secret put GEMINI_API_KEY</div>
                  <div>npx wrangler secret put CLOUDFLARE_API_TOKEN</div>
                </div>
              </div>

              {/* Gemini Key */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Google Gemini API Key</label>
                    {settings.hasGeminiApiKey ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> 已配置就绪 (安全模式)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        未配置
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-blue-500">Gemini 2.5 Flash 智能推荐引擎</span>
                </div>
                <div className="relative">
                  <input
                    type={showGeminiKey ? "text" : "password"}
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder={settings.hasGeminiApiKey ? "•••••••••••••••••••• (已就绪，若需更新请输入新密钥)" : "例如: AIzaSy... (输入以设置密钥)"}
                    className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl border text-xs font-mono outline-none transition-all ${
                      darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  配置后，添加书签时可自动调用 Gemini 2.5 语义模型进行智能分类推荐与标签生成。
                </p>
              </div>

              {/* Cloudflare API Token */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Cloudflare API Token</label>
                    {settings.hasCfApiToken ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> 已配置就绪 (安全模式)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        未配置
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-amber-500">Workers / D1 / KV 远程管理</span>
                </div>
                <div className="relative">
                  <input
                    type={showCfToken ? "text" : "password"}
                    value={cfApiToken}
                    onChange={(e) => setCfApiToken(e.target.value)}
                    placeholder={settings.hasCfApiToken ? "•••••••••••••••••••• (已就绪，若需更新请输入新令牌)" : "具有 Workers, D1 与 KV 读写权限的 Cloudflare API 令牌"}
                    className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl border text-xs font-mono outline-none transition-all ${
                      darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCfToken(!showCfToken)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showCfToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Cloudflare Account ID & Resource IDs */}
              <div className="space-y-3 pt-1">
                <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/40 text-xs leading-relaxed text-blue-800 dark:text-blue-300">
                  <span className="font-bold">💡 D1 与 KV 云端绑定说明：</span>
                  您无需在 <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 font-mono text-[11px]">wrangler.toml</code> 中手动填入 UUID。请在此处填入您在 Cloudflare 创建的 D1 数据库 UUID 和 KV 命名空间 ID，点击下方保存即可自动持久化至后台系统配置；同时在 Cloudflare Pages/Workers 控制台面板的「函数/绑定」中分别绑定变量名 <code className="font-bold font-mono">DB</code> 与 <code className="font-bold font-mono">CACHE_KV</code>。
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 truncate">
                      Cloudflare Account ID (账户 ID)
                    </label>
                    <input
                      type="text"
                      value={cfAccountId}
                      onChange={(e) => setCfAccountId(e.target.value)}
                      placeholder="例如: 32位十六进制账户 ID"
                      className={`w-full min-w-0 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-mono outline-none transition-all ${
                        darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                      }`}
                    />
                  </div>

                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 truncate">
                      D1 Database UUID (数据库 ID)
                    </label>
                    <input
                      type="text"
                      value={cfD1DatabaseId}
                      onChange={(e) => setCfD1DatabaseId(e.target.value)}
                      placeholder="例如: 8a4c1234-5678-4abc-9def-..."
                      className={`w-full min-w-0 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-mono outline-none transition-all ${
                        darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                      }`}
                    />
                  </div>

                  <div className="w-full md:col-span-2 xl:col-span-1">
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 truncate">
                      KV Namespace ID (命名空间 ID)
                    </label>
                    <input
                      type="text"
                      value={cfKvNamespaceId}
                      onChange={(e) => setCfKvNamespaceId(e.target.value)}
                      placeholder="例如: 32位十六进制命名空间 ID"
                      className={`w-full min-w-0 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-mono outline-none transition-all ${
                        darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Password Management */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                3. 管理员安全密码设置
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">当前密码 (验证)</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="修改密码时填写"
                    className={`w-full min-w-0 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm outline-none transition-all ${
                      darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                    }`}
                  />
                </div>
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">设置新密码</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="输入新密码 (建议不少于12位高强度密码)"
                    className={`w-full min-w-0 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm outline-none transition-all ${
                      darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={settingsLoading}
                className={`w-full sm:w-auto h-11 inline-flex items-center justify-center px-8 rounded-xl bg-blue-600 text-white text-xs sm:text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50 whitespace-nowrap gap-2 ${
                  settingsLoading ? "cursor-wait" : ""
                }`}
              >
                {settingsLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>保存配置中...</span>
                  </>
                ) : (
                  <span>保存系统配置与密钥</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
