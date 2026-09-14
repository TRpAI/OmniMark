import React, { useState } from "react";
import { 
  Search, 
  Moon, 
  Sun, 
  Shield, 
  LogOut, 
  LogIn, 
  Sparkles, 
  Menu, 
  X, 
  BookOpen, 
  ArrowLeft, 
  HardDriveDownload,
  LayoutGrid, LayoutDashboard, Rows3, Grid2X2
} from "lucide-react";
import { ViewMode } from "../types";

interface NavbarProps {
  isAdminMode: boolean;
  setIsAdminMode: (admin: boolean) => void;
  onOpenApiDocs: () => void;
  onOpenImportExport: () => void;
  onOpenBookmarklet: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  siteName: string;
  isLoggedIn: boolean;
  onOpenLogin: () => void;
  onLogout: () => void;
  viewMode?: ViewMode;
  setViewMode?: (mode: ViewMode) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isAdminMode,
  setIsAdminMode,
  onOpenApiDocs,
  onOpenImportExport,
  onOpenBookmarklet,
  searchTerm,
  setSearchTerm,
  darkMode,
  setDarkMode,
  siteName,
  isLoggedIn,
  onOpenLogin,
  onLogout,
  viewMode = "grid",
  setViewMode,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewModeDropdownOpen, setViewModeDropdownOpen] = useState(false);

  const viewModeButtons: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "grid", label: "网格", icon: <LayoutGrid className="w-3.5 h-3.5 shrink-0" /> },
    { key: "bento", label: "便签", icon: <LayoutDashboard className="w-3.5 h-3.5 shrink-0" /> },
    { key: "list", label: "列表", icon: <Rows3 className="w-3.5 h-3.5 shrink-0" /> },
    { key: "compact", label: "紧凑", icon: <Grid2X2 className="w-3.5 h-3.5 shrink-0" /> },
  ];

  return (
    <header className={`sticky top-0 z-40 w-full border-b transition-colors ${
      darkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white/95 border-slate-200 text-slate-900"
    } backdrop-blur-md`}>
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 lg:px-6">
        
        {/* ========================================================
            ROW 1: Primary Brand & Action Bar (Desktop + Mobile)
           ======================================================== */}
        <div className="h-14 sm:h-16 flex items-center justify-between gap-2 w-full">
          
          {/* Left: Logo & Brand Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <button 
              onClick={() => setIsAdminMode(false)}
              className="flex items-center gap-2 group text-left min-w-0"
              title="返回首页"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0 group-hover:scale-105 transition-transform">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm sm:text-base tracking-tight truncate">
                    {siteName || "OmniMark"}
                  </span>
                  <span className="hidden sm:inline-block text-[10px] leading-none px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20 shrink-0">
                    v2.5
                  </span>
                </div>
                <p className="hidden md:block text-[10px] text-slate-400 dark:text-slate-500 truncate -mt-0.5">
                  极简多端导航
                </p>
              </div>
            </button>
          </div>

          {/* Center (Desktop only >= md): Search Bar */}
          {!isAdminMode && (
            <div className="hidden md:flex items-center flex-1 max-w-sm lg:max-w-md mx-2">
              <div className={`relative w-full rounded-xl border flex items-center px-3 py-1.5 transition-all ${
                darkMode 
                  ? "bg-slate-800/80 border-slate-700/80 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20" 
                  : "bg-slate-50 border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20"
              }`}>
                <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索标题、网址或标签..."
                  className="w-full bg-transparent border-none outline-none text-xs placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm("")}
                    className="text-[10px] leading-none px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 shrink-0"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Desktop Action Shortcuts (>= lg) */}
            <div className="hidden lg:flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <button
                onClick={onOpenApiDocs}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 transition-colors"
                title="RESTful API 接口文档"
              >
                <BookOpen className="w-4 h-4" />
              </button>
              <button
                onClick={onOpenBookmarklet}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 transition-colors"
                title="一键采集书签栏工具"
              >
                <Sparkles className="w-4 h-4" />
              </button>
              <button
                onClick={onOpenImportExport}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 transition-colors"
                title="数据备份与导入导出"
              >
                <HardDriveDownload className="w-4 h-4" />
              </button>
            </div>

            {/* View Mode Selector Dropdown */}
            {setViewMode && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setViewModeDropdownOpen(!viewModeDropdownOpen)}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    darkMode
                      ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs"
                  }`}
                  title="切换显示模式"
                >
                  {viewModeButtons.find(v => v.key === viewMode)?.icon}
                  <span className="hidden sm:inline">{viewModeButtons.find(v => v.key === viewMode)?.label || "网格"}</span>
                </button>

                {viewModeDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-36 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">选择显示模式</div>
                    {viewModeButtons.map(vm => (
                      <button
                        key={vm.key}
                        onClick={() => {
                          setViewMode(vm.key);
                          setViewModeDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                          viewMode === vm.key
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                        }`}
                      >
                        {vm.icon}
                        <span>{vm.label}视图</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Dark/Light Theme Toggle (Always visible) */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 text-slate-600 dark:text-slate-300"
              title={darkMode ? "切换至浅色模式" : "切换至深色模式"}
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Admin / Login Button */}
            {isAdminMode ? (
              <button
                onClick={() => setIsAdminMode(false)}
                className="inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">返回前台</span>
              </button>
            ) : isLoggedIn ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setIsAdminMode(true)}
                  className="inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20 shrink-0"
                >
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">后台</span>
                </button>
                <button
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors shrink-0"
                  title="退出登录"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors shrink-0"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">登录</span>
              </button>
            )}

            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 text-slate-600 dark:text-slate-300"
              title="展开更多操作"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ========================================================
            ROW 2: Mobile/Tablet Two-Tier Sub-Bar (< md only)
            Features: Full-width search input for ergonomic mobile access
           ======================================================== */}
        {!isAdminMode && (
          <div className="md:hidden pb-2.5 pt-1 border-t border-slate-100 dark:border-slate-800/80 flex items-center w-full">
            
            {/* Search Input Bar */}
            <div className={`relative w-full rounded-xl border flex items-center px-2.5 py-1.5 transition-all min-w-0 ${
              darkMode 
                ? "bg-slate-800/90 border-slate-700/80 focus-within:border-blue-500" 
                : "bg-slate-50 border-slate-200 focus-within:border-blue-500"
            }`}>
              <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索标题/网址/标签/分类..."
                className="w-full bg-transparent border-none outline-none text-xs placeholder:text-slate-400 min-w-0"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="text-[10px] leading-none px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ========================================================
          Mobile Drawer Menu (Tools, Docs, Backup)
         ======================================================== */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 space-y-4 shadow-xl animate-in slide-in-from-top-2 duration-150">

          {/* Function Buttons */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => {
                onOpenApiDocs();
                setMobileMenuOpen(false);
              }}
              className="flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-500/40 text-xs font-medium gap-1.5 text-slate-700 dark:text-slate-200"
            >
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span>API 文档</span>
            </button>
            <button
              onClick={() => {
                onOpenBookmarklet();
                setMobileMenuOpen(false);
              }}
              className="flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-500/40 text-xs font-medium gap-1.5 text-slate-700 dark:text-slate-200"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>采集工具</span>
            </button>
            <button
              onClick={() => {
                onOpenImportExport();
                setMobileMenuOpen(false);
              }}
              className="flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-500/40 text-xs font-medium gap-1.5 text-slate-700 dark:text-slate-200"
            >
              <HardDriveDownload className="w-4 h-4 text-emerald-500" />
              <span>导入备份</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
