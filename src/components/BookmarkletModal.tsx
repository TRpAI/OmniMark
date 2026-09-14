import React, { useState } from "react";
import { X, Sparkles, Copy, Check } from "lucide-react";

interface BookmarkletModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
}

export const BookmarkletModal: React.FC<BookmarkletModalProps> = ({
  isOpen,
  onClose,
  darkMode,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const bookmarkletCode = `javascript:(function(){const url=window.location.href;const title=document.title;const desc=document.querySelector('meta[name="description"]')?.content||'';fetch('${window.location.origin}/api/plugin/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,title,description:desc})}).then(r=>r.json()).then(d=>{alert('成功采集到 OmniMark：'+title);}).catch(e=>alert('采集失败：'+e.message);})();`;

  const handleCopy = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-3xl border p-6 sm:p-8 shadow-2xl space-y-6 ${
        darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
      }`}>
        <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <span>一键网页采集书签插件 / 书签栏工具</span>
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            无需安装繁重扩展插件，只需直接拖拽下方蓝色按钮到浏览器的<b>书签栏</b>。在访问任意网页时轻点该书签，即可一键采集当前页面标题、网址和描述到您的 OmniMark 导航！
          </p>

          <div className="p-5 rounded-2xl border border-blue-500/30 bg-blue-500/5 text-center space-y-3">
            <a
              href={bookmarkletCode}
              onClick={(e) => {
                // Prevent navigating if clicked directly
                e.preventDefault();
                alert("请将此按钮直接拖拽到浏览器的书签栏中，或使用下方的复制代码功能！");
              }}
              draggable
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/25 cursor-grab active:cursor-grabbing hover:bg-blue-700 transition-colors select-none"
              title="按住鼠标左键，拖动此按钮到浏览器书签栏"
            >
              <Sparkles className="w-4 h-4" />
              <span>📑 采集到 OmniMark (拖拽到书签栏)</span>
            </a>
            <p className="text-[11px] text-slate-400">
              💡 提示：按住左键将上方按钮拖拽到浏览器书签栏（按 Ctrl+Shift+B 或 Cmd+Shift+B 显示书签栏）
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-500">或者手动复制 JavaScript 书签代码：</span>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs whitespace-nowrap leading-none transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "已复制代码" : "复制代码"}</span>
              </button>
            </div>
            <textarea
              readOnly
              value={bookmarkletCode}
              rows={3}
              className={`w-full p-3 rounded-xl border font-mono text-[11px] outline-none resize-none ${
                darkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
