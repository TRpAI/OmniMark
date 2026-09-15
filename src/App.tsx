import React, { useState, useEffect } from "react";
import { Bookmark, Category, SiteSettings, ViewMode, CloudflareSystemStatus } from "./types";
import { Navbar } from "./components/Navbar";
import { FrontendView } from "./components/FrontendView";
import { AdminView } from "./components/AdminView";
import { SkeletonScreen } from "./components/SkeletonScreen";
import { BookmarkModal } from "./components/BookmarkModal";
import { CategoryModal } from "./components/CategoryModal";
import { ImportExportModal } from "./components/ImportExportModal";
import { ApiDocsModal } from "./components/ApiDocsModal";
import { BookmarkletModal } from "./components/BookmarkletModal";
import { LoginModal } from "./components/LoginModal";
import { AlertTriangle, X, Cloud, Zap } from "lucide-react";

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "OmniMark 站点导航与书签系统",
    siteSubtitle: "现代化极简站点导航与书签管理系统",
    adminPasswordHash: "admin123",
    defaultViewMode: "grid",
    allowPublicSubmit: false,
    enableWeather: true,
    enableSearchEngine: true,
    defaultSearchEngine: "google",
  });

  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [systemStatus, setSystemStatus] = useState<CloudflareSystemStatus | null>(null);
  const [showBindingNotice, setShowBindingNotice] = useState<boolean>(true);

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem("omnimark_view_mode");
    if (saved === "grid" || saved === "list" || saved === "bento" || saved === "compact") {
      return saved;
    }
    return "grid";
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("omnimark_view_mode", mode);
  };

  // Modal states
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isApiDocsOpen, setIsApiDocsOpen] = useState(false);
  const [isBookmarkletOpen, setIsBookmarkletOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Load system and CF binding status
  const loadSystemStatus = async () => {
    try {
      const res = await fetch("/api/system/status");
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
      }
    } catch (err) {
      console.error("Failed to load system status:", err);
    }
  };

  // Fetch all data
  const loadData = async (isInitial = false) => {
    if (isInitial) {
      setIsLoading(true);
    }
    try {
      const [catRes, bmRes, setRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/bookmarks"),
        fetch("/api/settings"),
      ]);

      if (catRes.status === 401 || bmRes.status === 401 || setRes.status === 401) {
        localStorage.removeItem("omnimark_token");
        setIsLoggedIn(false);
        setAuthToken(null);
        setIsLoginOpen(true);
        return;
      }

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData);
      }
      if (bmRes.ok) {
        const bmData = await bmRes.json();
        setBookmarks(bmData);
      }
      if (setRes.ok) {
        const setData = await setRes.json();
        setSettings(setData);
        if (setData.defaultViewMode) {
          setViewMode(setData.defaultViewMode);
        }
      }
    } catch (err) {
      console.error("Failed to load app data:", err);
    } finally {
      setIsLoading(false);
      loadSystemStatus();
    }
  };

  useEffect(() => {
    loadData(true);
    const token = localStorage.getItem("omnimark_token");
    if (token) {
      setIsLoggedIn(true);
      setAuthToken(token);
    }

    // Polling mechanism (every 15 seconds) to ensure UI state is synchronized with D1 database
    const pollInterval = setInterval(() => {
      loadData(false);
    }, 15000);

    return () => clearInterval(pollInterval);
  }, []);

  // Sync document title with site settings
  useEffect(() => {
    if (settings.siteName) {
      document.title = settings.siteName;
    }
  }, [settings.siteName]);

  // Apply dark mode class to html root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const handleBookmarkClick = async (id: string, url: string) => {
    try {
      await fetch(`/api/bookmarks/${id}/click`, { method: "POST" });
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoginSuccess = (token: string) => {
    setIsLoggedIn(true);
    setAuthToken(token);
    localStorage.setItem("omnimark_token", token);
    setIsAdminMode(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setAuthToken(null);
    localStorage.removeItem("omnimark_token");
    setIsAdminMode(false);
  };

  const openBookmarkModal = (bm?: Bookmark) => {
    setEditingBookmark(bm || null);
    setIsBookmarkModalOpen(true);
  };

  const openCategoryModal = (cat?: Category) => {
    setEditingCategory(cat || null);
    setIsCategoryModalOpen(true);
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      darkMode ? "bg-slate-950 text-slate-100" : "bg-[#f8fafc] text-slate-900"
    }`}>
      
      {/* Cloudflare Binding Notice Banner (when D1 or KV are missing) */}
      {systemStatus && (!systemStatus.d1Bound || !systemStatus.kvBound) && showBindingNotice && (
        <aside aria-label="Cloudflare 边缘绑定提醒" className="bg-amber-500/10 border-b border-amber-500/20 text-amber-900 dark:text-amber-200 py-2 px-3 sm:px-4 text-xs transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate sm:whitespace-normal">
                <strong>Cloudflare 边缘绑定提醒：</strong>
                {!systemStatus.d1Bound && !systemStatus.kvBound
                  ? "当前未检测到 D1 数据库 (env.DB) 与 KV 缓存 (env.CACHE_KV) 绑定，在边缘运行时数据将无法持久化写入。"
                  : !systemStatus.d1Bound
                  ? "未检测到 D1 数据库 (env.DB) 绑定，在 Cloudflare Pages/Workers 运行时修改数据将无法持久化。"
                  : "未检测到 KV 缓存 (env.CACHE_KV) 绑定，系统已降级直连，建议绑定以启用边缘高速缓存。"}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setIsAdminMode(true)}
                className="font-semibold underline hover:text-amber-600 dark:hover:text-amber-100 whitespace-nowrap text-[11px]"
              >
                后台查看指引与免费额度 →
              </button>
              <button
                onClick={() => setShowBindingNotice(false)}
                className="p-1 rounded hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                title="暂时关闭提醒"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Top Navbar */}
      <Navbar
        isAdminMode={isAdminMode}
        setIsAdminMode={setIsAdminMode}
        onOpenApiDocs={() => setIsApiDocsOpen(true)}
        onOpenImportExport={() => setIsImportExportOpen(true)}
        onOpenBookmarklet={() => setIsBookmarkletOpen(true)}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        siteName={settings.siteName}
        isLoggedIn={isLoggedIn}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        viewMode={viewMode}
        setViewMode={handleViewModeChange}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {isLoading ? (
          <SkeletonScreen darkMode={darkMode} viewMode={viewMode} />
        ) : isAdminMode ? (
          <AdminView
            categories={categories}
            bookmarks={bookmarks}
            settings={settings}
            systemStatus={systemStatus}
            darkMode={darkMode}
            onRefreshData={loadData}
            onRefreshSystemStatus={loadSystemStatus}
            onOpenBookmarkModal={openBookmarkModal}
            onOpenCategoryModal={openCategoryModal}
            onOpenImportExport={() => setIsImportExportOpen(true)}
            onOpenApiDocs={() => setIsApiDocsOpen(true)}
          />
        ) : (
          <FrontendView
            categories={categories}
            bookmarks={bookmarks}
            viewMode={viewMode}
            setViewMode={handleViewModeChange}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            darkMode={darkMode}
            onBookmarkClick={handleBookmarkClick}
            selectedTag={selectedTag}
            setSelectedTag={setSelectedTag}
            siteSubtitle={settings.siteSubtitle}
            announcement={settings.announcement}
            onRefreshData={loadData}
            onOpenLogin={() => setIsLoginOpen(true)}
            onOpenBookmarkModal={openBookmarkModal}
            isLoggedIn={isLoggedIn}
          />
        )}
      </main>

      {/* Refined Modern Footer */}
      <footer className={`border-t py-6 text-xs transition-colors ${
        darkMode ? "border-slate-800 text-slate-500 bg-slate-950" : "border-slate-200 text-slate-500 bg-white"
      }`}>
        <div className="max-w-7xl mx-auto px-4 space-y-3">
          
          {/* Top Row: Copyright & Version */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b pb-3 border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                © {new Date().getFullYear()} {settings.siteName}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-400">极简优雅的导航与书签系统</span>
            </div>

            {/* Version Badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                版本号: v2.5.0 (Cloudflare Serverless)
              </span>
            </div>
          </div>

          {/* Bottom Row: Cloud Provider & AI Engine */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 flex-wrap justify-center sm:justify-start">
              <span className="text-slate-500 dark:text-slate-400 font-medium">云服务供应商:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                <Cloud className="w-3 h-3" />
                Cloudflare
              </span>
              <span className="text-slate-400 dark:text-slate-500">
                (Pages 静态托管 · Workers 边缘计算 · D1 数据库 · KV 边缘缓存)
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap justify-center sm:justify-end">
              <span className="text-slate-500 dark:text-slate-400 font-medium">AI 供应商:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
                <Zap className="w-3 h-3" />
                Google Gemini
              </span>
              <span className="text-slate-400 dark:text-slate-500">
                (Gemini 2.5 Flash 智能推荐)
              </span>
            </div>
          </div>

        </div>
      </footer>

      {/* Modals */}
      <BookmarkModal
        isOpen={isBookmarkModalOpen}
        onClose={() => setIsBookmarkModalOpen(false)}
        onSave={loadData}
        categories={categories}
        bookmarks={bookmarks}
        editingBookmark={editingBookmark}
        darkMode={darkMode}
      />

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSave={loadData}
        editingCategory={editingCategory}
        darkMode={darkMode}
      />

      <ImportExportModal
        isOpen={isImportExportOpen}
        onClose={() => setIsImportExportOpen(false)}
        darkMode={darkMode}
        onRefreshData={loadData}
      />

      <ApiDocsModal
        isOpen={isApiDocsOpen}
        onClose={() => setIsApiDocsOpen(false)}
        darkMode={darkMode}
      />

      <BookmarkletModal
        isOpen={isBookmarkletOpen}
        onClose={() => setIsBookmarkletOpen(false)}
        darkMode={darkMode}
      />

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        darkMode={darkMode}
      />
    </div>
  );
}
