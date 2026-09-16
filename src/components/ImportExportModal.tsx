import React, { useState } from "react";
import { safeFetchJson } from "../utils/security";
import { X, Download, Upload, FileText, Code } from "lucide-react";

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onRefreshData: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  onRefreshData,
}) => {
  const [importText, setImportText] = useState("");
  const [importType, setImportType] = useState<"json" | "html">("html");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExport = (format: "json" | "html") => {
    window.open(`/api/export?format=${format}`, "_blank");
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) return;
    setLoading(true);
    setMessage(null);

    const token = localStorage.getItem("omnimark_token");

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: importType,
          content: importText,
          mode: "merge"
        })
      });
      const data = await safeFetchJson<{ success?: boolean; message?: string; error?: string }>(res, { error: "导入响应异常" });
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || "导入成功！" });
        setImportText("");
        onRefreshData();
      } else {
        setMessage({ type: 'error', text: data.error || "导入失败" });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || "网络请求异常" });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      setImportType('html');
    } else {
      setImportType('json');
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (typeof evt.target?.result === 'string') {
        setImportText(evt.target.result);
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className={`w-full max-w-xl rounded-3xl border p-6 sm:p-8 shadow-2xl space-y-6 ${
        darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
      }`}>
        <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-500" />
            <span>数据备份与浏览器书签导入导出</span>
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Export Section */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="font-bold text-sm">导出书签数据</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              支持导出为标准 Netscape HTML 书签文件（可直接导入 Chrome / Edge / Safari / Firefox 等浏览器），或完整 JSON 数据库备份。
            </p>
            <div className="flex items-center gap-2.5 pt-1 flex-wrap">
              <button
                onClick={() => handleExport("html")}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20 whitespace-nowrap leading-none"
              >
                <FileText className="w-4 h-4" />
                <span>导出浏览器 HTML 书签</span>
              </button>
              <button
                onClick={() => handleExport("json")}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap leading-none text-slate-700 dark:text-slate-200"
              >
                <Code className="w-4 h-4" />
                <span>导出 JSON 备份</span>
              </button>
            </div>
          </div>

          {/* Import Section */}
          <form onSubmit={handleImportSubmit} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="font-bold text-sm">导入书签数据</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              上传浏览器导出的 HTML 书签或 JSON 备份文件，系统将智能提取文件夹与书签信息并自动抓取图标。
            </p>

            {message && (
              <div className={`p-3 rounded-xl text-xs font-medium ${
                message.type === 'success' 
                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
              }`}>
                {message.text}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500">格式:</label>
                <select
                  value={importType}
                  onChange={(e) => setImportType(e.target.value as any)}
                  className={`px-3 py-1.5 rounded-xl border text-xs outline-none ${
                    darkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <option value="html">浏览器 HTML 书签</option>
                  <option value="json">JSON 备份文件</option>
                </select>
              </div>

              <label className="cursor-pointer px-3 py-1.5 rounded-xl border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-500/10 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap leading-none">
                <Upload className="w-3.5 h-3.5" />
                <span>选择本地文件</span>
                <input type="file" accept=".html,.htm,.json" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="或者在此直接粘贴 HTML 或 JSON 代码..."
                rows={4}
                className={`w-full p-3 rounded-xl border text-xs outline-none resize-none font-mono ${
                  darkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200"
                }`}
                required
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50 whitespace-nowrap leading-none"
              >
                {loading ? "导入中..." : "开始执行导入"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
