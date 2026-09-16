import React, { useState, useEffect } from "react";
import { Category } from "../types";
import { safeFetchJson } from "../utils/security";
import { X, FolderPlus } from "lucide-react";

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editingCategory?: Category | null;
  darkMode: boolean;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingCategory,
  darkMode,
}) => {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Folder");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name);
      setIcon(editingCategory.icon || "Folder");
      setDescription(editingCategory.description || "");
    } else {
      setName("");
      setIcon("Folder");
      setDescription("");
    }
    setErrorMsg("");
  }, [editingCategory, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const token = localStorage.getItem("omnimark_token");

    try {
      const endpoint = editingCategory ? `/api/categories/${editingCategory.id}` : "/api/categories";
      const method = editingCategory ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: name.trim(), icon, description: description.trim() }),
      });

      if (res.ok) {
        onSave();
        onClose();
      } else {
        const data = await safeFetchJson(res, { error: "保存分类失败" });
        setErrorMsg(data.error || "保存分类失败");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "请求异常");
    } finally {
      setLoading(false);
    }
  };

  const iconsList = [
    { label: "常用", name: "Star" },
    { label: "开发", name: "Code" },
    { label: "AI科技", name: "Sparkles" },
    { label: "设计", name: "Palette" },
    { label: "学习", name: "BookOpen" },
    { label: "通用", name: "Folder" }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-3xl border p-6 sm:p-8 shadow-2xl space-y-6 ${
        darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
      }`}>
        <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-blue-500" />
            <span>{editingCategory ? "编辑分类" : "新建分类"}</span>
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">分类名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：开发运维、设计灵感"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
              }`}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">图标类型</label>
            <div className="grid grid-cols-3 gap-2">
              {iconsList.map(ic => (
                <button
                  type="button"
                  key={ic.name}
                  onClick={() => setIcon(ic.name)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all text-center whitespace-nowrap leading-none ${
                    icon === ic.name 
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                      : darkMode ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {ic.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">分类描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简短介绍该分类包含的网址方向..."
              rows={2}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none resize-none transition-all ${
                darkMode ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 focus:border-blue-500"
              }`}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap leading-none"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm shadow-blue-500/20 disabled:opacity-50 transition-colors whitespace-nowrap leading-none"
            >
              {loading ? "保存中..." : "保存分类"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
