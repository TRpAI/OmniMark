import React, { useState, useEffect, useMemo } from "react";
import { Bookmark, Category, ViewMode } from "../types";
import { motion, LayoutGroup } from "motion/react";
import { 
  Folder, Code, Palette, BookOpen, Star, Sparkles, 
  Search, ExternalLink, Flame, Clock, Tag, Copy, Check, Compass, Globe,
  LayoutGrid, LayoutDashboard, Rows3, Grid2X2, GripVertical, RotateCcw
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { BookmarkContextMenu } from "./BookmarkContextMenu";
import { SortableBookmarkCard } from "./SortableBookmarkCard";

interface FrontendViewProps {
  categories: Category[];
  bookmarks: Bookmark[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  viewMode: ViewMode;
  setViewMode?: (mode: ViewMode) => void;
  darkMode: boolean;
  siteSubtitle: string;
  announcement?: string;
  onBookmarkClick: (id: string, url: string) => void;
  selectedTag?: string | null;
  setSelectedTag?: (tag: string | null) => void;
  onRefreshData?: () => void;
  onOpenLogin?: () => void;
  onOpenBookmarkModal?: (bookmark?: Bookmark) => void;
  isLoggedIn?: boolean;
}

export const FrontendView: React.FC<FrontendViewProps> = ({
  categories,
  bookmarks,
  searchTerm,
  setSearchTerm,
  viewMode,
  setViewMode,
  darkMode,
  siteSubtitle,
  announcement,
  onBookmarkClick,
  selectedTag: propSelectedTag,
  setSelectedTag: propSetSelectedTag,
  onRefreshData,
  onOpenLogin,
  onOpenBookmarkModal,
  isLoggedIn,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [internalSelectedTag, setInternalSelectedTag] = useState<string | null>(null);
  const selectedTag = propSelectedTag !== undefined ? propSelectedTag : internalSelectedTag;
  const setSelectedTag = propSetSelectedTag || setInternalSelectedTag;

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [viewModeDropdownOpen, setViewModeDropdownOpen] = useState<boolean>(false);
  const [visibleLimit, setVisibleLimit] = useState<number>(48);

  useEffect(() => {
    setVisibleLimit(48);
  }, [activeCategory, selectedTag, searchTerm]);

  // Context Menu state for mobile long-press and desktop right-click
  const [contextMenuState, setContextMenuState] = useState<{
    isOpen: boolean;
    bookmark: Bookmark | null;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    bookmark: null,
    position: { x: 0, y: 0 },
  });

  // Local optimistic bookmark changes (for instant snappy UI response)
  const [optimisticBookmarks, setOptimisticBookmarks] = useState<Bookmark[] | null>(null);

  // Sync optimistic list when upstream bookmarks change
  useEffect(() => {
    setOptimisticBookmarks(null);
  }, [bookmarks]);

  const activeBookmarksList = optimisticBookmarks || bookmarks;

  // Helper for admin auth token
  const getAuthHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("omnimark_token") : null;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const handleOpenContextMenu = (
    _e: React.MouseEvent | React.TouchEvent,
    bookmark: Bookmark,
    position: { x: number; y: number }
  ) => {
    setContextMenuState({
      isOpen: true,
      bookmark,
      position,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenuState(prev => ({ ...prev, isOpen: false }));
  };

  // Quick Pin / Unpin Bookmark
  const handleTogglePinBookmark = async (bm: Bookmark): Promise<boolean | void> => {
    try {
      const nextPinned = !bm.isPinned;
      const res = await fetch(`/api/bookmarks/${bm.id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isPinned: nextPinned }),
      });

      if (res.status === 401) {
        return false;
      }

      if (res.ok) {
        // Optimistic update
        setOptimisticBookmarks(prev => {
          const current = prev || bookmarks;
          return current.map(b => b.id === bm.id ? { ...b, isPinned: nextPinned } : b);
        });
        if (onRefreshData) {
          onRefreshData();
        }
      }
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      throw err;
    }
  };

  // Quick Delete Bookmark
  const handleDeleteBookmark = async (bm: Bookmark): Promise<boolean | void> => {
    try {
      const res = await fetch(`/api/bookmarks/${bm.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (res.status === 401) {
        return false;
      }

      if (res.ok) {
        // Optimistic update
        setOptimisticBookmarks(prev => {
          const current = prev || bookmarks;
          return current.filter(b => b.id !== bm.id);
        });
        if (onRefreshData) {
          onRefreshData();
        }
      }
    } catch (err) {
      console.error("Failed to delete bookmark:", err);
      throw err;
    }
  };

  // Temporary drag-and-drop ordering for non-admin visitors
  const [customOrderIds, setCustomOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("omnimark_temp_custom_order");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // dnd-kit sensors: distance 8px ensures normal clicks on links/buttons are preserved
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  // Apply temporary custom ordering if user has adjusted sequence, otherwise prioritize pinned bookmarks
  const orderedBookmarks = useMemo(() => {
    let list = [...activeBookmarksList];
    if (customOrderIds && customOrderIds.length > 0) {
      const orderMap = new Map(customOrderIds.map((id, index) => [id, index]));
      list.sort((a, b) => {
        const indexA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999 + (a.sortOrder || 0);
        const indexB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999 + (b.sortOrder || 0);
        return indexA - indexB;
      });
    } else {
      // Prioritize pinned bookmarks at the top of category lists
      list.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
    }
    return list;
  }, [activeBookmarksList, customOrderIds]);

  // Performance-optimized bookmark filtering using useMemo
  const filteredBookmarks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orderedBookmarks.filter(bm => {
      const matchesCategory = activeCategory === "all" || bm.categoryId === activeCategory;
      const matchesSearch = !q || 
        bm.title.toLowerCase().includes(q) ||
        bm.url.toLowerCase().includes(q) ||
        (bm.description && bm.description.toLowerCase().includes(q)) ||
        (bm.tags && bm.tags.some(t => t.toLowerCase().includes(q)));
      const matchesTag = !selectedTag || (bm.tags && bm.tags.includes(selectedTag));

      return matchesCategory && matchesSearch && matchesTag;
    });
  }, [orderedBookmarks, activeCategory, searchTerm, selectedTag]);

  // Fast category lookup map for badge colors and category metadata
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
  };

  // Handle Drag & Drop reorder
  const handleDragEnd = (event: DragEndEvent, sliceBookmarks: Bookmark[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldSliceIndex = sliceBookmarks.findIndex((b) => b.id === active.id);
    const newSliceIndex = sliceBookmarks.findIndex((b) => b.id === over.id);
    if (oldSliceIndex === -1 || newSliceIndex === -1) return;

    const activeBm = sliceBookmarks[oldSliceIndex];
    const overBm = sliceBookmarks[newSliceIndex];

    const currentFullIds = orderedBookmarks.map((b) => b.id);
    const fullOldIndex = currentFullIds.indexOf(activeBm.id);
    const fullNewIndex = currentFullIds.indexOf(overBm.id);

    if (fullOldIndex !== -1 && fullNewIndex !== -1) {
      const updatedIds = arrayMove(currentFullIds, fullOldIndex, fullNewIndex);
      setCustomOrderIds(updatedIds);
      try {
        localStorage.setItem("omnimark_temp_custom_order", JSON.stringify(updatedIds));
      } catch {}
    }
  };

  const handleResetOrder = () => {
    setCustomOrderIds([]);
    try {
      localStorage.removeItem("omnimark_temp_custom_order");
    } catch {}
  };

  const hasCustomOrder = customOrderIds.length > 0;

  // Extract all unique tags
  const allTags = useMemo(() => {
    return Array.from(
      new Set(bookmarks.flatMap(bm => bm.tags || []))
    ).filter(Boolean);
  }, [bookmarks]);

  // Pinned Bookmarks
  const pinnedBookmarks = useMemo(() => {
    return orderedBookmarks.filter(bm => bm.isPinned);
  }, [orderedBookmarks]);

  const handleCopyUrl = (e: React.MouseEvent, id: string, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderCategoryIcon = (iconName: string) => {
    const props = { className: "w-4 h-4 shrink-0" };
    switch (iconName) {
      case "Code": return <Code {...props} />;
      case "Sparkles": return <Sparkles {...props} />;
      case "Palette": return <Palette {...props} />;
      case "BookOpen": return <BookOpen {...props} />;
      case "Star": return <Star {...props} />;
      default: return <Folder {...props} />;
    }
  };

  const viewModeButtons: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "grid", label: "网格", icon: <LayoutGrid className="w-3.5 h-3.5 shrink-0" /> },
    { key: "bento", label: "便签", icon: <LayoutDashboard className="w-3.5 h-3.5 shrink-0" /> },
    { key: "list", label: "列表", icon: <Rows3 className="w-3.5 h-3.5 shrink-0" /> },
    { key: "compact", label: "紧凑", icon: <Grid2X2 className="w-3.5 h-3.5 shrink-0" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8 w-full overflow-hidden">
      
      {/* Hero Welcome & Info Banner */}
      <div className={`p-5 sm:p-8 rounded-3xl border transition-all relative overflow-hidden shadow-sm ${
        darkMode ? "bg-slate-800/40 border-slate-700/80" : "bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-white border-blue-100"
      }`}>
        <div className="absolute right-6 top-6 hidden md:flex items-center gap-3 text-xs font-medium px-3.5 py-2 rounded-2xl bg-white/60 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 backdrop-blur whitespace-nowrap leading-none">
          <Clock className="w-4 h-4 text-blue-500 animate-pulse shrink-0" />
          <span>{currentTime}</span>
        </div>

        <div className="max-w-3xl space-y-2.5 sm:space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold whitespace-nowrap leading-none">
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>极简多端导航门户</span>
          </div>
          <h2 className={`text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight ${darkMode ? "text-white" : "text-slate-900"}`}>
            探索无限精彩，高效直达所想
          </h2>
          <p className={`text-xs sm:text-base leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
            {siteSubtitle}
          </p>

          {announcement && (
            <div className="pt-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 max-w-xl">
              <span className="shrink-0 font-bold">公告:</span>
              <span className="truncate">{announcement}</span>
            </div>
          )}
        </div>
      </div>

      {/* Pinned Bookmarks Section */}
      {!searchTerm && !selectedTag && pinnedBookmarks.length > 0 && activeCategory === "all" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <h3 className={`font-bold text-xs tracking-wide uppercase ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                置顶推荐
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">高频访问</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {pinnedBookmarks.map(bm => (
              <a
                key={bm.id}
                href={bm.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onBookmarkClick(bm.id, bm.url)}
                className={`group p-2 sm:p-2.5 rounded-xl border transition-all duration-200 flex items-center gap-2 relative hover:-translate-y-0.5 hover:shadow-sm ${
                  darkMode 
                    ? "bg-slate-800/60 border-slate-700 hover:border-blue-500/50 hover:bg-slate-800" 
                    : "bg-white border-slate-200/80 hover:border-blue-500/40 hover:bg-white shadow-xs"
                }`}
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-100 dark:bg-slate-700/80 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                  {bm.icon ? (
                    <img 
                      src={bm.icon} 
                      alt="" 
                      loading="lazy"
                      className="w-4 h-4 object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className={`text-xs font-semibold truncate ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
                    {bm.title}
                  </h4>
                  <p className={`text-[10px] truncate ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                    {safeGetHostname(bm.url)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Category Tabs & Interactive View Switcher Bar */}
      <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
        
        {/* Row of Category pills + Order Reset */}
        <div className="flex items-center justify-between gap-2 w-full">
          
          {/* Scrollable category list */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar flex-1 min-w-0">
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-semibold transition-all shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap leading-none ${
                activeCategory === "all"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span>全部导航</span>
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-semibold transition-all shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap leading-none ${
                  activeCategory === cat.id
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {renderCategoryIcon(cat.icon)}
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          {/* Right side controls: Temporary order indicator */}
          <div className="flex items-center gap-2 shrink-0">
            {hasCustomOrder && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-600 dark:text-blue-400">
                <GripVertical className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">已自定义顺序</span>
                <button
                  type="button"
                  onClick={handleResetOrder}
                  className="ml-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-blue-200/60 dark:hover:bg-blue-800/60 text-[11px] font-medium transition-colors"
                  title="恢复默认排序"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>重置</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tag pills */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1">
            <span className="text-[11px] text-slate-400 shrink-0 inline-flex items-center gap-1 mr-1 whitespace-nowrap leading-none">
              <Tag className="w-3 h-3 shrink-0" /> 标签:
            </span>
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 whitespace-nowrap leading-none"
              >
                清除标签 ({selectedTag})
              </button>
            )}
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors shrink-0 whitespace-nowrap leading-none ${
                  selectedTag === tag
                    ? "bg-blue-600 text-white"
                    : darkMode ? "bg-slate-800 text-slate-400 hover:text-slate-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bookmarks Display Area */}
      {filteredBookmarks.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="w-14 h-14 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <Search className="w-7 h-7" />
          </div>
          <h3 className={`font-bold text-base ${darkMode ? "text-slate-200" : "text-slate-800"}`}>没有找到相关的书签</h3>
          <p className="text-xs text-slate-400">请尝试更换搜索关键词或切换分类标签</p>
        </div>
      ) : (
        <LayoutGroup id="omnimark-frontend-bookmarks">
          <div className="space-y-8 sm:space-y-10">
            {/* Group by category if "all" selected, otherwise show current category */}
            {activeCategory === "all" ? (
              categories.map(cat => {
                const catBookmarks = filteredBookmarks.filter(b => b.categoryId === cat.id);
                if (catBookmarks.length === 0) return null;

                return (
                  <div key={cat.id} className="space-y-3 sm:space-y-4">
                    <div className="flex items-center justify-between border-b pb-2 border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          {renderCategoryIcon(cat.icon)}
                        </div>
                        <div>
                          <h3 className={`font-bold text-sm sm:text-base ${darkMode ? "text-white" : "text-slate-900"}`}>
                            {cat.name}
                          </h3>
                          {cat.description && (
                            <p className={`text-[11px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {cat.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium whitespace-nowrap leading-none">
                        {catBookmarks.length} 个站点
                      </span>
                    </div>

                    {/* Render based on view mode with drag-and-drop sort support */}
                    {renderBookmarkContainer(
                      catBookmarks, 
                      viewMode, 
                      darkMode, 
                      onBookmarkClick, 
                      copiedId, 
                      handleCopyUrl,
                      handleDragEnd,
                      sensors,
                      handleOpenContextMenu,
                      categoryMap,
                      selectedTag,
                      handleTagClick,
                      handleCategoryClick
                    )}
                  </div>
                );
              })
            ) : (
              <div className="space-y-4">
                {(() => {
                  const currentCat = categories.find(c => c.id === activeCategory);
                  return (
                    <div className="flex items-center justify-between border-b pb-2 border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          {renderCategoryIcon(currentCat?.icon || "Folder")}
                        </div>
                        <div>
                          <h3 className={`font-bold text-sm sm:text-base ${darkMode ? "text-white" : "text-slate-900"}`}>
                            {currentCat?.name || "分类导航"}
                          </h3>
                          {currentCat?.description && (
                            <p className={`text-[11px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                              {currentCat.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium whitespace-nowrap leading-none">
                        {filteredBookmarks.length} 个站点
                      </span>
                    </div>
                  );
                })()}

                {renderBookmarkContainer(
                  filteredBookmarks, 
                  viewMode, 
                  darkMode, 
                  onBookmarkClick, 
                  copiedId, 
                  handleCopyUrl,
                  handleDragEnd,
                  sensors,
                  handleOpenContextMenu,
                  categoryMap,
                  selectedTag,
                  handleTagClick,
                  handleCategoryClick
                )}
              </div>
            )}
          </div>
        </LayoutGroup>
      )}

      {/* Long-press and Right-click Context Menu */}
      <BookmarkContextMenu
        isOpen={contextMenuState.isOpen}
        bookmark={contextMenuState.bookmark}
        position={contextMenuState.position}
        darkMode={darkMode}
        isLoggedIn={isLoggedIn}
        onClose={handleCloseContextMenu}
        onTogglePin={handleTogglePinBookmark}
        onDelete={handleDeleteBookmark}
        onEdit={onOpenBookmarkModal}
        onBookmarkClick={onBookmarkClick}
        onOpenLogin={onOpenLogin}
        categoryName={contextMenuState.bookmark ? categoryMap.get(contextMenuState.bookmark.categoryId)?.name : undefined}
      />
    </div>
  );
};

// Safe hostname helper
function safeGetHostname(urlStr: string): string {
  try {
    const validStr = urlStr.startsWith('http://') || urlStr.startsWith('https://') 
      ? urlStr 
      : `https://${urlStr}`;
    return new URL(validStr).hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

// Helper to render bookmarks based on viewMode with dnd-kit support and virtual scrolling windowing
function renderBookmarkContainer(
  bookmarks: Bookmark[],
  viewMode: ViewMode,
  darkMode: boolean,
  onBookmarkClick: (id: string, url: string) => void,
  copiedId: string | null,
  handleCopyUrl: (e: React.MouseEvent, id: string, url: string) => void,
  onDragEnd: (event: DragEndEvent, list: Bookmark[]) => void,
  sensors: any,
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, bm: Bookmark, pos: { x: number; y: number }) => void,
  categoryMap: Map<string, Category>,
  selectedTag: string | null,
  onTagClick: (tag: string) => void,
  onCategoryClick: (categoryId: string) => void
) {
  const [virtualLimit, setVirtualLimit] = React.useState<number>(36);

  const containerClass = 
    viewMode === 'list'
      ? "space-y-2"
      : viewMode === 'bento'
      ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4"
      : viewMode === 'compact'
      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2"
      : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4";

  const displayedBookmarks = bookmarks.slice(0, virtualLimit);
  const hasMore = bookmarks.length > virtualLimit;

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => onDragEnd(event, bookmarks)}
      >
        <SortableContext items={displayedBookmarks.map(b => b.id)} strategy={rectSortingStrategy}>
          <motion.div
            layout
            transition={{ layout: { type: "spring", stiffness: 340, damping: 28 } }}
            className={containerClass}
          >
            {displayedBookmarks.map((bm, index) => {
              const cat = categoryMap.get(bm.categoryId);
              return (
                <SortableBookmarkCard
                  key={bm.id}
                  bookmark={bm}
                  viewMode={viewMode}
                  darkMode={darkMode}
                  onBookmarkClick={onBookmarkClick}
                  copiedId={copiedId}
                  handleCopyUrl={handleCopyUrl}
                  onContextMenu={onContextMenu}
                  index={index}
                  categoryName={cat?.name}
                  selectedTag={selectedTag}
                  onTagClick={onTagClick}
                  onCategoryClick={onCategoryClick}
                />
              );
            })}
          </motion.div>
        </SortableContext>
      </DndContext>

      {hasMore && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setVirtualLimit(prev => prev + 36)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
              darkMode
                ? "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs"
            }`}
          >
            加载更多虚拟滚动视窗 ({displayedBookmarks.length} / {bookmarks.length})
          </button>
        </div>
      )}
    </div>
  );
}
