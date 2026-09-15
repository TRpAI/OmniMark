import React, { useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, type Transition } from "motion/react";
import { Bookmark, ViewMode } from "../types";
import { Globe, ExternalLink, Copy, Check, GripVertical, MoreVertical, Pin } from "lucide-react";
import { getCategoryBadgeStyle } from "../utils/categoryBadge";

interface SortableBookmarkCardProps {
  bookmark: Bookmark;
  viewMode: ViewMode;
  darkMode: boolean;
  onBookmarkClick: (id: string, url: string) => void;
  copiedId: string | null;
  handleCopyUrl: (e: React.MouseEvent, id: string, url: string) => void;
  onContextMenu?: (
    e: React.MouseEvent | React.TouchEvent, 
    bookmark: Bookmark, 
    position: { x: number; y: number }
  ) => void;
  index?: number;
  categoryName?: string;
  selectedTag?: string | null;
  onTagClick?: (tag: string) => void;
  onCategoryClick?: (categoryId: string) => void;
}

function safeGetHostname(urlStr: string): string {
  try {
    const validStr = urlStr.startsWith("http://") || urlStr.startsWith("https://") 
      ? urlStr 
      : `https://${urlStr}`;
    return new URL(validStr).hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

const springTransition: Transition = {
  layout: { type: "spring", stiffness: 340, damping: 28 },
  opacity: { duration: 0.18 },
};

export const SortableBookmarkCard: React.FC<SortableBookmarkCardProps> = ({
  bookmark: bm,
  viewMode,
  darkMode,
  onBookmarkClick,
  copiedId,
  handleCopyUrl,
  onContextMenu,
  index = 0,
  categoryName,
  selectedTag,
  onTagClick,
  onCategoryClick,
}) => {
  const categoryStyle = categoryName ? getCategoryBadgeStyle(categoryName) : null;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition: dndTransition,
    isDragging,
  } = useSortable({ id: bm.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: dndTransition,
    zIndex: isDragging ? 50 : undefined,
  };

  // Long-press detection states & refs
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isLongPressTriggeredRef = useRef<boolean>(false);
  const preventClickRef = useRef<boolean>(false);
  const [isPressing, setIsPressing] = useState<boolean>(false);

  // Hover preview state & timers
  const [meta, setMeta] = useState<{ title: string; description: string; image: string; hostname: string; url: string } | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (isDragging) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    hoverTimeoutRef.current = setTimeout(async () => {
      setIsHovered(true);
      if (!meta && !isLoadingMeta && bm.url) {
        setIsLoadingMeta(true);
        try {
          const res = await fetch(`/api/metadata?url=${encodeURIComponent(bm.url)}`);
          if (res.ok) {
            const data = await res.json();
            setMeta(data);
          }
        } catch {
          setMeta({ title: bm.title, description: bm.description || "暂无网页摘要", image: "", hostname: safeGetHostname(bm.url), url: bm.url });
        } finally {
          setIsLoadingMeta(false);
        }
      }
    }, 380);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
  };

  const renderHoverPreview = () => {
    if (!isHovered) return null;
    return (
      <div className="absolute left-0 bottom-full mb-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-3.5 z-50 text-left pointer-events-none animate-in fade-in zoom-in-95 duration-150">
        {meta?.image && (
          <div className="w-full h-32 rounded-xl mb-2.5 overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img src={meta.image} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
          </div>
        )}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">实时网页预览</span>
          <span className="text-[11px] text-slate-400 truncate">{meta?.hostname || safeGetHostname(bm.url)}</span>
        </div>
        <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 line-clamp-1 mb-1">
          {meta?.title || bm.title}
        </h4>
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
          {meta?.description || bm.description || "正在加载网页摘要..."}
        </p>
        {isLoadingMeta && !meta && (
          <div className="flex items-center gap-2 mt-2 text-[11px] text-blue-500 animate-pulse">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>正在通过 Cloudflare Worker 代理获取摘要...</span>
          </div>
        )}
      </div>
    );
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDragging) return;
    const touch = e.touches[0];
    if (!touch) return;

    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    isLongPressTriggeredRef.current = false;
    preventClickRef.current = false;
    setIsPressing(true);

    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      preventClickRef.current = true;
      setIsPressing(false);

      if (navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }

      if (onContextMenu) {
        onContextMenu(e, bm, { x: startPosRef.current.x, y: startPosRef.current.y });
      }
    }, 460); // 460ms natural long-press trigger
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!longPressTimerRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = Math.abs(touch.clientX - startPosRef.current.x);
    const dy = Math.abs(touch.clientY - startPosRef.current.y);
    // If finger moves more than 10px, the user is scrolling the page, so cancel long-press
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      setIsPressing(false);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsPressing(false);

    if (isLongPressTriggeredRef.current) {
      e.preventDefault();
      // Keep click prevention active briefly to swallow post-touch synthetic click
      setTimeout(() => {
        preventClickRef.current = false;
        isLongPressTriggeredRef.current = false;
      }, 200);
    }
  };

  const handleTouchCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsPressing(false);
  };

  // Right-click context menu (Desktop & mouse users)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(e, bm, { x: e.clientX, y: e.clientY });
    }
  };

  // Safe navigation click handler (guarantees long-press won't accidentally open link)
  const handleLinkClick = (e: React.MouseEvent) => {
    if (preventClickRef.current || isLongPressTriggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onBookmarkClick(bm.id, bm.url);
  };

  // Tap button context menu (alternative for accessibility & mouse users)
  const handleMoreButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onContextMenu(e, bm, { x: rect.left, y: rect.bottom + 4 });
    }
  };

  // Reusable Drag Grip Handle
  const renderDragHandle = (extraClass = "") => (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="拖拽调整顺序"
      className={`p-1 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-grab active:cursor-grabbing transition-colors shrink-0 touch-none ${extraClass}`}
      title="按住拖拽调整显示顺序"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  );

  // Reusable More Actions Button
  const renderMoreButton = (extraClass = "") => (
    <button
      type="button"
      onClick={handleMoreButtonClick}
      aria-label="书签更多操作菜单"
      className={`p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors shrink-0 ${extraClass}`}
      title="操作菜单 (长按也可呼出)"
    >
      <MoreVertical className="w-3.5 h-3.5" />
    </button>
  );

  // 1. List View Mode
  if (viewMode === "list") {
    return (
      <motion.div
        ref={setNodeRef}
        layout={!isDragging}
        layoutId={`bookmark-card-${bm.id}`}
        transition={springTransition}
        style={style}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        animate={isPressing ? { scale: 0.985 } : undefined}
        className={`group p-3 sm:p-4 rounded-2xl border transition-colors duration-150 flex items-center justify-between gap-3 select-none relative ${
          isDragging
            ? "opacity-60 scale-[1.01] shadow-lg border-blue-500 bg-blue-50/40 dark:bg-blue-900/20 z-50"
            : darkMode
              ? "bg-slate-800/40 border-slate-700/80 hover:border-blue-500/50 hover:bg-slate-800/80 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-blue-500/40 hover:bg-blue-50/20 shadow-xs"
        }`}
      >
        {renderHoverPreview()}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {renderDragHandle("opacity-50 group-hover:opacity-100")}

          <a
            href={bm.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleLinkClick}
            className="flex items-center gap-3 min-w-0 flex-1"
          >
            <motion.div
              layout="position"
              layoutId={`bookmark-icon-${bm.id}`}
              transition={springTransition}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center p-1.5 shrink-0 overflow-hidden"
            >
              {bm.icon ? (
                <img
                  src={bm.icon}
                  alt=""
                  loading="lazy"
                  className="w-5 h-5 object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <Globe className="w-4 h-4 text-blue-500 shrink-0" />
              )}
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                <motion.h4
                  layout="position"
                  layoutId={`bookmark-title-${bm.id}`}
                  transition={springTransition}
                  className={`font-semibold text-xs sm:text-sm truncate group-hover:text-blue-500 transition-colors ${darkMode ? "text-slate-100" : "text-slate-900"}`}
                >
                  {bm.title}
                </motion.h4>
                {bm.isPinned && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] leading-none px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap border border-amber-500/20 shrink-0">
                    <Pin className="w-2.5 h-2.5 inline" />
                    置顶
                  </span>
                )}
                {categoryName && categoryStyle && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onCategoryClick?.(bm.categoryId);
                    }}
                    title={`分类: ${categoryName} (点击筛选)`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap leading-none shrink-0 ${categoryStyle.badge} ${categoryStyle.hover}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${categoryStyle.dot}`} />
                    <span>{categoryName}</span>
                  </button>
                )}
              </div>
              <motion.p
                layout="position"
                layoutId={`bookmark-desc-${bm.id}`}
                transition={springTransition}
                className={`text-[11px] truncate ${darkMode ? "text-slate-400" : "text-slate-500"}`}
              >
                {bm.description || safeGetHostname(bm.url)}
              </motion.p>
            </div>
          </a>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {bm.tags && bm.tags.length > 0 && (
            <div className="hidden sm:flex items-center gap-1 flex-wrap">
              {bm.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTagClick?.(t);
                  }}
                  title={`按标签 #${t} 筛选`}
                  className={`inline-flex items-center text-[10px] leading-none px-1.5 py-0.5 rounded-md border font-medium whitespace-nowrap transition-colors ${
                    selectedTag === t
                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                      : darkMode
                        ? "bg-slate-700/60 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                        : "bg-slate-100 text-slate-600 border-slate-200/80 hover:bg-slate-200 hover:text-slate-900"
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
          <span className="text-[11px] text-slate-400 whitespace-nowrap hidden sm:inline">{bm.clicks || 0} 访问</span>
          <button
            type="button"
            onClick={(e) => handleCopyUrl(e, bm.id, bm.url)}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
            title="复制链接"
          >
            {copiedId === bm.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {renderMoreButton("opacity-60 group-hover:opacity-100")}
        </div>
      </motion.div>
    );
  }

  // 2. Bento View Mode
  if (viewMode === "bento") {
    return (
      <motion.div
        ref={setNodeRef}
        layout={!isDragging}
        layoutId={`bookmark-card-${bm.id}`}
        transition={springTransition}
        style={style}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onContextMenu={handleContextMenu}
        animate={isPressing ? { scale: 0.985 } : undefined}
        className={`group p-4 sm:p-5 rounded-3xl border transition-colors duration-150 flex flex-col justify-between gap-3 relative overflow-hidden select-none ${
          isDragging
            ? "opacity-60 scale-[1.01] shadow-xl border-blue-500 bg-blue-50/40 dark:bg-blue-900/20 z-50"
            : index === 0
              ? "sm:col-span-2 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border-blue-500/30"
              : darkMode
                ? "bg-slate-800/40 border-slate-700/80 hover:border-blue-500/50 hover:bg-slate-800 shadow-xs"
                : "bg-white border-slate-200/80 hover:border-blue-500/40 shadow-xs"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <a
            href={bm.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleLinkClick}
            className="flex items-center gap-3 min-w-0 flex-1"
          >
            <motion.div
              layout="position"
              layoutId={`bookmark-icon-${bm.id}`}
              transition={springTransition}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-xs"
            >
              {bm.icon ? (
                <img
                  src={bm.icon}
                  alt=""
                  loading="lazy"
                  className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <Globe className="w-5 h-5 text-blue-500 shrink-0" />
              )}
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <motion.h4
                  layout="position"
                  layoutId={`bookmark-title-${bm.id}`}
                  transition={springTransition}
                  className={`font-bold text-xs sm:text-sm truncate group-hover:text-blue-500 transition-colors ${darkMode ? "text-slate-100" : "text-slate-900"}`}
                >
                  {bm.title}
                </motion.h4>
                {bm.isPinned && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] leading-none px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap border border-amber-500/20 shrink-0">
                    <Pin className="w-2.5 h-2.5 inline" />
                    置顶
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 truncate block">{safeGetHostname(bm.url)}</span>
            </div>
          </a>

          <div className="flex items-center gap-1 shrink-0">
            {renderDragHandle("opacity-40 group-hover:opacity-100")}
            {renderMoreButton("opacity-60 group-hover:opacity-100")}
            <a
              href={bm.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleLinkClick}
              className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
              title="新窗口打开"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        </div>

        <a
          href={bm.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLinkClick}
          className="block"
        >
          <motion.p
            layout="position"
            layoutId={`bookmark-desc-${bm.id}`}
            transition={springTransition}
            className={`text-xs line-clamp-2 ${darkMode ? "text-slate-300" : "text-slate-600"}`}
          >
            {bm.description || "点击直达该站点..."}
          </motion.p>
        </a>

        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-400 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
            {categoryName && categoryStyle && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCategoryClick?.(bm.categoryId);
                }}
                title={`分类: ${categoryName} (点击筛选)`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap leading-none shrink-0 ${categoryStyle.badge} ${categoryStyle.hover}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${categoryStyle.dot}`} />
                <span>{categoryName}</span>
              </button>
            )}
            {bm.tags && bm.tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTagClick?.(t);
                }}
                title={`按标签 #${t} 筛选`}
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-colors whitespace-nowrap leading-none ${
                  selectedTag === t
                    ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                    : darkMode
                      ? "bg-slate-700/60 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                      : "bg-slate-100 text-slate-600 border-slate-200/80 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
          <span className="whitespace-nowrap shrink-0">{bm.clicks || 0} 访问</span>
        </div>
      </motion.div>
    );
  }

  // 3. Compact View Mode
  if (viewMode === "compact") {
    return (
      <motion.div
        ref={setNodeRef}
        layout={!isDragging}
        layoutId={`bookmark-card-${bm.id}`}
        transition={springTransition}
        style={style}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        animate={isPressing ? { scale: 0.985 } : undefined}
        className={`group p-2 sm:p-2.5 rounded-xl border transition-colors duration-150 flex items-center justify-between gap-1.5 truncate select-none relative ${
          isDragging
            ? "opacity-60 scale-105 shadow-md border-blue-500 bg-blue-50/40 dark:bg-blue-900/20 z-50"
            : darkMode
              ? "bg-slate-800/40 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 shadow-xs"
              : "bg-white border-slate-200/80 hover:bg-slate-50 shadow-xs"
        }`}
        title={`${bm.title} (长按或右键呼出操作菜单)`}
      >
        {renderHoverPreview()}
        <a
          href={bm.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLinkClick}
          className="flex items-center gap-2 min-w-0 flex-1 truncate"
        >
          <motion.div
            layout="position"
            layoutId={`bookmark-icon-${bm.id}`}
            transition={springTransition}
            className="w-5 h-5 shrink-0 flex items-center justify-center relative"
          >
            {bm.icon ? (
              <img
                src={bm.icon}
                alt=""
                loading="lazy"
                className="w-4 h-4 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            )}
            {bm.isPinned && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900" title="已置顶" />
            )}
          </motion.div>
          <motion.span
            layout="position"
            layoutId={`bookmark-title-${bm.id}`}
            transition={springTransition}
            className={`text-xs truncate font-medium group-hover:text-blue-500 transition-colors ${darkMode ? "text-slate-200" : "text-slate-800"}`}
          >
            {bm.title}
          </motion.span>
          {categoryName && categoryStyle && (
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${categoryStyle.dot}`}
              title={`分类: ${categoryName}`}
            />
          )}
        </a>

        <div className="flex items-center gap-0.5 shrink-0">
          {renderMoreButton("opacity-0 group-hover:opacity-100 scale-90")}
          {renderDragHandle("opacity-30 group-hover:opacity-100 scale-90")}
        </div>
      </motion.div>
    );
  }

  // 4. Default Grid View Mode (书签网格布局)
  return (
    <motion.div
      ref={setNodeRef}
      layout={!isDragging}
      layoutId={`bookmark-card-${bm.id}`}
      transition={springTransition}
      style={style}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      animate={isPressing ? { scale: 0.985 } : undefined}
      whileHover={isDragging ? undefined : { y: -3, transition: { duration: 0.18 } }}
      className={`group p-4 rounded-2xl border transition-colors duration-150 flex flex-col justify-between gap-3 relative select-none ${
        isDragging
          ? "opacity-60 scale-[1.02] shadow-xl border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-900/20 z-50"
          : darkMode
            ? "bg-slate-800/40 border-slate-700/80 hover:border-blue-500/50 hover:bg-slate-800 shadow-xs hover:shadow-md"
            : "bg-white border-slate-200/80 hover:border-blue-500/40 hover:bg-white shadow-xs hover:shadow-md"
      }`}
    >
      {renderHoverPreview()}
      <div className="flex items-start justify-between gap-3">
        <a
          href={bm.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLinkClick}
          className="flex items-center gap-3 min-w-0 flex-1"
        >
          <motion.div
            layout="position"
            layoutId={`bookmark-icon-${bm.id}`}
            transition={springTransition}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-xs relative"
          >
            {bm.icon ? (
              <img
                src={bm.icon}
                alt=""
                loading="lazy"
                className="w-5 h-5 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <Globe className="w-4 h-4 text-blue-500 shrink-0" />
            )}
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <motion.h4
                layout="position"
                layoutId={`bookmark-title-${bm.id}`}
                transition={springTransition}
                className={`font-bold text-xs sm:text-sm truncate group-hover:text-blue-500 transition-colors ${darkMode ? "text-slate-100" : "text-slate-900"}`}
              >
                {bm.title}
              </motion.h4>
              {bm.isPinned && (
                <span className="inline-flex items-center gap-0.5 text-[10px] leading-none px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap border border-amber-500/20 shrink-0">
                  <Pin className="w-2.5 h-2.5 inline" />
                  置顶
                </span>
              )}
            </div>
            <p className={`text-[11px] truncate ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              {safeGetHostname(bm.url)}
            </p>
          </div>
        </a>

        <div className="flex items-center gap-0.5 shrink-0">
          {renderDragHandle("opacity-40 group-hover:opacity-100")}
          {renderMoreButton("opacity-60 group-hover:opacity-100")}
          <a
            href={bm.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleLinkClick}
            className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
            title="新窗口打开"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
        </div>
      </div>

      <a
        href={bm.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLinkClick}
        className="block"
      >
        <motion.p
          layout="position"
          layoutId={`bookmark-desc-${bm.id}`}
          transition={springTransition}
          className={`text-xs line-clamp-2 ${darkMode ? "text-slate-300" : "text-slate-600"}`}
        >
          {bm.description || "点击直达该站点..."}
        </motion.p>
      </a>

      {/* Visual Hierarchy: Level 2 Category Badge & Level 3 Secondary Tags */}
      <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-400 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
          {categoryName && categoryStyle && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCategoryClick?.(bm.categoryId);
              }}
              title={`分类: ${categoryName} (点击筛选)`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors whitespace-nowrap leading-none shrink-0 ${categoryStyle.badge} ${categoryStyle.hover}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${categoryStyle.dot}`} />
              <span>{categoryName}</span>
            </button>
          )}
          {bm.tags && bm.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTagClick?.(t);
              }}
              title={`按标签 #${t} 筛选`}
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-colors whitespace-nowrap leading-none ${
                selectedTag === t
                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                  : darkMode
                    ? "bg-slate-700/60 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                    : "bg-slate-100 text-slate-600 border-slate-200/80 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
        <span className="whitespace-nowrap shrink-0 text-[10.5px]">{bm.clicks || 0} 访问</span>
      </div>
    </motion.div>
  );
};
