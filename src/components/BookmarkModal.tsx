import React, { useState, useEffect } from "react";
import { Bookmark, Category } from "../types";
import { X, Globe, Sparkles, Check, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { recommendCategoryForUrl, CategoryRecommendation } from "../utils/categoryRecommender";
import { isValidWebUrl, getSafeHref } from "../utils/urlSecurity";

interface BookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  categories: Category[];
  bookmarks?: Bookmark[];
  editingBookmark?: Bookmark | null;
  darkMode: boolean;
}

export const BookmarkModal: React.FC<BookmarkModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categories = [],
  bookmarks = [],
  editingBookmark,
  darkMode,
}) => {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [icon, setIcon] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Category recommendation states
  const [recommendation, setRecommendation] = useState<CategoryRecommendation | null>(null);
  const [userManuallySelectedCategory, setUserManuallySelectedCategory] = useState(false);

  // Fallback safe categories if categories array is empty
  const safeCategories = Array.isArray(categories) && categories.length > 0 
    ? categories 
    : [{ id: "cat-default", name: "常用推荐", icon: "Folder", sortOrder: 1, description: "常用基础导航分类" }];

  useEffect(() => {
    if (editingBookmark) {
      setTitle(editingBookmark.title || "");
      setUrl(editingBookmark.url || "");
      setDescription(editingBookmark.description || "");
      setCategoryId(editingBookmark.categoryId || safeCategories[0]?.id || "");
      setIcon(editingBookmark.icon || "");
      setTagsInput(editingBookmark.tags ? editingBookmark.tags.join(", ") : "");
      setIsPinned(!!editingBookmark.isPinned);
      setUserManuallySelectedCategory(true);
      // Run recommendation check for existing URL as reference
      if (editingBookmark.url) {
        const rec = recommendCategoryForUrl({
          url: editingBookmark.url,
          title: editingBookmark.title || "",
          categories: safeCategories,
          bookmarks,
        });
        setRecommendation(rec);
      } else {
        setRecommendation(null);
      }
    } else {
      setTitle("");
      setUrl("");
      setDescription("");
      setCategoryId(safeCategories[0]?.id || "");
      setIcon("");
      setTagsInput("");
      setIsPinned(false);
      setUserManuallySelectedCategory(false);
      setRecommendation(null);
    }
    setErrorMsg("");
  }, [editingBookmark, isOpen, categories, bookmarks]);

  // Derive suggested tags based on recommendation and URL domain
  const suggestedTags = React.useMemo(() => {
    if (!recommendation) return [];
    const catName = recommendation.category.name;
    const catDesc = recommendation.category.description || "";
    const list: string[] = [];

    if (catName.includes("开发") || catName.includes("运维") || catDesc.includes("编程")) {
      list.push("开发", "工具", "开源");
    } else if (catName.includes("AI") || catName.includes("智能") || catDesc.includes("大模型")) {
      list.push("AI", "大模型", "智能工具");
    } else if (catName.includes("设计") || catName.includes("灵感") || catDesc.includes("UI")) {
      list.push("设计", "灵感", "素材");
    } else if (catName.includes("学习") || catName.includes("社区") || catDesc.includes("教程")) {
      list.push("学习", "技术社区", "文档");
    } else if (catName.includes("办公") || catName.includes("协作") || catDesc.includes("效率")) {
      list.push("效率", "办公协作", "团队");
    } else {
      list.push(catName.slice(0, 4), "常用");
    }
    return list;
  }, [recommendation]);

  // Handle URL changes with real-time category recommendation
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);

    if (newUrl.trim().length >= 3) {
      const rec = recommendCategoryForUrl({
        url: newUrl,
        title,
        categories: safeCategories,
        bookmarks,
      });
      setRecommendation(rec);

      // Automatically pre-select recommended category if user hasn't manually overridden it
      if (rec && !userManuallySelectedCategory && !editingBookmark) {
        setCategoryId(rec.category.id);
      }
    } else {
      setRecommendation(null);
    }
  };

  // Handle title changes to refine recommendation
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (url.trim().length >= 3) {
      const rec = recommendCategoryForUrl({
        url,
        title: newTitle,
        categories: safeCategories,
        bookmarks,
      });
      if (rec) {
        setRecommendation(rec);
        if (!userManuallySelectedCategory && !editingBookmark) {
          setCategoryId(rec.category.id);
        }
      }
    }
  };

  // One-click apply recommendation
  const handleApplyRecommendation = () => {
    if (recommendation) {
      setCategoryId(recommendation.category.id);
      setUserManuallySelectedCategory(false);
    }
  };

  const handleAddSuggestedTag = (tag: string) => {
    const currentTags = tagsInput.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean);
    if (!currentTags.includes(tag)) {
      const nextTags = [...currentTags, tag];
      setTagsInput(nextTags.join(", "));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const trimmedUrl = url.trim();
    if (!isValidWebUrl(trimmedUrl)) {
      setErrorMsg("请输入合法的 HTTP/HTTPS 网址 (禁止输入 javascript:, data: 等协议)");
      setLoading(false);
      return;
    }
    const normalizedUrl = getSafeHref(trimmedUrl);

    const tags = tagsInput
      .split(/[,，\s]+/)
      .map(t => t.trim())
      .filter(Boolean);

    const token = localStorage.getItem("omnimark_token");

    const payload = {
      title: title.trim(),
      url: normalizedUrl,
      description: description.trim(),
      categoryId: categoryId || safeCategories[0]?.id,
      icon: icon.trim(),
      tags,
      isPinned,
    };

    try {
      const endpoint = editingBookmark ? `/api/bookmarks/${editingBookmark.id}` : "/api/bookmarks";
      const method = editingBookmark ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSave();
        onClose();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "保存书签失败");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  // Auto-fill title, favicon, and trigger refined recommendation on URL blur
  const handleUrlBlur = () => {
    let cleanUrl = url.trim();
    if (!cleanUrl) return;
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = "https://" + cleanUrl;
      setUrl(cleanUrl);
    }

    let detectedTitle = title;
    try {
      const parsed = new URL(cleanUrl);
      if (!icon) {
        setIcon(`/api/icon-proxy?domain=${parsed.hostname}`);
      }
      if (!title) {
        // Strip www. and capitalize first letter
        const hostClean = parsed.hostname.replace(/^www\./, "");
        detectedTitle = hostClean.charAt(0).toUpperCase() + hostClean.slice(1);
        setTitle(detectedTitle);
      }
    } catch {}

    // Evaluate recommendation with finalized clean URL and detected Title
    const rec = recommendCategoryForUrl({
      url: cleanUrl,
      title: detectedTitle,
      categories: safeCategories,
      bookmarks,
    });
    if (rec) {
      setRecommendation(rec);
      if (!userManuallySelectedCategory && !editingBookmark) {
        setCategoryId(rec.category.id);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* 背景遮罩 */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
      />

      {/* 模态框主体卡片 */}
      <div className={`relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden my-auto transition-all ${
        darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 sm:px-8 sm:py-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="font-bold text-base sm:text-lg">
            {editingBookmark ? "编辑书签" : "添加新书签"}
          </h3>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body with Scroll */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
              {errorMsg}
            </div>
          )}

          <form id="bookmark-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-500">网址 URL *</label>
                {recommendation && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                    <Sparkles className="w-3 h-3 text-blue-500 animate-pulse" />
                    <span>智能分类识别中</span>
                  </span>
                )}
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                onBlur={handleUrlBlur}
                placeholder="https://example.com 或 example.com"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                  darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                }`}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">书签标题 *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="例如：GitHub"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                  darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                }`}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-500">所属分类 *</label>
                  {recommendation && recommendation.category.id === categoryId && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="w-3 h-3" />
                      <span>已推荐最佳分类</span>
                    </span>
                  )}
                </div>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setUserManuallySelectedCategory(true);
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                    darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                  }`}
                >
                  {safeCategories.map(c => {
                    const isRec = recommendation?.category.id === c.id;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name}{isRec ? " ✨ (智能推荐)" : ""}
                      </option>
                    );
                  })}
                </select>

                {/* Recommendation Assistant Card */}
                {recommendation && (
                  <div className="mt-2">
                    {categoryId === recommendation.category.id ? (
                      <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">已智能归类至 <strong>{recommendation.category.name}</strong></span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0 font-medium ml-1.5">
                          {recommendation.confidence}% 匹配
                        </span>
                      </div>
                    ) : (
                      <div className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-between gap-2 text-xs text-blue-700 dark:text-blue-300">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0 animate-pulse" />
                          <div className="min-w-0 truncate">
                            <span>推荐分类：<strong>{recommendation.category.name}</strong></span>
                            <span className="text-[10px] text-blue-600/70 dark:text-blue-400/70 block truncate">
                              {recommendation.reason} ({recommendation.confidence}%)
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyRecommendation}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-[10px] shrink-0 transition-colors shadow-2xs inline-flex items-center gap-1"
                        >
                          <span>采用</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">图标 URL (自动抓取/可自定义)</label>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="留空自动抓取并本地缓存"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                    darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">描述信息</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入简短的站点功能描述..."
                rows={2}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none resize-none transition-all ${
                  darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">标签 (逗号或空格分隔)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="开发, 工具, AI"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                  darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
                }`}
              />

              {/* Quick suggested tags based on recommended category */}
              {suggestedTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5 text-[11px]">
                  <span className="text-slate-400">推荐标签:</span>
                  {suggestedTags.map(tag => {
                    const isAdded = tagsInput.split(/[,，\s]+/).map(t => t.trim()).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        disabled={isAdded}
                        onClick={() => handleAddSuggestedTag(tag)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                          isAdded
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-default"
                            : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/50"
                        }`}
                      >
                        {isAdded ? `✓ ${tag}` : `+ ${tag}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isPinned"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isPinned" className="text-xs font-medium cursor-pointer select-none">
                设为首页置顶推荐 (优先在顶部重要位展现)
              </label>
            </div>
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 sm:px-8 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap leading-none"
          >
            取消
          </button>
          <button
            type="submit"
            form="bookmark-form"
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm shadow-blue-500/20 disabled:opacity-50 transition-colors whitespace-nowrap leading-none"
          >
            {loading ? "保存中..." : "保存书签"}
          </button>
        </div>
      </div>
    </div>
  );
};
