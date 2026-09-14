import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bookmark } from "../types";
import { 
  Pin, PinOff, Trash2, ExternalLink, Copy, Check, 
  Edit3, Globe, X, AlertTriangle, Lock 
} from "lucide-react";
import { getCategoryBadgeStyle } from "../utils/categoryBadge";
import { getSafeHref, safeGetHostname, copyToClipboard } from "../utils/urlSecurity";

interface BookmarkContextMenuProps {
  isOpen: boolean;
  bookmark: Bookmark | null;
  position: { x: number; y: number };
  darkMode: boolean;
  isLoggedIn?: boolean;
  onClose: () => void;
  onTogglePin: (bm: Bookmark) => Promise<boolean | void>;
  onDelete: (bm: Bookmark) => Promise<boolean | void>;
  onEdit?: (bm: Bookmark) => void;
  onBookmarkClick: (id: string, url: string) => void;
  onOpenLogin?: () => void;
  categoryName?: string;
}

export const BookmarkContextMenu: React.FC<BookmarkContextMenuProps> = ({
  isOpen,
  bookmark,
  position,
  darkMode,
  isLoggedIn,
  onClose,
  onTogglePin,
  onDelete,
  onEdit,
  onBookmarkClick,
  onOpenLogin,
  categoryName,
}) => {
  const categoryStyle = categoryName ? getCategoryBadgeStyle(categoryName) : null;
  const [copied, setCopied] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Detect mobile device or small viewport
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 640;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Reset internal states when opened with a new bookmark
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setIsConfirmingDelete(false);
      setIsProcessing(false);
      setAuthNotice(null);
    }
  }, [isOpen, bookmark?.id]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !bookmark) return null;

  const safeHostname = safeGetHostname(bookmark.url);
  const safeUrl = getSafeHref(bookmark.url);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const textToCopy = safeUrl !== "#" ? safeUrl : bookmark.url;
      const success = await copyToClipboard(textToCopy);
      if (success) {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (safeUrl !== "#") {
      onBookmarkClick(bookmark.id, safeUrl);
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    }
    onClose();
  };

  const handlePinAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProcessing(true);
    setAuthNotice(null);
    try {
      const res = await onTogglePin(bookmark);
      if (res === false) {
        setAuthNotice("该操作需要管理员权限，请先登录");
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      setAuthNotice("操作失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }
    setIsProcessing(true);
    setAuthNotice(null);
    try {
      const res = await onDelete(bookmark);
      if (res === false) {
        setAuthNotice("该操作需要管理员权限，请先登录");
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      setAuthNotice("删除失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
    if (onEdit) {
      onEdit(bookmark);
    }
  };

  // Position calculation for desktop popover
  const menuWidth = 260;
  const menuHeight = 320;
  let posX = position.x;
  let posY = position.y;

  if (typeof window !== "undefined") {
    if (posX + menuWidth > window.innerWidth - 16) {
      posX = window.innerWidth - menuWidth - 16;
    }
    if (posY + menuHeight > window.innerHeight - 16) {
      posY = Math.max(16, posY - menuHeight);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-xs"
        />

        {/* Menu Container */}
        {isMobile ? (
          // Mobile Bottom Sheet
          <div className="absolute inset-x-0 bottom-0 pointer-events-none flex justify-center">
            <motion.div
              initial={{ y: "100%", opacity: 0.8 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 380 }}
              onClick={(e) => e.stopPropagation()}
              className={`pointer-events-auto w-full max-w-lg rounded-t-3xl border-t border-x p-5 pb-8 shadow-2xl ${
                darkMode ? "bg-slate-900 border-slate-700/80 text-white" : "bg-white border-slate-200 text-slate-900"
              }`}
            >
              {/* Drag Handle Bar */}
              <div className="w-12 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-4" />

              {/* Bookmark Card Summary Header */}
              <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-2xs">
                    {bookmark.icon ? (
                      <img
                        src={bookmark.icon}
                        alt=""
                        className="w-5 h-5 object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <Globe className="w-5 h-5 text-blue-500 shrink-0" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-bold text-sm truncate">{bookmark.title}</h4>
                      {bookmark.isPinned && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20 shrink-0">
                          已置顶
                        </span>
                      )}
                      {categoryName && categoryStyle && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap leading-none shrink-0 ${categoryStyle.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${categoryStyle.dot}`} />
                          <span>{categoryName}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-slate-400 truncate">{safeHostname}</p>
                      {bookmark.tags && bookmark.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {bookmark.tags.slice(0, 3).map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Auth / Permission Notice if needed */}
              {authNotice && (
                <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>{authNotice}</span>
                  </div>
                  {onOpenLogin && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenLogin();
                      }}
                      className="px-2 py-1 rounded-lg bg-amber-600 text-white font-medium text-[11px] shrink-0"
                    >
                      登录
                    </button>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-1">
                {/* 1. Toggle Pin */}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handlePinAction}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-left transition-colors ${
                    bookmark.isPinned
                      ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${bookmark.isPinned ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
                      {bookmark.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="font-semibold text-xs sm:text-sm block">
                        {bookmark.isPinned ? "取消置顶" : "置顶书签"}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {bookmark.isPinned ? "将该书签恢复到普通排序" : "优先在当前分类顶部展示"}
                      </span>
                    </div>
                  </div>
                  {bookmark.isPinned && (
                    <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">已置顶</span>
                  )}
                </button>

                {/* 2. Open in New Tab */}
                <button
                  type="button"
                  onClick={handleOpen}
                  className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-xs sm:text-sm block">在新标签页中打开</span>
                      <span className="text-[11px] text-slate-400 block">{safeHostname}</span>
                    </div>
                  </div>
                </button>

                {/* 3. Copy Link */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="font-semibold text-xs sm:text-sm block">
                        {copied ? "已复制到剪贴板" : "复制网址链接"}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate max-w-[200px]">
                        {bookmark.url}
                      </span>
                    </div>
                  </div>
                  {copied && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">已复制</span>
                  )}
                </button>

                {/* 4. Edit Bookmark (if available) */}
                {onEdit && (
                  <button
                    type="button"
                    onClick={handleEditAction}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <Edit3 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-xs sm:text-sm block">编辑书签信息</span>
                        <span className="text-[11px] text-slate-400 block">修改标题、分类、图标或标签</span>
                      </div>
                    </div>
                  </button>
                )}

                {/* 5. Delete Bookmark */}
                <div className="pt-1">
                  {isConfirmingDelete ? (
                    <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/25 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>确定要删除书签「{bookmark.title}」吗？此操作无法撤销。</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={handleDeleteAction}
                          className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-xs transition-colors shadow-xs"
                        >
                          {isProcessing ? "正在删除..." : "确认删除"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsConfirmingDelete(false)}
                          className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleDeleteAction}
                      className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-semibold text-xs sm:text-sm block">删除该书签</span>
                          <span className="text-[11px] text-red-500/70 dark:text-red-400/70 block">
                            从当前分类中永久移除
                          </span>
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          // Desktop Floating Popover
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            style={{ left: posX, top: posY }}
            onClick={(e) => e.stopPropagation()}
            className={`absolute z-50 w-64 rounded-2xl border p-2 shadow-2xl ${
              darkMode ? "bg-slate-900 border-slate-700/80 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            {/* Header */}
            <div className="px-2.5 py-2 mb-1 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-1 shrink-0">
                {bookmark.icon ? (
                  <img
                    src={bookmark.icon}
                    alt=""
                    className="w-4 h-4 object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-bold text-xs truncate">{bookmark.title}</h4>
                  {bookmark.isPinned && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20 shrink-0">
                      置顶
                    </span>
                  )}
                  {categoryName && categoryStyle && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9.5px] font-medium border whitespace-nowrap leading-none shrink-0 ${categoryStyle.badge}`}>
                      <span className={`w-1 h-1 rounded-full shrink-0 ${categoryStyle.dot}`} />
                      <span>{categoryName}</span>
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">{safeHostname}</p>
              </div>
            </div>

            {/* Auth Notice */}
            {authNotice && (
              <div className="mx-1 mb-1 p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-[11px] text-amber-700 dark:text-amber-300">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span className="truncate">{authNotice}</span>
                </div>
                {onOpenLogin && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenLogin();
                    }}
                    className="px-1.5 py-0.5 rounded bg-amber-600 text-white font-medium text-[10px] shrink-0"
                  >
                    登录
                  </button>
                )}
              </div>
            )}

            {/* Items */}
            <div className="space-y-0.5 text-xs">
              {/* Toggle Pin */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handlePinAction}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors ${
                  bookmark.isPinned
                    ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {bookmark.isPinned ? (
                  <PinOff className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Pin className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="font-medium flex-1">
                  {bookmark.isPinned ? "取消置顶" : "置顶书签"}
                </span>
              </button>

              {/* Open in new tab */}
              <button
                type="button"
                onClick={handleOpen}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                <span className="font-medium flex-1">新标签页打开</span>
              </button>

              {/* Copy URL */}
              <button
                type="button"
                onClick={handleCopy}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span className="font-medium flex-1">{copied ? "已复制链接" : "复制链接"}</span>
              </button>

              {/* Edit */}
              {onEdit && (
                <button
                  type="button"
                  onClick={handleEditAction}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium flex-1">编辑书签</span>
                </button>
              )}

              {/* Delete */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                {isConfirmingDelete ? (
                  <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1.5">
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-medium leading-tight">
                      确认删除该书签？
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handleDeleteAction}
                        className="flex-1 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-[11px] transition-colors"
                      >
                        {isProcessing ? "删除中" : "确认"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsConfirmingDelete(false)}
                        className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleDeleteAction}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="font-medium flex-1">删除书签</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
};
