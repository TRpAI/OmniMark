import React, { useState, useEffect } from "react";
import { X, BookOpen, Copy, Check, Terminal } from "lucide-react";

interface ApiDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
}

export const ApiDocsModal: React.FC<ApiDocsModalProps> = ({
  isOpen,
  onClose,
  darkMode,
}) => {
  const [spec, setSpec] = useState<any>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/docs-spec")
        .then(res => res.json())
        .then(data => setSpec(data))
        .catch(err => console.error(err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyCode = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className={`w-full max-w-3xl max-h-[85vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
        darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
      }`}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-lg">API 接口与二次开发文档</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-2">
            <div className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Terminal className="w-4 h-4" />
              <span>OmniMark 开放 API 服务</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              系统提供完整的 RESTful API 接口，支持多端同步、第三方脚本调用、浏览器插件对接以及私有化二次开发。
            </p>
          </div>

          {spec && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Base URL: <code className="text-blue-500">{window.location.origin}/api</code></span>
              </div>

              <div className="space-y-3">
                {spec.endpoints.map((ep: any, idx: number) => {
                  const badgeColor = 
                    ep.method === 'GET' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' :
                    ep.method === 'POST' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' :
                    ep.method === 'PUT' ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
                    'bg-rose-500/10 text-rose-500 border-rose-500/30';

                  return (
                    <div key={idx} className={`p-4 rounded-2xl border space-y-2 ${
                      darkMode ? "bg-slate-800/40 border-slate-800" : "bg-slate-50 border-slate-200"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeColor}`}>
                            {ep.method}
                          </span>
                          <code className="text-xs font-mono font-semibold">{ep.path}</code>
                        </div>
                        <button
                          onClick={() => handleCopyCode(`${window.location.origin}${ep.path}`, idx.toString())}
                          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 text-xs flex items-center gap-1"
                        >
                          {copiedKey === idx.toString() ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="text-[10px]">复制路径</span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ep.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
